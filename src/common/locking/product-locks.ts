import { Prisma } from '@prisma/client';

import { Decimal } from 'src/common/money/decimal';
import { TransactionClient } from 'src/prisma/prisma.service';

export interface LockedProduct {
  id: number;
  sku: string;
  name: string;
  unit: string;
  salePrice: Decimal;
  costPrice: Decimal;
  stockQty: Decimal;
  isActive: boolean;
}

interface LockedProductRow {
  id: number;
  sku: string;
  name: string;
  unit: string;
  sale_price: Prisma.Decimal;
  cost_price: Prisma.Decimal;
  stock_qty: Prisma.Decimal;
  is_active: number | boolean | bigint;
}

/**
 * Pessimistic row locks (SELECT ... FOR UPDATE) on the given products, always acquired in
 * ascending id order so concurrent checkouts / receipts cannot deadlock each other.
 * Must run inside an interactive transaction; locks are released on commit or rollback.
 * Products that do not exist are simply absent from the returned map.
 */
export async function lockProductsForUpdate(
  tx: TransactionClient,
  productIds: readonly number[],
): Promise<Map<number, LockedProduct>> {
  const orderedIds = [...new Set(productIds)].sort((a, b) => a - b);
  if (orderedIds.length === 0) {
    return new Map();
  }
  const rows = await tx.$queryRaw<LockedProductRow[]>`
    SELECT id, sku, name, unit, sale_price, cost_price, stock_qty, is_active
    FROM products
    WHERE id IN (${Prisma.join(orderedIds)})
    ORDER BY id
    FOR UPDATE`;
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        salePrice: new Decimal(row.sale_price),
        costPrice: new Decimal(row.cost_price),
        stockQty: new Decimal(row.stock_qty),
        isActive: Number(row.is_active) === 1,
      },
    ]),
  );
}
