import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import {
  ApiBooleanFilter,
  ApiIdFilter,
  ApiMoneyInput,
  ApiSearchFilter,
} from 'src/common/swagger/api-properties';
import {
  IsMoneyAmount,
  PRODUCT_CODE_PATTERN,
  ToBoolean,
  Trim,
  TrimToUndefined,
} from 'src/common/validation/validation';

const CODE_MESSAGE = 'Mã chỉ gồm chữ, số và các ký tự . _ - / (tối đa 50 ký tự)';
const MAX_REORDER_LEVEL = 1_000_000;
const CODE_PATTERN_SOURCE = PRODUCT_CODE_PATTERN.source;

export class CreateProductDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 7,
    description: 'Must exist and be active.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty({
    minLength: 1,
    maxLength: 50,
    pattern: CODE_PATTERN_SOURCE,
    example: 'COCA-330',
    description: 'Unique stock keeping unit.',
  })
  @Trim()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  sku: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 50,
    pattern: CODE_PATTERN_SOURCE,
    example: '8934588063017',
    description: 'Unique when present.',
  })
  @IsOptional()
  @TrimToUndefined()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  barcode?: string;

  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Coca-Cola lon 330ml' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @MaxLength(200)
  name: string;

  @ApiProperty({ minLength: 1, maxLength: 30, example: 'lon', description: 'Unit of measure.' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Đơn vị tính không được để trống' })
  @MaxLength(30)
  unit: string;

  @ApiMoneyInput({ description: 'Selling price in VND', example: 10000 })
  @IsMoneyAmount()
  salePrice: number;

  /** Optional opening cost. Afterwards the cost only changes by receiving purchases (BR11). */
  @ApiMoneyInput({
    optional: true,
    example: 7500,
    description:
      'Opening cost price in VND (default 0). Afterwards it only changes by receiving purchases',
  })
  @IsOptional()
  @IsMoneyAmount()
  costPrice?: number;

  /** Low-stock alert threshold (whole units). */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: MAX_REORDER_LEVEL,
    default: 0,
    example: 24,
    description: 'Low-stock alert threshold (whole units).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REORDER_LEVEL)
  reorderLevel?: number;
}

/** stockQty and costPrice are intentionally absent: they are changed only by stock operations. */
export class UpdateProductDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    example: 7,
    description: 'Must exist and be active.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 50,
    pattern: CODE_PATTERN_SOURCE,
    example: 'COCA-330',
  })
  @IsOptional()
  @Trim()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  sku?: string;

  /** Send null to clear the barcode. */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 50,
    pattern: CODE_PATTERN_SOURCE,
    description: 'Send null to clear the barcode.',
  })
  @IsOptional()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  barcode?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200, example: 'Coca-Cola lon 330ml' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 30, example: 'lon' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit?: string;

  @ApiMoneyInput({ optional: true, description: 'Selling price in VND', example: 10000 })
  @IsOptional()
  @IsMoneyAmount()
  salePrice?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: MAX_REORDER_LEVEL, example: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REORDER_LEVEL)
  reorderLevel?: number;
}

export class ListProductsQueryDto extends PaginationQueryDto {
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

  @ApiBooleanFilter('Filter by active state; omit for all.')
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class LookupProductQueryDto {
  /** Barcode or SKU, exact match. */
  @ApiProperty({
    minLength: 1,
    maxLength: 50,
    example: '8934588063017',
    description: 'Barcode or SKU, exact match; active products only.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Mã sản phẩm là bắt buộc' })
  @MaxLength(50)
  code: string;
}
