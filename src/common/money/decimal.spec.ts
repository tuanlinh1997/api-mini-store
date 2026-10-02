import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import {
  assertNonNegativeIntegerQuantity,
  assertPositiveIntegerQuantity,
  roundMoney,
  roundVnd,
} from './decimal';

function errorCodeOf(action: () => unknown): ErrorCode | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppException ? error.code : undefined;
  }
  return undefined;
}

describe('assertPositiveIntegerQuantity', () => {
  it('accepts whole numbers greater than zero', () => {
    expect(assertPositiveIntegerQuantity(5).toNumber()).toBe(5);
    expect(assertPositiveIntegerQuantity('3.000').toNumber()).toBe(3);
  });

  it.each([0, -1, 0.5, 2.001])('rejects %s with INVALID_QUANTITY', (value) => {
    expect(errorCodeOf(() => assertPositiveIntegerQuantity(value))).toBe(
      ErrorCode.INVALID_QUANTITY,
    );
  });
});

describe('assertNonNegativeIntegerQuantity', () => {
  it('accepts zero and positive whole numbers', () => {
    expect(assertNonNegativeIntegerQuantity(0).toNumber()).toBe(0);
    expect(assertNonNegativeIntegerQuantity(12).toNumber()).toBe(12);
  });

  it.each([-1, 1.5])('rejects %s', (value) => {
    expect(errorCodeOf(() => assertNonNegativeIntegerQuantity(value))).toBe(
      ErrorCode.INVALID_QUANTITY,
    );
  });
});

describe('rounding', () => {
  it('roundMoney rounds half up to 2 decimals', () => {
    expect(roundMoney('1.005').toString()).toBe('1.01');
    expect(roundMoney('1.004').toString()).toBe('1');
  });

  it('roundVnd rounds half up to whole VND', () => {
    expect(roundVnd('33.5').toString()).toBe('34');
    expect(roundVnd('33.49').toString()).toBe('33');
  });
});
