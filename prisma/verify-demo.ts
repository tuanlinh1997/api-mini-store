/* Consistency checks for demo data (`npm run seed:demo:verify`). Prints PASS/FAIL per check
 * and exits with code 1 if any check fails. Read-only.
 * Target another database with `--database-url=mysql://...` or VERIFY_DATABASE_URL. */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { PrismaClient } from '@prisma/client';

interface Check {
  name: string;
  /** SQL returning the number of offending rows (0 = PASS) in a column named `bad`. */
  sql: string;
}

const VN_DAY = "DATE_FORMAT(DATE_ADD(%COLUMN%, INTERVAL 7 HOUR), '%Y%m%d')";

const CHECKS: Check[] = [
  {
    name: 'every product: stock_qty = sum(movements.quantity_change)',
    sql: `SELECT COUNT(*) AS bad FROM products p
          LEFT JOIN (SELECT product_id, SUM(quantity_change) AS total FROM inventory_movements GROUP BY product_id) m
            ON m.product_id = p.id
          WHERE p.stock_qty <> COALESCE(m.total, 0)`,
  },
  { name: 'no negative stock', sql: 'SELECT COUNT(*) AS bad FROM products WHERE stock_qty < 0' },
  {
    name: 'running stock never negative at any movement (chronological replay)',
    sql: `SELECT COUNT(*) AS bad FROM (
            SELECT SUM(quantity_change) OVER (PARTITION BY product_id ORDER BY created_at, id) AS running
            FROM inventory_movements) r WHERE r.running < 0`,
  },
  {
    name: 'sales: subtotal - discount = total',
    sql: 'SELECT COUNT(*) AS bad FROM sales WHERE subtotal - discount_amount <> total',
  },
  {
    name: 'sales: sum(items.line_total) = total',
    sql: `SELECT COUNT(*) AS bad FROM sales s
          LEFT JOIN (SELECT sale_id, SUM(line_total) AS t FROM sale_items GROUP BY sale_id) i ON i.sale_id = s.id
          WHERE COALESCE(i.t, -1) <> s.total`,
  },
  {
    name: 'sales: sum(items.discount_amount) = discount_amount',
    sql: `SELECT COUNT(*) AS bad FROM sales s
          LEFT JOIN (SELECT sale_id, SUM(discount_amount) AS d FROM sale_items GROUP BY sale_id) i ON i.sale_id = s.id
          WHERE COALESCE(i.d, -1) <> s.discount_amount`,
  },
  {
    name: 'sale items: line_total = quantity * unit_price - discount',
    sql: 'SELECT COUNT(*) AS bad FROM sale_items WHERE line_total <> quantity * unit_price - discount_amount',
  },
  {
    name: 'sales: sum(payments.amount) = total',
    sql: `SELECT COUNT(*) AS bad FROM sales s
          LEFT JOIN (SELECT sale_id, SUM(amount) AS a FROM payments GROUP BY sale_id) p ON p.sale_id = s.id
          WHERE COALESCE(p.a, -1) <> s.total`,
  },
  {
    name: 'payments: cash change = tendered - amount; non-cash tendered = amount and change = 0',
    sql: `SELECT COUNT(*) AS bad FROM payments
          WHERE change_amount <> tendered_amount - amount
             OR (method <> 'CASH' AND (tendered_amount <> amount OR change_amount <> 0))`,
  },
  {
    name: 'customers: loyalty_points = sum(sales.points_earned)',
    sql: `SELECT COUNT(*) AS bad FROM customers c
          LEFT JOIN (SELECT customer_id, SUM(points_earned) AS pts FROM sales GROUP BY customer_id) s
            ON s.customer_id = c.id
          WHERE c.loyalty_points <> COALESCE(s.pts, 0)`,
  },
  {
    name: 'sales: points_earned = floor(total / 10000) with a customer, 0 without',
    sql: `SELECT COUNT(*) AS bad FROM sales
          WHERE points_earned <> IF(customer_id IS NULL, 0, FLOOR(total / 10000))`,
  },
  {
    name: 'invoice numbers unique',
    sql: 'SELECT COUNT(*) - COUNT(DISTINCT invoice_no) AS bad FROM sales',
  },
  {
    name: 'invoice number date = sold_at VN day and sequence = per-day order',
    sql: `SELECT COUNT(*) AS bad FROM (
            SELECT invoice_no, sold_at,
                   ROW_NUMBER() OVER (PARTITION BY ${VN_DAY.replace('%COLUMN%', 'sold_at')} ORDER BY sold_at, id) AS rn
            FROM sales) x
          WHERE SUBSTRING(invoice_no, 3, 8) <> ${VN_DAY.replace('%COLUMN%', 'x.sold_at')}
             OR CAST(SUBSTRING(invoice_no, 11) AS UNSIGNED) <> x.rn`,
  },
  {
    name: 'purchase numbers: date = created_at VN day, unique',
    sql: `SELECT COUNT(*) AS bad FROM purchases
          WHERE SUBSTRING(purchase_no, 3, 8) <> ${VN_DAY.replace('%COLUMN%', 'created_at')}`,
  },
  {
    name: 'stock count numbers: date = created_at VN day',
    sql: `SELECT COUNT(*) AS bad FROM stock_counts
          WHERE SUBSTRING(count_no, 3, 8) <> ${VN_DAY.replace('%COLUMN%', 'created_at')}`,
  },
  {
    name: 'document_sequences last_value = highest issued number per key',
    sql: `SELECT COUNT(*) AS bad FROM document_sequences d
          LEFT JOIN (
            SELECT CONCAT('HD', SUBSTRING(invoice_no, 3, 8)) AS k, MAX(CAST(SUBSTRING(invoice_no, 11) AS UNSIGNED)) AS m FROM sales GROUP BY k
            UNION ALL
            SELECT CONCAT('PN', SUBSTRING(purchase_no, 3, 8)), MAX(CAST(SUBSTRING(purchase_no, 11) AS UNSIGNED)) FROM purchases GROUP BY 1
            UNION ALL
            SELECT CONCAT('KK', SUBSTRING(count_no, 3, 8)), MAX(CAST(SUBSTRING(count_no, 11) AS UNSIGNED)) FROM stock_counts GROUP BY 1
            UNION ALL
            SELECT 'KH', COUNT(*) FROM customers
          ) n ON n.k = d.sequence_key
          WHERE d.\`last_value\` <> COALESCE(n.m, -1)`,
  },
  {
    name: 'RECEIVED purchases: a PURCHASE movement per item with the same quantity',
    sql: `SELECT COUNT(*) AS bad FROM purchase_items i
          JOIN purchases p ON p.id = i.purchase_id AND p.status = 'RECEIVED'
          LEFT JOIN inventory_movements m ON m.reference_type = 'PURCHASE' AND m.reference_id = p.id
                 AND m.product_id = i.product_id AND m.movement_type = 'PURCHASE' AND m.quantity_change = i.quantity
          WHERE m.id IS NULL`,
  },
  {
    name: 'PURCHASE movements belong only to RECEIVED purchases (DRAFT/CANCELLED have none)',
    sql: `SELECT COUNT(*) AS bad FROM inventory_movements m
          LEFT JOIN purchases p ON p.id = m.reference_id AND p.status = 'RECEIVED'
          WHERE m.reference_type = 'PURCHASE' AND p.id IS NULL`,
  },
  {
    name: 'purchases: received_at set only when RECEIVED; total = sum(items)',
    sql: `SELECT COUNT(*) AS bad FROM purchases p
          LEFT JOIN (SELECT purchase_id, SUM(line_total) AS t FROM purchase_items GROUP BY purchase_id) i ON i.purchase_id = p.id
          WHERE (p.status = 'RECEIVED') <> (p.received_at IS NOT NULL) OR p.total <> COALESCE(i.t, -1)`,
  },
  {
    name: 'SALE movements: one per sale item with matching negative quantity',
    sql: `SELECT COUNT(*) AS bad FROM sale_items i
          LEFT JOIN inventory_movements m ON m.reference_type = 'SALE' AND m.reference_id = i.sale_id
                 AND m.product_id = i.product_id AND m.quantity_change = -i.quantity
          WHERE m.id IS NULL`,
  },
  {
    name: 'stock counts: difference = counted - system; ADJUSTMENT movement iff difference <> 0',
    sql: `SELECT COUNT(*) AS bad FROM stock_counts c
          LEFT JOIN inventory_movements m ON m.reference_type = 'STOCK_COUNT' AND m.reference_id = c.id
                 AND m.movement_type = 'ADJUSTMENT' AND m.quantity_change = c.difference
          WHERE c.difference <> c.counted_qty - c.system_qty
             OR (c.difference <> 0 AND m.id IS NULL) OR (c.difference = 0 AND m.id IS NOT NULL)`,
  },
  {
    name: 'timestamps: paid_at = sold_at; movements dated at their documents',
    sql: `SELECT COUNT(*) AS bad FROM payments p JOIN sales s ON s.id = p.sale_id WHERE p.paid_at <> s.sold_at`,
  },
  {
    name: 'movements reference_id exists in the referenced table',
    sql: `SELECT COUNT(*) AS bad FROM inventory_movements m
          WHERE (m.reference_type = 'SALE' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = m.reference_id))
             OR (m.reference_type = 'PURCHASE' AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = m.reference_id))
             OR (m.reference_type = 'STOCK_COUNT' AND NOT EXISTS (SELECT 1 FROM stock_counts c WHERE c.id = m.reference_id))`,
  },
  {
    name: 'barcodes: valid EAN-13 with 893 prefix',
    sql: `SELECT COUNT(*) AS bad FROM products
          WHERE barcode IS NOT NULL AND (
            CHAR_LENGTH(barcode) <> 13 OR barcode NOT LIKE '893%' OR
            MOD(10 - MOD(
              SUBSTRING(barcode,1,1) + SUBSTRING(barcode,3,1) + SUBSTRING(barcode,5,1) + SUBSTRING(barcode,7,1) +
              SUBSTRING(barcode,9,1) + SUBSTRING(barcode,11,1) +
              3 * (SUBSTRING(barcode,2,1) + SUBSTRING(barcode,4,1) + SUBSTRING(barcode,6,1) + SUBSTRING(barcode,8,1) +
                   SUBSTRING(barcode,10,1) + SUBSTRING(barcode,12,1)), 10), 10) <> SUBSTRING(barcode,13,1))`,
  },
];

async function main(): Promise<void> {
  // Optional override so the same checks can run against a restored copy of the database.
  const { values } = parseArgs({ options: { 'database-url': { type: 'string' } } });
  const databaseUrl = values['database-url'] ?? process.env.VERIFY_DATABASE_URL;
  const prisma = new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
  let failures = 0;
  try {
    for (const check of CHECKS) {
      const rows = await prisma.$queryRawUnsafe<{ bad: bigint | number }[]>(check.sql);
      const bad = Number(rows[0]?.bad ?? 0);
      const passed = bad === 0;
      failures += passed ? 0 : 1;
      console.log(
        `${passed ? 'PASS' : 'FAIL'}  ${check.name}${passed ? '' : `  (${bad} offending rows)`}`,
      );
    }
    console.log(
      failures === 0
        ? `\nAll ${CHECKS.length} checks passed.`
        : `\n${failures} of ${CHECKS.length} checks FAILED.`,
    );
  } finally {
    await prisma.$disconnect();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
