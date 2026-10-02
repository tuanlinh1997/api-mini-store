import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

interface BaseOptions {
  description?: string;
  example?: number | string | null;
  optional?: boolean;
}

function property(
  options: { optional?: boolean },
  metadata: Record<string, unknown>,
): PropertyDecorator {
  return options.optional ? ApiPropertyOptional(metadata) : ApiProperty(metadata);
}

/** Request money field: VND, finite, at most 2 decimals, `0..9_999_999_999` (or from `minimum`). */
export function ApiMoneyInput(
  options: BaseOptions & { minimum?: number; maximum?: number } = {},
): PropertyDecorator {
  return property(options, {
    type: Number,
    minimum: options.minimum ?? 0,
    maximum: options.maximum ?? 9_999_999_999,
    example: options.example ?? 10000,
    description: `${options.description ?? 'Amount in VND'} (at most 2 decimals; whole VND in practice).`,
  });
}

/** Response money field: a JSON number in VND (a Decimal on the server, never a string). */
export function ApiMoney(options: BaseOptions & { nullable?: boolean } = {}): PropertyDecorator {
  return property(options, {
    type: Number,
    nullable: options.nullable,
    example: options.example ?? 10000,
    description: options.description ?? 'Amount in VND.',
  });
}

/** Response quantity: a JSON number; whole units in v1 (BR4) but typed as number. */
export function ApiQuantity(options: BaseOptions = {}): PropertyDecorator {
  return property(options, {
    type: Number,
    example: options.example ?? 10,
    description: options.description ?? 'Quantity in the product unit (whole numbers in v1).',
  });
}

/** Response timestamp: ISO-8601 UTC string. */
export function ApiTimestamp(
  options: BaseOptions & { nullable?: boolean } = {},
): PropertyDecorator {
  return property(options, {
    type: String,
    format: 'date-time',
    nullable: options.nullable,
    example: options.example ?? '2026-10-02T04:50:53.609Z',
    description: options.description ?? 'UTC, ISO-8601.',
  });
}

/** Response/request primary or foreign key. */
export function ApiId(options: BaseOptions & { nullable?: boolean } = {}): PropertyDecorator {
  return property(options, {
    type: 'integer',
    minimum: 1,
    nullable: options.nullable,
    example: options.example ?? 1,
    description: options.description,
  });
}

/** Request `YYYY-MM-DD` calendar date interpreted in Asia/Ho_Chi_Minh. */
export function ApiStoreDate(options: BaseOptions = {}): PropertyDecorator {
  return property(options, {
    type: String,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    example: options.example ?? '2026-10-01',
    description: `${options.description ?? 'Calendar date'} (YYYY-MM-DD, Asia/Ho_Chi_Minh).`,
  });
}

/** Optional integer filter such as `categoryId`. */
export function ApiIdFilter(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: 'integer', minimum: 1, example: 1, description }),
  );
}

/** Optional free-text search filter. */
export function ApiSearchFilter(description: string, maxLength = 100): PropertyDecorator {
  return ApiPropertyOptional({ type: String, maxLength, description });
}

/** Optional boolean query filter (`true`/`false`/`1`/`0`). */
export function ApiBooleanFilter(description: string): PropertyDecorator {
  return ApiPropertyOptional({ type: Boolean, description });
}
