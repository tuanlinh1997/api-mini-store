import { MovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { IsIsoDate, ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

const MAX_QUANTITY = 1_000_000_000;
const QUANTITY_DECIMAL_PLACES = 3;

export class ListStockQueryDto extends PaginationQueryDto {
  /** Matches name, SKU or barcode. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** true: only products with stock <= reorder level. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean;

  /** Defaults to true (active products only). */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class ListLowStockQueryDto extends PaginationQueryDto {
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @IsIsoDate()
  from?: string;

  @IsOptional()
  @IsIsoDate()
  to?: string;
}

export class ListStockCountsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @IsOptional()
  @IsIsoDate()
  from?: string;

  @IsOptional()
  @IsIsoDate()
  to?: string;
}

export class CreateStockCountDto {
  @IsInt()
  @Min(1)
  productId: number;

  /** Physically counted quantity (whole units, >= 0). */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: QUANTITY_DECIMAL_PLACES })
  @Min(0, { message: 'Số lượng đếm không được âm' })
  @Max(MAX_QUANTITY)
  countedQty: number;

  /** Why the count differs / why it was done. Required. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do kiểm kê' })
  @MaxLength(500)
  reason: string;

  /** The system stock the user saw; a mismatch with the current stock yields 409 STOCK_CONFLICT. */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: QUANTITY_DECIMAL_PLACES })
  @Min(0)
  @Max(MAX_QUANTITY)
  expectedSystemQty: number;
}
