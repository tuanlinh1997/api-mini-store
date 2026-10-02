import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  /** 1-based page number. */
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** Items per page (max 100). */
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Explicit marker for list results: the response interceptor maps it to the envelope's
 * `data` (items) and `meta` (pagination). Plain objects with an `items` key are NOT treated as pages.
 */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PageMeta,
  ) {}
}

export type Page<T> = Paginated<T>;

export function toSkipTake(query: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function buildPage<T>(items: T[], total: number, query: PaginationQueryDto): Page<T> {
  return new Paginated(items, { page: query.page, pageSize: query.pageSize, total });
}
