import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, SaleStatus } from '@prisma/client';

import { ApiId, ApiMoney, ApiQuantity, ApiTimestamp } from 'src/common/swagger/api-properties';
import {
  CustomerSummaryResponse,
  StaffSummaryResponse,
} from 'src/common/swagger/summaries.response';

const PAYMENT_METHOD = { enum: PaymentMethod, enumName: 'PaymentMethod' } as const;

export class SaleItemResponse {
  @ApiId() id: number;
  @ApiId() saleId: number;
  @ApiId({ example: 14 }) productId: number;
  @ApiProperty({ example: 'COCA-330', description: 'SKU at the time of sale.' })
  skuSnapshot: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml', description: 'Name at the time of sale.' })
  nameSnapshot: string;
  @ApiQuantity({ example: 2, description: 'Whole units, >= 1.' }) quantity: number;
  @ApiMoney({ example: 10000, description: 'Unit selling price at the time of sale.' })
  unitPrice: number;
  @ApiMoney({
    example: 7500,
    description:
      'Unit cost at the time of sale. Internal figure: do not show it to cashiers in the UI.',
  })
  unitCostSnapshot: number;
  @ApiMoney({ example: 1000, description: 'Invoice discount allocated to this line.' })
  discountAmount: number;
  @ApiMoney({ example: 19000, description: 'quantity * unitPrice - discountAmount.' })
  lineTotal: number;
}

export class PaymentResponse {
  @ApiId() id: number;
  @ApiId() saleId: number;
  @ApiProperty({ ...PAYMENT_METHOD, example: PaymentMethod.CASH }) method: PaymentMethod;
  @ApiMoney({ example: 36000, description: 'Amount applied to the invoice.' }) amount: number;
  @ApiMoney({ example: 50000, description: 'Cash handed over (= amount for non-cash).' })
  tenderedAmount: number;
  @ApiMoney({ example: 14000, description: 'tenderedAmount - amount (0 for non-cash).' })
  changeAmount: number;
  @ApiTimestamp() paidAt: string;
  @ApiProperty({ type: String, nullable: true, example: null }) reference: string | null;
}

export class SaleListPaymentResponse {
  @ApiProperty({ ...PAYMENT_METHOD, example: PaymentMethod.CASH }) method: PaymentMethod;
  @ApiMoney({ example: 36000 }) amount: number;
}

export class SaleCustomerResponse extends CustomerSummaryResponse {
  @ApiProperty({ type: String, nullable: true, example: '0901234567' })
  phone: string | null;

  @ApiProperty({ type: 'integer', example: 3, description: 'Current points balance.' })
  loyaltyPoints: number;
}

export class SaleListItemResponse {
  @ApiId() id: number;
  @ApiProperty({
    example: 'HD202610020001',
    description: 'HD + yyyyMMdd + 4-digit daily sequence.',
  })
  invoiceNo: string;
  @ApiId({ nullable: true, example: 1 }) customerId: number | null;
  @ApiId({ example: 2 }) cashierId: number;
  @ApiProperty({ enum: SaleStatus, enumName: 'SaleStatus', example: SaleStatus.PAID })
  status: SaleStatus;
  @ApiMoney({ example: 40000, description: 'Sum of line gross amounts before discount.' })
  subtotal: number;
  @ApiMoney({ example: 4000 }) discountAmount: number;
  @ApiMoney({ example: 36000, description: 'subtotal - discountAmount; what the customer pays.' })
  total: number;
  @ApiProperty({ type: 'integer', example: 3, description: 'Loyalty points earned by this sale.' })
  pointsEarned: number;
  @ApiProperty({ type: String, nullable: true, example: null }) note: string | null;
  @ApiTimestamp() soldAt: string;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
  @ApiProperty({ type: CustomerSummaryResponse, nullable: true })
  customer: CustomerSummaryResponse | null;
  @ApiProperty({ type: StaffSummaryResponse }) cashier: StaffSummaryResponse;
  @ApiProperty({ type: [SaleListPaymentResponse] }) payments: SaleListPaymentResponse[];
}

export class SaleDetailResponse {
  @ApiId() id: number;
  @ApiProperty({ example: 'HD202610020001' }) invoiceNo: string;
  @ApiId({ nullable: true, example: 1 }) customerId: number | null;
  @ApiId({ example: 2 }) cashierId: number;
  @ApiProperty({ enum: SaleStatus, enumName: 'SaleStatus', example: SaleStatus.PAID })
  status: SaleStatus;
  @ApiMoney({ example: 40000 }) subtotal: number;
  @ApiMoney({ example: 4000 }) discountAmount: number;
  @ApiMoney({ example: 36000 }) total: number;
  @ApiProperty({ type: 'integer', example: 3 }) pointsEarned: number;
  @ApiProperty({ type: String, nullable: true, example: null }) note: string | null;
  @ApiTimestamp() soldAt: string;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
  @ApiProperty({ type: [SaleItemResponse], description: 'Lines ordered by id.' })
  items: SaleItemResponse[];
  @ApiProperty({ type: [PaymentResponse], description: 'Payments ordered by id.' })
  payments: PaymentResponse[];
  @ApiProperty({ type: SaleCustomerResponse, nullable: true })
  customer: SaleCustomerResponse | null;
  @ApiProperty({ type: StaffSummaryResponse }) cashier: StaffSummaryResponse;
}

export class ReceiptStoreResponse {
  @ApiProperty({ example: 'Siêu thị mini', description: 'From STORE_NAME.' }) name: string;
  @ApiProperty({ example: '12 Nguyễn Huệ, Q1', description: 'From STORE_ADDRESS (may be empty).' })
  address: string;
  @ApiProperty({ example: '0281234567', description: 'From STORE_PHONE (may be empty).' })
  phone: string;
}

export class ReceiptCustomerResponse extends CustomerSummaryResponse {
  @ApiProperty({ type: String, nullable: true, example: '0901234567' }) phone: string | null;
}

export class ReceiptItemResponse {
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiQuantity({ example: 2 }) quantity: number;
  @ApiMoney({ example: 10000 }) unitPrice: number;
  @ApiMoney({ example: 1000 }) discountAmount: number;
  @ApiMoney({ example: 19000 }) lineTotal: number;
}

export class ReceiptPaymentResponse {
  @ApiProperty({ ...PAYMENT_METHOD, example: PaymentMethod.CASH }) method: PaymentMethod;
  @ApiMoney({ example: 36000 }) amount: number;
  @ApiMoney({ example: 50000 }) tenderedAmount: number;
  @ApiMoney({ example: 14000 }) changeAmount: number;
  @ApiProperty({ type: String, nullable: true, example: null }) reference: string | null;
}

export class ReceiptResponse {
  @ApiProperty({ type: ReceiptStoreResponse }) store: ReceiptStoreResponse;
  @ApiProperty({ example: 'HD202610020001' }) invoiceNo: string;
  @ApiTimestamp({ description: 'UTC; convert to Asia/Ho_Chi_Minh for printing.' }) soldAt: string;
  @ApiProperty({ type: StaffSummaryResponse }) cashier: StaffSummaryResponse;
  @ApiProperty({ type: ReceiptCustomerResponse, nullable: true })
  customer: ReceiptCustomerResponse | null;
  @ApiProperty({ type: [ReceiptItemResponse] }) items: ReceiptItemResponse[];
  @ApiMoney({ example: 40000 }) subtotal: number;
  @ApiMoney({ example: 4000 }) discountAmount: number;
  @ApiMoney({ example: 36000 }) total: number;
  @ApiProperty({ type: [ReceiptPaymentResponse] }) payments: ReceiptPaymentResponse[];
  @ApiProperty({ type: 'integer', example: 3 }) pointsEarned: number;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 3,
    description: 'null without a customer.',
  })
  customerPointsBalance: number | null;
}
