import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { map, Observable } from 'rxjs';

import {
  DEFAULT_SUCCESS_MESSAGE,
  RESPONSE_MESSAGE_KEY,
} from 'src/common/decorators/response-message.decorator';
import { PageMeta, Paginated } from 'src/common/pagination/pagination';

export interface SuccessEnvelope {
  success: true;
  statusCode: number;
  code: 'OK';
  message: string;
  data: unknown;
  meta?: PageMeta;
  requestId: string;
  timestamp: string;
}

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

/** Wraps a handler result in the standard success envelope (pure; unit-tested). */
export function buildSuccessEnvelope(input: {
  result: unknown;
  statusCode: number;
  message: string;
  requestId: string;
  now?: Date;
}): SuccessEnvelope {
  const { result, statusCode, message, requestId } = input;
  const base = {
    success: true as const,
    statusCode,
    code: 'OK' as const,
    message,
  };
  const tail = { requestId, timestamp: (input.now ?? new Date()).toISOString() };
  if (result instanceof Paginated) {
    return { ...base, data: serializeDecimals(result.items), meta: result.meta, ...tail };
  }
  return { ...base, data: result === undefined ? null : serializeDecimals(result), ...tail };
}

/**
 * Single global interceptor: converts Decimals to numbers first, then wraps every successful
 * response in the standard envelope. `Paginated` results become `data` + top-level `meta`.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessEnvelope> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const message =
      this.reflector.get<string | undefined>(RESPONSE_MESSAGE_KEY, context.getHandler()) ??
      DEFAULT_SUCCESS_MESSAGE;
    const statusCode = this.resolveStatusCode(context, request.method);
    return next
      .handle()
      .pipe(
        map((result: unknown) =>
          buildSuccessEnvelope({ result, statusCode, message, requestId: request.id }),
        ),
      );
  }

  /** Mirrors the status Nest will send: @HttpCode(), else 201 for POST and 200 otherwise. */
  private resolveStatusCode(context: ExecutionContext, method: string): number {
    const declared = Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as
      number | undefined;
    return declared ?? (method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);
  }
}
