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
  IsMoneyAmount,
  PRODUCT_CODE_PATTERN,
  ToBoolean,
  Trim,
  TrimToUndefined,
} from 'src/common/validation/validation';

const CODE_MESSAGE = 'Mã chỉ gồm chữ, số và các ký tự . _ - / (tối đa 50 ký tự)';
const MAX_REORDER_LEVEL = 1_000_000;

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @Trim()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  sku: string;

  @IsOptional()
  @TrimToUndefined()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  barcode?: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @MaxLength(200)
  name: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Đơn vị tính không được để trống' })
  @MaxLength(30)
  unit: string;

  @IsMoneyAmount()
  salePrice: number;

  /** Optional opening cost. Afterwards the cost only changes by receiving purchases (BR11). */
  @IsOptional()
  @IsMoneyAmount()
  costPrice?: number;

  /** Low-stock alert threshold (whole units). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REORDER_LEVEL)
  reorderLevel?: number;
}

/** stockQty and costPrice are intentionally absent: they are changed only by stock operations. */
export class UpdateProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Trim()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  sku?: string;

  /** Send null to clear the barcode. */
  @IsOptional()
  @Matches(PRODUCT_CODE_PATTERN, { message: CODE_MESSAGE })
  barcode?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsMoneyAmount()
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REORDER_LEVEL)
  reorderLevel?: number;
}

export class ListProductsQueryDto extends PaginationQueryDto {
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

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class LookupProductQueryDto {
  /** Barcode or SKU, exact match. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Mã sản phẩm là bắt buộc' })
  @MaxLength(50)
  code: string;
}
