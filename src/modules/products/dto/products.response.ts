import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiId, ApiMoney, ApiQuantity, ApiTimestamp } from 'src/common/swagger/api-properties';
import { CategorySummaryResponse } from 'src/common/swagger/summaries.response';

export class ProductResponse {
  @ApiId({ example: 14 }) id: number;
  @ApiId({ example: 7 }) categoryId: number;
  @ApiProperty({ type: CategorySummaryResponse }) category: CategorySummaryResponse;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ type: String, nullable: true, example: '8934588063017' }) barcode: string | null;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiProperty({ example: 'lon' }) unit: string;
  @ApiMoney({ example: 10000, description: 'Selling price in VND.' }) salePrice: number;

  @ApiPropertyOptional({
    type: Number,
    example: 7500,
    description:
      'Average cost price in VND. OMITTED (key absent) when the caller is a CASHIER; always present for ADMIN and STOCKKEEPER.',
  })
  costPrice?: number;

  @ApiQuantity({ example: 96, description: 'Current stock. Read-only through the API.' })
  stockQty: number;
  @ApiQuantity({ example: 24, description: 'Low-stock alert threshold.' }) reorderLevel: number;
  @ApiProperty({ type: Boolean, example: true }) isActive: boolean;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}
