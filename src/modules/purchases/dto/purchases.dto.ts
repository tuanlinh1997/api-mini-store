import { PurchaseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

const MAX_PURCHASE_LINES = 200;
const MAX_LINE_QUANTITY = 1_000_000;

export class PurchaseItemDto {
  @IsInt()
  @Min(1)
  productId: number;

  /** Whole units only (BR4). */
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_LINE_QUANTITY)
  quantity: number;

  @IsMoneyAmount()
  unitCost: number;
}

export class CreatePurchaseDto {
  @IsInt()
  @Min(1)
  supplierId: number;

  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất một mặt hàng' })
  @ArrayMaxSize(MAX_PURCHASE_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  /** Create and receive in one transaction. */
  @IsOptional()
  @IsBoolean()
  receiveNow?: boolean;
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  /** Send null to clear the note. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  /** When present, replaces all lines of the draft. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất một mặt hàng' })
  @ArrayMaxSize(MAX_PURCHASE_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class ListPurchasesQueryDto extends PaginationQueryDto {
  /** Matches the purchase number. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(30)
  search?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;

  @IsOptional()
  @IsIsoDate()
  from?: string;

  @IsOptional()
  @IsIsoDate()
  to?: string;
}
