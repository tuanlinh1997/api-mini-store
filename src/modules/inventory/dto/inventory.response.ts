import { ApiProperty } from '@nestjs/swagger';
import { MovementType, ReferenceType } from '@prisma/client';

import { ApiId, ApiQuantity, ApiTimestamp } from 'src/common/swagger/api-properties';
import {
  ProductSummaryResponse,
  StaffSummaryResponse,
} from 'src/common/swagger/summaries.response';

/** Row of `GET /inventory/stock` and `GET /inventory/low-stock`. */
export class StockItemResponse {
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ type: String, nullable: true, example: '8934588063017' }) barcode: string | null;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiProperty({ example: 'lon' }) unit: string;
  @ApiId({ example: 7 }) categoryId: number;
  @ApiProperty({ example: 'Đồ uống' }) categoryName: string;
  @ApiQuantity({ example: 96 }) stockQty: number;
  @ApiQuantity({ example: 24 }) reorderLevel: number;
  @ApiProperty({ type: Boolean, example: false, description: 'stockQty <= reorderLevel.' })
  isLowStock: boolean;
  @ApiProperty({ type: Boolean, example: true }) isActive: boolean;
}

export class MovementResponse {
  @ApiId() id: number;
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ type: ProductSummaryResponse }) product: ProductSummaryResponse;
  @ApiProperty({ enum: MovementType, enumName: 'MovementType', example: MovementType.SALE })
  movementType: MovementType;
  @ApiQuantity({ example: -2, description: 'Signed: positive adds stock, negative removes it.' })
  quantityChange: number;
  @ApiProperty({ enum: ReferenceType, enumName: 'ReferenceType', example: ReferenceType.SALE })
  referenceType: ReferenceType;
  @ApiId({ example: 1, description: 'Id of the sale / purchase / stock count that caused it.' })
  referenceId: number;
  @ApiId({ example: 2 }) createdBy: number;
  @ApiProperty({ type: StaffSummaryResponse }) creator: StaffSummaryResponse;
  @ApiProperty({ type: String, nullable: true, example: null }) note: string | null;
  @ApiTimestamp() createdAt: string;
}

export class StockCountResponse {
  @ApiId() id: number;
  @ApiProperty({
    example: 'KK202610020001',
    description: 'KK + yyyyMMdd + 4-digit daily sequence.',
  })
  countNo: string;
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ type: ProductSummaryResponse }) product: ProductSummaryResponse;
  @ApiQuantity({ example: 10, description: 'System stock when the count was recorded.' })
  systemQty: number;
  @ApiQuantity({ example: 7, description: 'Physically counted quantity.' }) countedQty: number;
  @ApiQuantity({ example: -3, description: 'countedQty - systemQty.' }) difference: number;
  @ApiProperty({ example: 'Hàng hỏng' }) reason: string;
  @ApiId({ example: 3 }) createdBy: number;
  @ApiProperty({ type: StaffSummaryResponse }) creator: StaffSummaryResponse;
  @ApiTimestamp() createdAt: string;
}

export class StockCountProductResponse extends ProductSummaryResponse {
  @ApiQuantity({ example: 7, description: 'Stock after the count (= countedQty).' })
  stockQty: number;
}

export class StockCountResultResponse {
  @ApiProperty({ type: StockCountResponse }) stockCount: StockCountResponse;
  @ApiProperty({ type: StockCountProductResponse }) product: StockCountProductResponse;
}
