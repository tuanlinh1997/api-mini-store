import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { IsIsoDate, ToBoolean, TrimToUndefined } from 'src/common/validation/validation';

export const REPORT_GROUPINGS = ['day', 'month'] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

export const TOP_PRODUCT_SORTS = ['quantity', 'revenue'] as const;
export type TopProductSort = (typeof TOP_PRODUCT_SORTS)[number];

const MAX_TOP_PRODUCTS = 100;
const DEFAULT_TOP_PRODUCTS = 10;

export class ReportRangeQueryDto {
  /** First day, YYYY-MM-DD in Asia/Ho_Chi_Minh. */
  @IsIsoDate()
  from: string;

  /** Last day (inclusive), YYYY-MM-DD in Asia/Ho_Chi_Minh. Must be >= from; range <= 366 days. */
  @IsIsoDate()
  to: string;
}

export class PeriodReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsIn(REPORT_GROUPINGS)
  groupBy: ReportGrouping = 'day';
}

export class TopProductsQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TOP_PRODUCTS)
  limit: number = DEFAULT_TOP_PRODUCTS;

  @IsOptional()
  @IsIn(TOP_PRODUCT_SORTS)
  sortBy: TopProductSort = 'quantity';
}

export class InventoryReportQueryDto extends PaginationQueryDto {
  @IsIsoDate()
  from: string;

  @IsIsoDate()
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Matches name, SKU or barcode. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Omit to include inactive products that still hold stock. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
