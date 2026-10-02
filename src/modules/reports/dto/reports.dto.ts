import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import {
  ApiBooleanFilter,
  ApiIdFilter,
  ApiSearchFilter,
  ApiStoreDate,
} from 'src/common/swagger/api-properties';
import { IsIsoDate, ToBoolean, TrimToUndefined } from 'src/common/validation/validation';

export const REPORT_GROUPINGS = ['day', 'month'] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

export const TOP_PRODUCT_SORTS = ['quantity', 'revenue'] as const;
export type TopProductSort = (typeof TOP_PRODUCT_SORTS)[number];

const MAX_TOP_PRODUCTS = 100;
const DEFAULT_TOP_PRODUCTS = 10;

export class ReportRangeQueryDto {
  /** First day, YYYY-MM-DD in Asia/Ho_Chi_Minh. */
  @ApiStoreDate({ description: 'First day' })
  @IsIsoDate()
  from: string;

  /** Last day (inclusive), YYYY-MM-DD in Asia/Ho_Chi_Minh. Must be >= from; range <= 366 days. */
  @ApiStoreDate({
    description: 'Last day, inclusive; must be >= from and at most 366 days after it',
    example: '2026-10-31',
  })
  @IsIsoDate()
  to: string;
}

export class PeriodReportQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_GROUPINGS,
    enumName: 'ReportGrouping',
    default: 'day',
    description: 'Bucket size: one row per day or per month.',
  })
  @IsOptional()
  @IsIn(REPORT_GROUPINGS)
  groupBy: ReportGrouping = 'day';
}

export class TopProductsQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_TOP_PRODUCTS,
    default: DEFAULT_TOP_PRODUCTS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TOP_PRODUCTS)
  limit: number = DEFAULT_TOP_PRODUCTS;

  @ApiPropertyOptional({
    enum: TOP_PRODUCT_SORTS,
    enumName: 'TopProductSort',
    default: 'quantity',
    description: 'Rank by units sold or by revenue.',
  })
  @IsOptional()
  @IsIn(TOP_PRODUCT_SORTS)
  sortBy: TopProductSort = 'quantity';
}

export class InventoryReportQueryDto extends PaginationQueryDto {
  @ApiStoreDate({ description: 'First day of the movement window' })
  @IsIsoDate()
  from: string;

  @ApiStoreDate({
    description: 'Last day of the movement window, inclusive (max 366 days)',
    example: '2026-10-31',
  })
  @IsIsoDate()
  to: string;

  @ApiIdFilter('Only products of this category.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Matches name, SKU or barcode. */
  @ApiSearchFilter('Matches name, SKU or barcode (partial).')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Omit to include inactive products that still hold stock. */
  @ApiBooleanFilter('Omit to include inactive products that still hold stock.')
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
