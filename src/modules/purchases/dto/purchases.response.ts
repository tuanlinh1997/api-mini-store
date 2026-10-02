import { ApiProperty } from '@nestjs/swagger';
import { PurchaseStatus } from '@prisma/client';

import { ApiId, ApiMoney, ApiQuantity, ApiTimestamp } from 'src/common/swagger/api-properties';
import {
  ProductSummaryResponse,
  StaffSummaryResponse,
  SupplierSummaryResponse,
} from 'src/common/swagger/summaries.response';

export class PurchaseItemResponse {
  @ApiId() id: number;
  @ApiId() purchaseId: number;
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ type: ProductSummaryResponse }) product: ProductSummaryResponse;
  @ApiQuantity({ example: 10, description: 'Whole units, > 0.' }) quantity: number;
  @ApiMoney({ example: 7500, description: 'Purchase price per unit in VND.' }) unitCost: number;
  @ApiMoney({ example: 75000, description: 'quantity * unitCost.' }) lineTotal: number;
}

export class PurchaseListItemResponse {
  @ApiId() id: number;
  @ApiProperty({
    example: 'PN202610020001',
    description: 'PN + yyyyMMdd + 4-digit daily sequence.',
  })
  purchaseNo: string;
  @ApiId({ example: 3 }) supplierId: number;
  @ApiProperty({ type: SupplierSummaryResponse }) supplier: SupplierSummaryResponse;
  @ApiId({ example: 3, description: 'User who created the purchase.' }) createdBy: number;
  @ApiProperty({ type: StaffSummaryResponse }) creator: StaffSummaryResponse;
  @ApiProperty({ enum: PurchaseStatus, enumName: 'PurchaseStatus', example: PurchaseStatus.DRAFT })
  status: PurchaseStatus;
  @ApiMoney({ example: 75000, description: 'Sum of line totals.' }) subtotal: number;
  @ApiMoney({ example: 75000, description: 'Equals subtotal in v1.' }) total: number;
  @ApiProperty({ type: String, nullable: true, example: null }) note: string | null;
  @ApiTimestamp({ nullable: true, example: null, description: 'Set when received, else null.' })
  receivedAt: string | null;
  @ApiId({ nullable: true, example: null, description: 'User who confirmed receipt, else null.' })
  receivedBy: number | null;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}

export class PurchaseDetailResponse extends PurchaseListItemResponse {
  @ApiProperty({ type: [PurchaseItemResponse], description: 'Lines ordered by id.' })
  items: PurchaseItemResponse[];
}
