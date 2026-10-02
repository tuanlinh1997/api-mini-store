import { ApiProperty } from '@nestjs/swagger';

import { PageMetaDto } from 'src/common/swagger/envelope.decorators';
import { ApiId, ApiMoney, ApiQuantity, ApiTimestamp } from 'src/common/swagger/api-properties';

import { REPORT_GROUPINGS, ReportGrouping, TOP_PRODUCT_SORTS, TopProductSort } from './reports.dto';

const GROUP_BY = { enum: REPORT_GROUPINGS, enumName: 'ReportGrouping' } as const;
const PERIOD_DESCRIPTION =
  'Bucket label in store time: YYYY-MM-DD when groupBy=day, YYYY-MM when groupBy=month.';

/** Common head of every report. */
abstract class ReportHeaderResponse {
  @ApiProperty({ example: '2026-10-01', description: 'Requested first day (YYYY-MM-DD).' })
  from: string;
  @ApiProperty({ example: '2026-10-02', description: 'Requested last day, inclusive.' })
  to: string;
  @ApiTimestamp({ description: 'When the server computed the report (UTC).' })
  generatedAt: string;
}

export class RevenueRowResponse {
  @ApiProperty({ example: '2026-10-02', description: PERIOD_DESCRIPTION }) period: string;
  @ApiProperty({ type: 'integer', example: 2, description: 'Number of PAID invoices.' })
  invoiceCount: number;
  @ApiMoney({ example: 80000, description: 'Sum of quantity * unitPrice before discount.' })
  grossSales: number;
  @ApiMoney({ example: 3000 }) discountAmount: number;
  @ApiMoney({ example: 77000, description: 'Sum of invoice totals.' }) netRevenue: number;
}

export class RevenueTotalsResponse {
  @ApiProperty({ type: 'integer', example: 2 }) invoiceCount: number;
  @ApiMoney({ example: 80000 }) grossSales: number;
  @ApiMoney({ example: 3000 }) discountAmount: number;
  @ApiMoney({ example: 77000 }) netRevenue: number;
}

export class RevenueReportResponse extends ReportHeaderResponse {
  @ApiProperty({ ...GROUP_BY, example: 'day' }) groupBy: ReportGrouping;
  @ApiProperty({ type: [RevenueRowResponse], description: 'Empty for an empty range.' })
  rows: RevenueRowResponse[];
  @ApiProperty({ type: RevenueTotalsResponse }) totals: RevenueTotalsResponse;
}

export class TopProductRowResponse {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 }) rank: number;
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiQuantity({ example: 12 }) quantitySold: number;
  @ApiMoney({ example: 120000, description: 'Sum of line totals after discount.' })
  revenue: number;
}

export class TopProductsReportResponse extends ReportHeaderResponse {
  @ApiProperty({ enum: TOP_PRODUCT_SORTS, enumName: 'TopProductSort', example: 'quantity' })
  sortBy: TopProductSort;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, example: 10 }) limit: number;
  @ApiProperty({ type: [TopProductRowResponse], description: 'At most `limit` rows.' })
  rows: TopProductRowResponse[];
}

export class GrossProfitFiguresResponse {
  @ApiProperty({ type: 'integer', example: 2 }) invoiceCount: number;
  @ApiMoney({ example: 77000, description: 'Sum of line totals after discount.' })
  revenue: number;
  @ApiMoney({ example: 50000, description: 'Sum of quantity * unitCostSnapshot.' }) cogs: number;
  @ApiMoney({ example: 27000, description: 'revenue - cogs (estimated, BR8).' })
  grossProfit: number;
  @ApiProperty({
    type: Number,
    example: 35.06,
    description: 'grossProfit / revenue * 100, 2 decimals; 0 when revenue is 0.',
  })
  marginPercent: number;
}

export class GrossProfitRowResponse extends GrossProfitFiguresResponse {
  @ApiProperty({ example: '2026-10-02', description: PERIOD_DESCRIPTION }) period: string;
}

export class GrossProfitReportResponse extends ReportHeaderResponse {
  @ApiProperty({ ...GROUP_BY, example: 'day' }) groupBy: ReportGrouping;
  @ApiProperty({ type: [GrossProfitRowResponse] }) rows: GrossProfitRowResponse[];
  @ApiProperty({ type: GrossProfitFiguresResponse }) totals: GrossProfitFiguresResponse;
}

export class InventoryMovementTotalsResponse {
  @ApiQuantity({
    example: 662,
    description: 'Stock received in the window (purchases, reversals).',
  })
  qtyIn: number;
  @ApiQuantity({ example: 5, description: 'Stock sold or removed in the window.' }) qtyOut: number;
  @ApiQuantity({ example: 0, description: 'Signed net of stock-count adjustments.' })
  qtyAdjusted: number;
}

export class InventoryReportSummaryResponse {
  @ApiProperty({ type: 'integer', example: 12, description: 'Products matching the filters.' })
  productCount: number;
  @ApiMoney({ example: 8267500, description: 'Sum of stockQty * costPrice.' })
  totalStockValue: number;
  @ApiProperty({ type: 'integer', example: 2 }) lowStockCount: number;
  @ApiProperty({ type: InventoryMovementTotalsResponse })
  movements: InventoryMovementTotalsResponse;
}

export class InventoryReportRowResponse {
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiProperty({ example: 'lon' }) unit: string;
  @ApiQuantity({ example: 93 }) stockQty: number;
  @ApiMoney({ example: 7500 }) costPrice: number;
  @ApiMoney({ example: 697500, description: 'stockQty * costPrice.' }) stockValue: number;
  @ApiQuantity({ example: 24 }) reorderLevel: number;
  @ApiProperty({ type: Boolean, example: false }) isLowStock: boolean;
  @ApiProperty({ type: Boolean, example: true }) isActive: boolean;
  @ApiQuantity({ example: 96 }) qtyIn: number;
  @ApiQuantity({ example: 3 }) qtyOut: number;
  @ApiQuantity({ example: 0 }) qtyAdjusted: number;
}

export class InventoryReportProductsResponse {
  @ApiProperty({ type: [InventoryReportRowResponse] }) items: InventoryReportRowResponse[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

export class InventoryReportResponse extends ReportHeaderResponse {
  @ApiProperty({
    type: InventoryReportSummaryResponse,
    description: 'Covers all matching products, not only the current page.',
  })
  summary: InventoryReportSummaryResponse;
  @ApiProperty({ type: InventoryReportProductsResponse }) products: InventoryReportProductsResponse;
}
