import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Decimal, sumDecimals, ZERO } from 'src/common/money/decimal';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import {
  MAX_REPORT_RANGE_DAYS,
  STORE_UTC_OFFSET_HOURS,
  toUtcRange,
  UtcRange,
} from 'src/common/time/vn-time';
import { escapeLike } from 'src/common/validation/validation';
import { PrismaService } from 'src/prisma/prisma.service';

import {
  InventoryReportQueryDto,
  PeriodReportQueryDto,
  ReportGrouping,
  TopProductSort,
  TopProductsQueryDto,
  ReportRangeQueryDto,
} from './dto/reports.dto';

const PERCENT = 100;
const MARGIN_DECIMAL_PLACES = 2;

/** Whitelisted SQL fragments: never built from request text. */
const PERIOD_FORMATS: Record<ReportGrouping, string> = { day: '%Y-%m-%d', month: '%Y-%m' };
const TOP_PRODUCT_ORDER: Record<TopProductSort, string> = {
  quantity: 'quantity_sold DESC, revenue DESC',
  revenue: 'revenue DESC, quantity_sold DESC',
};

export interface ReportHeader {
  from: string;
  to: string;
  generatedAt: Date;
}

interface RevenueRow {
  period: string;
  invoice_count: bigint;
  gross_sales: Prisma.Decimal;
  discount_amount: Prisma.Decimal;
  net_revenue: Prisma.Decimal;
}

interface ProfitRow {
  period: string;
  invoice_count: bigint;
  revenue: Prisma.Decimal;
  cogs: Prisma.Decimal;
}

interface TopProductRow {
  product_id: number;
  sku: string;
  name: string;
  quantity_sold: Prisma.Decimal;
  revenue: Prisma.Decimal;
}

interface InventoryRow {
  id: number;
  sku: string;
  name: string;
  unit: string;
  stock_qty: Prisma.Decimal;
  cost_price: Prisma.Decimal;
  stock_value: Prisma.Decimal;
  reorder_level: Prisma.Decimal;
  is_active: number | boolean | bigint;
  qty_in: Prisma.Decimal;
  qty_out: Prisma.Decimal;
  qty_adjusted: Prisma.Decimal;
}

interface InventoryTotalsRow {
  product_count: bigint;
  total_stock_value: Prisma.Decimal;
  low_stock_count: Prisma.Decimal | bigint;
}

interface MovementTotalsRow {
  qty_in: Prisma.Decimal;
  qty_out: Prisma.Decimal;
  qty_adjusted: Prisma.Decimal;
}

export interface RevenueReport extends ReportHeader {
  groupBy: ReportGrouping;
  rows: {
    period: string;
    invoiceCount: number;
    grossSales: Decimal;
    discountAmount: Decimal;
    netRevenue: Decimal;
  }[];
  totals: {
    invoiceCount: number;
    grossSales: Decimal;
    discountAmount: Decimal;
    netRevenue: Decimal;
  };
}

export interface GrossProfitReport extends ReportHeader {
  groupBy: ReportGrouping;
  rows: ProfitFigures[];
  totals: Omit<ProfitFigures, 'period'>;
}

interface ProfitFigures {
  period: string;
  invoiceCount: number;
  revenue: Decimal;
  cogs: Decimal;
  grossProfit: Decimal;
  marginPercent: Decimal;
}

export interface TopProductsReport extends ReportHeader {
  sortBy: TopProductSort;
  limit: number;
  rows: {
    rank: number;
    productId: number;
    sku: string;
    name: string;
    quantitySold: Decimal;
    revenue: Decimal;
  }[];
}

export interface InventoryReport extends ReportHeader {
  summary: {
    productCount: number;
    totalStockValue: Decimal;
    lowStockCount: number;
    movements: { qtyIn: Decimal; qtyOut: Decimal; qtyAdjusted: Decimal };
  };
  products: Page<{
    productId: number;
    sku: string;
    name: string;
    unit: string;
    stockQty: Decimal;
    costPrice: Decimal;
    stockValue: Decimal;
    reorderLevel: Decimal;
    isLowStock: boolean;
    isActive: boolean;
    qtyIn: Decimal;
    qtyOut: Decimal;
    qtyAdjusted: Decimal;
  }>;
}

function periodExpression(groupBy: ReportGrouping): Prisma.Sql {
  const format = PERIOD_FORMATS[groupBy];
  return Prisma.raw(
    `DATE_FORMAT(DATE_ADD(s.sold_at, INTERVAL ${STORE_UTC_OFFSET_HOURS} HOUR), '${format}')`,
  );
}

function marginPercent(grossProfit: Decimal, revenue: Decimal): Decimal {
  return revenue.isZero()
    ? ZERO
    : grossProfit
        .div(revenue)
        .times(PERCENT)
        .toDecimalPlaces(MARGIN_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

function toProfitFigures(
  period: string,
  invoiceCount: number,
  revenue: Decimal,
  cogs: Decimal,
): ProfitFigures {
  const grossProfit = revenue.minus(cogs);
  return {
    period,
    invoiceCount,
    revenue,
    cogs,
    grossProfit,
    marginPercent: marginPercent(grossProfit, revenue),
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async revenue(query: PeriodReportQueryDto): Promise<RevenueReport> {
    const range = this.resolveRange(query);
    const period = periodExpression(query.groupBy);
    const rows = await this.prisma.$queryRaw<RevenueRow[]>`
      SELECT ${period} AS period, COUNT(*) AS invoice_count,
             SUM(s.subtotal) AS gross_sales, SUM(s.discount_amount) AS discount_amount,
             SUM(s.total) AS net_revenue
      FROM sales s
      WHERE s.status = 'PAID' AND s.sold_at >= ${range.start} AND s.sold_at < ${range.endExclusive}
      GROUP BY period
      ORDER BY period`;
    const mapped = rows.map((row) => ({
      period: row.period,
      invoiceCount: Number(row.invoice_count),
      grossSales: new Decimal(row.gross_sales),
      discountAmount: new Decimal(row.discount_amount),
      netRevenue: new Decimal(row.net_revenue),
    }));
    return {
      ...this.header(range),
      groupBy: query.groupBy,
      rows: mapped,
      totals: {
        invoiceCount: mapped.reduce((sum, row) => sum + row.invoiceCount, 0),
        grossSales: sumDecimals(mapped.map((row) => row.grossSales)),
        discountAmount: sumDecimals(mapped.map((row) => row.discountAmount)),
        netRevenue: sumDecimals(mapped.map((row) => row.netRevenue)),
      },
    };
  }

  async topProducts(query: TopProductsQueryDto): Promise<TopProductsReport> {
    const range = this.resolveRange(query);
    const orderBy = Prisma.raw(TOP_PRODUCT_ORDER[query.sortBy]);
    const rows = await this.prisma.$queryRaw<TopProductRow[]>`
      SELECT si.product_id, p.sku, p.name,
             SUM(si.quantity) AS quantity_sold, SUM(si.line_total) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status = 'PAID' AND s.sold_at >= ${range.start} AND s.sold_at < ${range.endExclusive}
      GROUP BY si.product_id, p.sku, p.name
      ORDER BY ${orderBy}, si.product_id
      LIMIT ${query.limit}`;
    return {
      ...this.header(range),
      sortBy: query.sortBy,
      limit: query.limit,
      rows: rows.map((row, index) => ({
        rank: index + 1,
        productId: row.product_id,
        sku: row.sku,
        name: row.name,
        quantitySold: new Decimal(row.quantity_sold),
        revenue: new Decimal(row.revenue),
      })),
    };
  }

  /** BR8: revenue (after discount allocation) minus COGS captured at sale time. */
  async grossProfit(query: PeriodReportQueryDto): Promise<GrossProfitReport> {
    const range = this.resolveRange(query);
    const period = periodExpression(query.groupBy);
    const rows = await this.prisma.$queryRaw<ProfitRow[]>`
      SELECT ${period} AS period, COUNT(DISTINCT s.id) AS invoice_count,
             SUM(si.line_total) AS revenue, SUM(si.quantity * si.unit_cost_snapshot) AS cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'PAID' AND s.sold_at >= ${range.start} AND s.sold_at < ${range.endExclusive}
      GROUP BY period
      ORDER BY period`;
    const figures = rows.map((row) =>
      toProfitFigures(
        row.period,
        Number(row.invoice_count),
        new Decimal(row.revenue),
        new Decimal(row.cogs),
      ),
    );
    const total = toProfitFigures(
      'total',
      figures.reduce((sum, row) => sum + row.invoiceCount, 0),
      sumDecimals(figures.map((row) => row.revenue)),
      sumDecimals(figures.map((row) => row.cogs)),
    );
    const { period: _period, ...totals } = total;
    return { ...this.header(range), groupBy: query.groupBy, rows: figures, totals };
  }

  async inventory(query: InventoryReportQueryDto): Promise<InventoryReport> {
    const range = this.resolveRange(query);
    const where = this.buildInventoryWhere(query);
    const [products, totals, movements] = await Promise.all([
      this.queryInventoryRows(query, range, where),
      this.queryInventoryTotals(where),
      this.queryMovementTotals(range, where),
    ]);
    return {
      ...this.header(range),
      summary: {
        productCount: Number(totals.product_count),
        totalStockValue: new Decimal(totals.total_stock_value),
        lowStockCount: Number(totals.low_stock_count),
        movements: {
          qtyIn: new Decimal(movements.qty_in),
          qtyOut: new Decimal(movements.qty_out),
          qtyAdjusted: new Decimal(movements.qty_adjusted),
        },
      },
      products: buildPage(products.items, products.total, query),
    };
  }

  private async queryInventoryRows(
    query: InventoryReportQueryDto,
    range: UtcRange,
    where: Prisma.Sql,
  ): Promise<{ items: InventoryReport['products']['items']; total: number }> {
    const { skip, take } = toSkipTake(query);
    const rows = await this.prisma.$queryRaw<InventoryRow[]>`
      SELECT p.id, p.sku, p.name, p.unit, p.stock_qty, p.cost_price,
             p.stock_qty * p.cost_price AS stock_value, p.reorder_level, p.is_active,
             COALESCE(m.qty_in, 0) AS qty_in, COALESCE(m.qty_out, 0) AS qty_out,
             COALESCE(m.qty_adjusted, 0) AS qty_adjusted
      FROM products p
      LEFT JOIN (
        SELECT product_id,
               SUM(CASE WHEN movement_type <> 'ADJUSTMENT' AND quantity_change > 0 THEN quantity_change ELSE 0 END) AS qty_in,
               SUM(CASE WHEN movement_type <> 'ADJUSTMENT' AND quantity_change < 0 THEN -quantity_change ELSE 0 END) AS qty_out,
               SUM(CASE WHEN movement_type = 'ADJUSTMENT' THEN quantity_change ELSE 0 END) AS qty_adjusted
        FROM inventory_movements
        WHERE created_at >= ${range.start} AND created_at < ${range.endExclusive}
        GROUP BY product_id
      ) m ON m.product_id = p.id
      WHERE ${where}
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${take} OFFSET ${skip}`;
    const counted = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM products p WHERE ${where}`;
    return {
      total: Number(counted[0]?.total ?? 0),
      items: rows.map((row) => {
        const stockQty = new Decimal(row.stock_qty);
        const reorderLevel = new Decimal(row.reorder_level);
        return {
          productId: row.id,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          stockQty,
          costPrice: new Decimal(row.cost_price),
          stockValue: new Decimal(row.stock_value),
          reorderLevel,
          isLowStock: stockQty.lte(reorderLevel),
          isActive: Number(row.is_active) === 1,
          qtyIn: new Decimal(row.qty_in),
          qtyOut: new Decimal(row.qty_out),
          qtyAdjusted: new Decimal(row.qty_adjusted),
        };
      }),
    };
  }

  private async queryInventoryTotals(where: Prisma.Sql): Promise<InventoryTotalsRow> {
    const rows = await this.prisma.$queryRaw<InventoryTotalsRow[]>`
      SELECT COUNT(*) AS product_count,
             COALESCE(SUM(p.stock_qty * p.cost_price), 0) AS total_stock_value,
             COALESCE(SUM(CASE WHEN p.is_active = 1 AND p.stock_qty <= p.reorder_level THEN 1 ELSE 0 END), 0) AS low_stock_count
      FROM products p
      WHERE ${where}`;
    return (
      rows[0] ?? {
        product_count: 0n,
        total_stock_value: new Prisma.Decimal(0),
        low_stock_count: 0n,
      }
    );
  }

  private async queryMovementTotals(
    range: UtcRange,
    where: Prisma.Sql,
  ): Promise<MovementTotalsRow> {
    const rows = await this.prisma.$queryRaw<MovementTotalsRow[]>`
      SELECT
        COALESCE(SUM(CASE WHEN m.movement_type <> 'ADJUSTMENT' AND m.quantity_change > 0 THEN m.quantity_change ELSE 0 END), 0) AS qty_in,
        COALESCE(SUM(CASE WHEN m.movement_type <> 'ADJUSTMENT' AND m.quantity_change < 0 THEN -m.quantity_change ELSE 0 END), 0) AS qty_out,
        COALESCE(SUM(CASE WHEN m.movement_type = 'ADJUSTMENT' THEN m.quantity_change ELSE 0 END), 0) AS qty_adjusted
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      WHERE m.created_at >= ${range.start} AND m.created_at < ${range.endExclusive} AND ${where}`;
    const zero = new Prisma.Decimal(0);
    return rows[0] ?? { qty_in: zero, qty_out: zero, qty_adjusted: zero };
  }

  private buildInventoryWhere(query: InventoryReportQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (query.isActive !== undefined) {
      conditions.push(Prisma.sql`p.is_active = ${query.isActive ? 1 : 0}`);
    }
    if (query.categoryId !== undefined) {
      conditions.push(Prisma.sql`p.category_id = ${query.categoryId}`);
    }
    if (query.search) {
      const pattern = `%${escapeLike(query.search)}%`;
      conditions.push(
        Prisma.sql`(p.name LIKE ${pattern} OR p.sku LIKE ${pattern} OR p.barcode LIKE ${pattern})`,
      );
    }
    return Prisma.join(conditions, ' AND ');
  }

  private resolveRange(query: ReportRangeQueryDto): UtcRange {
    return toUtcRange(query.from, query.to, MAX_REPORT_RANGE_DAYS);
  }

  private header(range: UtcRange): ReportHeader {
    return { from: range.from, to: range.to, generatedAt: new Date() };
  }
}
