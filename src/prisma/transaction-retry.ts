import { Logger } from '@nestjs/common';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { isTransientTransactionConflict } from './database-errors';

export const MAX_TRANSACTION_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 25;
const JITTER_MS = 50;

export interface RetryOptions {
  maxAttempts?: number;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injectable for tests; returns a number in [0, 1). */
  random?: () => number;
}

const logger = new Logger('TransactionRetry');

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Runs a whole transaction again when MySQL aborts it with a deadlock or lock wait timeout.
 * This is the one place a try/catch is justified: only transient lock conflicts are retried
 * (with short jittered back-off); every other error propagates untouched to the global filter.
 * When attempts run out the caller gets 409 TRANSACTION_CONFLICT. The operation must be safe to
 * re-run from scratch, which holds for our transactions: they commit all-or-nothing.
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_TRANSACTION_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientTransactionConflict(error)) {
        throw error;
      }
      if (attempt >= maxAttempts) {
        logger.warn(`Transaction still conflicting after ${attempt} attempts; giving up`);
        throw AppException.conflict(
          ErrorCode.TRANSACTION_CONFLICT,
          'Hệ thống đang bận do có giao dịch đồng thời, vui lòng thử lại.',
        );
      }
      logger.warn(`Transaction conflict (attempt ${attempt}/${maxAttempts}); retrying`);
      await sleep(BASE_BACKOFF_MS * attempt + Math.floor(random() * JITTER_MS));
    }
  }
}
