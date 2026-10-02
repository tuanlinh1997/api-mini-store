import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map, Observable } from 'rxjs';

/**
 * Money and quantity values are computed and stored as Decimal but sent to clients as JSON
 * numbers (VND amounts and whole-unit quantities are far below 2^53). Dates stay ISO strings.
 */
export function serializeDecimals(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) {
    return Number(value.toString());
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(serializeDecimals);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeDecimals(nested)]),
    );
  }
  return value;
}

@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(serializeDecimals));
  }
}
