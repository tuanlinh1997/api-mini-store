import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import {
  ApiIdFilter,
  ApiMoneyInput,
  ApiSearchFilter,
  ApiStoreDate,
} from 'src/common/swagger/api-properties';
import { IsIsoDate, IsMoneyAmount, TrimToUndefined } from 'src/common/validation/validation';

const MAX_CART_LINES = 200;
const MAX_LINE_QUANTITY = 1_000_000;
const MAX_PAYMENTS = 10;
const MAX_DISCOUNT_VND = 9_999_999_999;

const PAYMENT_METHOD = { enum: PaymentMethod, enumName: 'PaymentMethod' } as const;

export class CartItemDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 14,
    description: 'Must exist and be active. Repeated products are merged.',
  })
  @IsInt()
  @Min(1)
  productId: number;

  /** Whole units only (BR4). */
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MAX_LINE_QUANTITY,
    example: 2,
    description: 'Whole units only.',
  })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class PaymentDto {
  @ApiProperty({ ...PAYMENT_METHOD, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Amount applied to the invoice. */
  @ApiMoneyInput({
    description: 'Amount applied to the invoice, in VND',
    example: 36000,
    minimum: 0.01,
  })
  @IsMoneyAmount(0.01)
  amount: number;

  /** Cash handed over by the customer (>= amount). Defaults to amount; ignored for non-cash. */
  @ApiMoneyInput({
    optional: true,
    example: 50000,
    description:
      'CASH only: money handed over by the customer, >= amount (default = amount). For other methods it must equal amount or be omitted',
  })
  @IsOptional()
  @IsMoneyAmount()
  tenderedAmount?: number;

  /** Optional transfer code / card slip number. */
  @ApiPropertyOptional({
    maxLength: 100,
    example: 'FT26100212345',
    description: 'Transfer code or card slip number.',
  })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class CreateSaleDto {
  /** Optional loyalty customer; points are added when present. */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    example: 1,
    description: 'Loyalty customer; earns points when present.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiProperty({ type: [CartItemDto], minItems: 1, maxItems: MAX_CART_LINES })
  @IsArray()
  @ArrayMinSize(1, { message: 'Giỏ hàng không được để trống' })
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  /** Invoice-level discount in whole VND, >= 0 and strictly below the subtotal (BR7). */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: MAX_DISCOUNT_VND,
    default: 0,
    example: 4000,
    description:
      'Invoice discount in whole VND. Must be < subtotal and within the role limit (CASHIER 10%, ADMIN 100% by default).',
  })
  @IsOptional()
  @IsInt({ message: 'Giảm giá phải là số tiền VND nguyên' })
  @Min(0)
  @Max(MAX_DISCOUNT_VND)
  discountAmount?: number;

  @ApiProperty({
    type: [PaymentDto],
    minItems: 1,
    maxItems: MAX_PAYMENTS,
    description: 'Amounts must add up exactly to the invoice total.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất một phương thức thanh toán' })
  @ArrayMaxSize(MAX_PAYMENTS)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListSalesQueryDto extends PaginationQueryDto {
  /** Matches the invoice number. */
  @ApiSearchFilter('Partial match on the invoice number.', 30)
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(30)
  search?: string;

  @ApiIdFilter('Exact customer id.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  /** Matches the customer's phone (+84/84/0 forms accepted) or customer code, partial match. */
  @ApiSearchFilter(
    'Partial match on the customer phone (+84 / 84 / 0 forms accepted) or customer code. Sales without a customer never match.',
    30,
  )
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(30)
  customerQuery?: string;

  /** Only sales that have at least one payment with this method. */
  @ApiPropertyOptional({
    ...PAYMENT_METHOD,
    description: 'Only sales with at least one payment of this method.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiIdFilter('Exact cashier id.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cashierId?: number;

  /** First day (YYYY-MM-DD, Asia/Ho_Chi_Minh). */
  @ApiStoreDate({ optional: true, description: 'First day' })
  @IsOptional()
  @IsIsoDate()
  from?: string;

  /** Last day, inclusive (YYYY-MM-DD, Asia/Ho_Chi_Minh). */
  @ApiStoreDate({ optional: true, description: 'Last day, inclusive', example: '2026-10-31' })
  @IsOptional()
  @IsIsoDate()
  to?: string;
}
