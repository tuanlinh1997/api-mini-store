import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { AllExceptionsFilter, ErrorEnvelope } from './all-exceptions.filter';

function run(exception: unknown): { status: number; body: ErrorEnvelope } {
  let sent: { status: number; body: ErrorEnvelope } = { status: 0, body: {} as ErrorEnvelope };
  const reply = {
    status: (status: number) => ({
      send: (body: ErrorEnvelope) => {
        sent = { status, body };
      },
    }),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', method: 'POST', url: '/api/v1/x?q=1' }),
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter', () => {
  it('maps AppException to the envelope with code and details', () => {
    const { status, body } = run(
      AppException.conflict(ErrorCode.INSUFFICIENT_STOCK, 'Không đủ tồn kho', [{ productId: 1 }]),
    );
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'INSUFFICIENT_STOCK',
      message: 'Không đủ tồn kho',
      details: [{ productId: 1 }],
      requestId: 'req-1',
    });
  });

  it('maps validation failures to 400 VALIDATION_ERROR with field details', () => {
    const { status, body } = run(
      new BadRequestException({ message: [{ field: 'username', messages: ['required'] }] }),
    );
    expect(status).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.details).toEqual([{ field: 'username', messages: ['required'] }]);
  });

  it('maps a Prisma unique violation to 409 DUPLICATE_VALUE', () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: 'products_sku_key' },
    });
    const { status, body } = run(error);
    expect(status).toBe(409);
    expect(body.code).toBe(ErrorCode.DUPLICATE_VALUE);
  });

  it('hides internals of unexpected errors behind a generic 500', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 127.0.0.1:3306 secret'));
    expect(status).toBe(500);
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
