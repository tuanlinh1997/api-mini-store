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
import { IsIsoDate, IsMoneyAmount, TrimToUndefined } from 'src/common/validation/validation';

const MAX_CART_LINES = 200;
const MAX_LINE_QUANTITY = 1_000_000;
const MAX_PAYMENTS = 10;
const MAX_DISCOUNT_VND = 9_999_999_999;

export class CartItemDto {
  @IsInt()
  @Min(1)
  productId: number;

  /** Whole units only (BR4). */
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_LINE_QUANTITY)
  quantity: number;
}

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Amount applied to the invoice. */
  @IsMoneyAmount(0.01)
  amount: number;

  /** Cash handed over by the customer (>= amount). Defaults to amount; ignored for non-cash. */
  @IsOptional()
  @IsMoneyAmount()
  tenderedAmount?: number;

  /** Optional transfer code / card slip number. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class CreateSaleDto {
  /** Optional loyalty customer; points are added when present. */
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Giỏ hàng không được để trống' })
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  /** Invoice-level discount in whole VND, >= 0 and strictly below the subtotal (BR7). */
  @IsOptional()
  @IsInt({ message: 'Giảm giá phải là số tiền VND nguyên' })
  @Min(0)
  @Max(MAX_DISCOUNT_VND)
  discountAmount?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất một phương thức thanh toán' })
  @ArrayMaxSize(MAX_PAYMENTS)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];

  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListSalesQueryDto extends PaginationQueryDto {
  /** Matches the invoice number. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(30)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cashierId?: number;

  /** First day (YYYY-MM-DD, Asia/Ho_Chi_Minh). */
  @IsOptional()
  @IsIsoDate()
  from?: string;

  /** Last day, inclusive (YYYY-MM-DD, Asia/Ho_Chi_Minh). */
  @IsOptional()
  @IsIsoDate()
  to?: string;
}
