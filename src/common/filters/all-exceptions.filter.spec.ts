import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { AllExceptionsFilter, ErrorEnvelope } from './all-exceptions.filter';

function envelopeFor(exception: unknown): ErrorEnvelope {
  return new AllExceptionsFilter().toEnvelope(exception, 'req-1');
}

function knownError(
  code: string,
  meta?: Record<string, unknown>,
  message = 'db error',
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test', meta });
}

describe('AllExceptionsFilter', () => {
  it('maps AppException to the standard error envelope', () => {
    const body = envelopeFor(
      AppException.conflict(ErrorCode.INSUFFICIENT_STOCK, 'Không đủ tồn kho', [{ productId: 1 }]),
    );
    expect(body).toMatchObject({
      success: false,
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Không đủ tồn kho',
      data: null,
      details: [{ productId: 1 }],
      requestId: 'req-1',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(body).not.toHaveProperty('error');
  });

  it('omits details when there are none', () => {
    expect(envelopeFor(new NotFoundException())).not.toHaveProperty('details');
  });

  it('maps validation failures to 400 VALIDATION_ERROR with field details', () => {
    const body = envelopeFor(
      new BadRequestException({ message: [{ field: 'username', messages: ['required'] }] }),
    );
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.details).toEqual([{ field: 'username', messages: ['required'] }]);
  });

  it('maps a Prisma unique violation to 409 DUPLICATE_VALUE', () => {
    const body = envelopeFor(knownError('P2002', { target: 'products_sku_key' }));
    expect(body.statusCode).toBe(409);
    expect(body.code).toBe(ErrorCode.DUPLICATE_VALUE);
  });

  it.each([
    ['P2034', undefined],
    ['P2010', { code: '1213' }],
    ['P2010', { code: '1205' }],
  ])('maps deadlock / lock timeout (%s %j) to 409 TRANSACTION_CONFLICT', (code, meta) => {
    const body = envelopeFor(knownError(code, meta));
    expect(body.statusCode).toBe(409);
    expect(body.code).toBe(ErrorCode.TRANSACTION_CONFLICT);
    expect(body.message).toBe('Hệ thống đang bận do có giao dịch đồng thời, vui lòng thử lại.');
  });

  it('maps an interactive transaction timeout (P2028) to 503 TRANSACTION_TIMEOUT', () => {
    const body = envelopeFor(knownError('P2028'));
    expect(body.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body.code).toBe(ErrorCode.TRANSACTION_TIMEOUT);
  });

  it.each(['P1001', 'P1002', 'P1017', 'P2024'])(
    'maps database unreachable (%s) to 503 SERVICE_UNAVAILABLE',
    (code) => {
      const body = envelopeFor(knownError(code));
      expect(body.statusCode).toBe(503);
      expect(body.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(body.message).toBe('Không kết nối được cơ sở dữ liệu, vui lòng thử lại.');
    },
  );

  it('maps PrismaClientInitializationError to 503 SERVICE_UNAVAILABLE', () => {
    const body = envelopeFor(
      new Prisma.PrismaClientInitializationError("Can't reach database server", 'test', 'P1001'),
    );
    expect(body.statusCode).toBe(503);
    expect(body.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('maps CHECK constraint violations (raw 3819, P2004, unknown error text) to 422 CONSTRAINT_VIOLATION', () => {
    const checkText = "Check constraint 'chk_products_stock_qty_non_negative' is violated.";
    const cases: unknown[] = [
      knownError('P2010', { code: '3819' }),
      knownError('P2004'),
      new Prisma.PrismaClientUnknownRequestError(checkText, { clientVersion: 'test' }),
    ];
    for (const exception of cases) {
      const body = envelopeFor(exception);
      expect(body.statusCode).toBe(422);
      expect(body.code).toBe(ErrorCode.CONSTRAINT_VIOLATION);
    }
  });

  it('maps PrismaClientValidationError to 400', () => {
    const body = envelopeFor(
      new Prisma.PrismaClientValidationError('Unknown argument', { clientVersion: 'test' }),
    );
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps unknown Prisma request errors and panics to a generic 500', () => {
    const unknown = new Prisma.PrismaClientUnknownRequestError('weird failure at /secret/path', {
      clientVersion: 'test',
    });
    const panic = new Prisma.PrismaClientRustPanicError('panic', 'test');
    for (const exception of [unknown, panic]) {
      const body = envelopeFor(exception);
      expect(body.statusCode).toBe(500);
      expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(JSON.stringify(body)).not.toContain('secret');
    }
  });

  it('maps Fastify body errors (malformed JSON, media type, size) to the envelope', () => {
    const fastifyError = (statusCode: number, code: string): Error =>
      Object.assign(new Error('fastify says'), { statusCode, code });
    expect(envelopeFor(fastifyError(400, 'FST_ERR_CTP_INVALID_JSON_BODY'))).toMatchObject({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Nội dung JSON không hợp lệ.',
    });
    expect(envelopeFor(fastifyError(415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE'))).toMatchObject({
      statusCode: 415,
      code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    });
    expect(envelopeFor(fastifyError(413, 'FST_ERR_CTP_BODY_TOO_LARGE'))).toMatchObject({
      statusCode: 413,
      code: ErrorCode.PAYLOAD_TOO_LARGE,
    });
  });

  it('hides internals of unexpected errors behind a generic 500', () => {
    const body = envelopeFor(new Error('connect ECONNREFUSED 127.0.0.1:3306 secret'));
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
