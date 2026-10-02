import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import {
  ApiBooleanFilter,
  ApiIdFilter,
  ApiSearchFilter,
  ApiStoreDate,
} from 'src/common/swagger/api-properties';
import { IsIsoDate, ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

const MAX_QUANTITY = 1_000_000_000;
const QUANTITY_DECIMAL_PLACES = 3;

const FROM_DESCRIPTION = 'First day';
const TO_DESCRIPTION = 'Last day, inclusive';

export class ListStockQueryDto extends PaginationQueryDto {
  /** Matches name, SKU or barcode. */
  @ApiSearchFilter('Matches name, SKU or barcode (partial).')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiIdFilter('Only products of this category.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** true: only products with stock <= reorder level. */
  @ApiBooleanFilter('true: only products with stock <= reorder level.')
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean;

  /** Defaults to true (active products only). */
  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'Defaults to true (active products only); false lists inactive products.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class ListLowStockQueryDto extends PaginationQueryDto {
  @ApiSearchFilter('Matches name, SKU or barcode (partial).')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiIdFilter('Only products of this category.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @ApiIdFilter('Only movements of this product.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @ApiPropertyOptional({ enum: MovementType, enumName: 'MovementType' })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiStoreDate({ optional: true, description: FROM_DESCRIPTION })
  @IsOptional()
  @IsIsoDate()
  from?: string;

  @ApiStoreDate({ optional: true, description: TO_DESCRIPTION, example: '2026-10-31' })
  @IsOptional()
  @IsIsoDate()
  to?: string;
}

export class ListStockCountsQueryDto extends PaginationQueryDto {
  @ApiIdFilter('Only counts of this product.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @ApiStoreDate({ optional: true, description: FROM_DESCRIPTION })
  @IsOptional()
  @IsIsoDate()
  from?: string;

  @ApiStoreDate({ optional: true, description: TO_DESCRIPTION, example: '2026-10-31' })
  @IsOptional()
  @IsIsoDate()
  to?: string;
}

export class CreateStockCountDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 14 })
  @IsInt()
  @Min(1)
  productId: number;

  /** Physically counted quantity (whole units, >= 0). */
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: MAX_QUANTITY,
    example: 7,
    description:
      'Physically counted quantity: whole units, >= 0 (fractions answer 422 INVALID_QUANTITY).',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: QUANTITY_DECIMAL_PLACES })
  @Min(0, { message: 'Số lượng đếm không được âm' })
  @Max(MAX_QUANTITY)
  countedQty: number;

  /** Why the count differs / why it was done. Required. */
  @ApiProperty({ minLength: 1, maxLength: 500, example: 'Hàng hỏng, kiểm kê định kỳ' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do kiểm kê' })
  @MaxLength(500)
  reason: string;

  /** The system stock the user saw; a mismatch with the current stock yields 409 STOCK_CONFLICT. */
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: MAX_QUANTITY,
    example: 10,
    description:
      'The system stock the user saw on screen. If the current stock differs the API answers 409 STOCK_CONFLICT.',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: QUANTITY_DECIMAL_PLACES })
  @Min(0)
  @Max(MAX_QUANTITY)
  expectedSystemQty: number;
}
