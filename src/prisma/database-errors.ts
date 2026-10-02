import { Prisma } from '@prisma/client';

const MYSQL_DEADLOCK = '1213';
const MYSQL_LOCK_WAIT_TIMEOUT = '1205';
const MYSQL_CHECK_VIOLATION = '3819';
const UNAVAILABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const CHECK_VIOLATION_MESSAGE = /check constraint .* is violated/i;

/** MySQL error number carried by a raw-query failure (Prisma code P2010), if any. */
function rawMysqlCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
    const code = (error.meta as { code?: unknown } | undefined)?.code;
    return code === undefined ? undefined : String(code);
  }
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/** Deadlock or lock wait timeout: safe to retry the whole transaction. */
export function isTransientTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return true;
  }
  const mysqlCode = rawMysqlCode(error);
  if (mysqlCode === MYSQL_DEADLOCK || mysqlCode === MYSQL_LOCK_WAIT_TIMEOUT) {
    return true;
  }
  return /deadlock found|lock wait timeout exceeded/i.test(messageOf(error));
}

/** Interactive transaction exceeded its timeout (Prisma P2028). */
export function isTransactionTimeout(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028';
}

/** Database unreachable, connection dropped, or connection pool exhausted. */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_PRISMA_CODES.has(error.code)
  );
}

/** MySQL CHECK constraint violation (error 3819), however Prisma surfaces it. */
export function isCheckConstraintViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') {
    return true;
  }
  if (rawMysqlCode(error) === MYSQL_CHECK_VIOLATION) {
    return true;
  }
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError) &&
    CHECK_VIOLATION_MESSAGE.test(error.message)
  );
}
