import { Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { withTransactionRetry } from './transaction-retry';

function deadlockError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

function rawMysqlError(mysqlCode: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Raw query failed', {
    code: 'P2010',
    clientVersion: 'test',
    meta: { code: mysqlCode, message: 'x' },
  });
}

const noDelay = { sleep: () => Promise.resolve(), random: () => 0 };

describe('withTransactionRetry', () => {
  it('returns the result without retrying when the first attempt succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('ok');
    await expect(withTransactionRetry(operation, noDelay)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries after P2034 twice and then succeeds', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(deadlockError())
      .mockRejectedValueOnce(deadlockError())
      .mockResolvedValue('committed');
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(withTransactionRetry(operation, { sleep, random: () => 0 })).resolves.toBe(
      'committed',
    );
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it.each(['1213', '1205'])('retries raw MySQL error %s (deadlock / lock wait)', async (code) => {
    const operation = jest.fn().mockRejectedValueOnce(rawMysqlError(code)).mockResolvedValue(1);
    await expect(withTransactionRetry(operation, noDelay)).resolves.toBe(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts with 409 TRANSACTION_CONFLICT', async () => {
    const operation = jest.fn().mockRejectedValue(deadlockError());
    const failure = await withTransactionRetry(operation, noDelay).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppException);
    expect((failure as AppException).code).toBe(ErrorCode.TRANSACTION_CONFLICT);
    expect((failure as AppException).getStatus()).toBe(409);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const boom = new Error('boom');
    const operation = jest.fn().mockRejectedValue(boom);
    await expect(withTransactionRetry(operation, noDelay)).rejects.toBe(boom);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry business errors thrown by the transaction body', async () => {
    const business = AppException.conflict(ErrorCode.INSUFFICIENT_STOCK, 'x');
    const operation = jest.fn().mockRejectedValue(business);
    await expect(withTransactionRetry(operation, noDelay)).rejects.toBe(business);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
