import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

export type DecimalInput = Prisma.Decimal | number | string;

const MONEY_DECIMAL_PLACES = 2;
const VND_DECIMAL_PLACES = 0;

export const ZERO = new Decimal(0);

export function toDecimal(value: DecimalInput): Decimal {
  return new Decimal(value);
}

/** Rounds to the 2 decimal places stored in DECIMAL(12,2) columns (half up). */
export function roundMoney(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

/** Rounds to whole VND (half up). */
export function roundVnd(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(VND_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

export function sumDecimals(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

/**
 * BR4: quantities are stored as DECIMAL(12,3) but v1 only sells whole units.
 * Throws a 422 INVALID_QUANTITY unless the value is an integer greater than zero.
 */
export function assertPositiveIntegerQuantity(value: DecimalInput, label = 'Số lượng'): Decimal {
  const quantity = toDecimal(value);
  if (!quantity.isInteger() || quantity.lte(0)) {
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.INVALID_QUANTITY,
      `${label} phải là số nguyên lớn hơn 0.`,
    );
  }
  return quantity;
}

/** Like assertPositiveIntegerQuantity but allows zero (stock counts). */
export function assertNonNegativeIntegerQuantity(value: DecimalInput, label = 'Số lượng'): Decimal {
  const quantity = toDecimal(value);
  if (!quantity.isInteger() || quantity.lt(0)) {
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.INVALID_QUANTITY,
      `${label} phải là số nguyên không âm.`,
    );
  }
  return quantity;
}
