import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { toDecimal } from 'src/common/money/decimal';

import { buildPurchaseLines, weightedAverageCost } from './purchase-rules';

function errorCodeOf(action: () => unknown): ErrorCode | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppException ? error.code : undefined;
  }
  return undefined;
}

describe('weightedAverageCost', () => {
  it('uses the received unit cost when there is no stock on hand', () => {
    const cost = weightedAverageCost(toDecimal(0), toDecimal(999), toDecimal(10), toDecimal(2500));
    expect(cost.toNumber()).toBe(2500);
  });

  it('blends old and received cost by quantity', () => {
    // (10 * 1000 + 30 * 2000) / 40 = 1750
    const cost = weightedAverageCost(
      toDecimal(10),
      toDecimal(1000),
      toDecimal(30),
      toDecimal(2000),
    );
    expect(cost.toNumber()).toBe(1750);
  });

  it('rounds to 2 decimals half up', () => {
    // (3 * 100 + 1 * 101) / 4 = 100.25 ; (1 * 100 + 2 * 101) / 3 = 100.6666...
    expect(
      weightedAverageCost(toDecimal(3), toDecimal(100), toDecimal(1), toDecimal(101)).toString(),
    ).toBe('100.25');
    expect(
      weightedAverageCost(toDecimal(1), toDecimal(100), toDecimal(2), toDecimal(101)).toString(),
    ).toBe('100.67');
  });

  it('keeps the cost when received at the same unit cost', () => {
    const cost = weightedAverageCost(
      toDecimal(7),
      toDecimal(1234.5),
      toDecimal(5),
      toDecimal(1234.5),
    );
    expect(cost.toString()).toBe('1234.5');
  });
});

describe('buildPurchaseLines', () => {
  it('prices each line and rounds the line total to 2 decimals', () => {
    const [first] = buildPurchaseLines([{ productId: 1, quantity: 3, unitCost: 1500.5 }]);
    expect(first?.lineTotal.toString()).toBe('4501.5');
  });

  it('allows a zero unit cost', () => {
    expect(buildPurchaseLines([{ productId: 1, quantity: 1, unitCost: 0 }])).toHaveLength(1);
  });

  it('rejects a negative unit cost', () => {
    expect(
      errorCodeOf(() => buildPurchaseLines([{ productId: 1, quantity: 1, unitCost: -1 }])),
    ).toBe(ErrorCode.INVALID_PURCHASE_LINE);
  });

  it.each([0, -2, 1.5])('rejects quantity %d', (quantity) => {
    expect(errorCodeOf(() => buildPurchaseLines([{ productId: 1, quantity, unitCost: 10 }]))).toBe(
      ErrorCode.INVALID_QUANTITY,
    );
  });

  it('rejects duplicate products and empty purchases', () => {
    expect(
      errorCodeOf(() =>
        buildPurchaseLines([
          { productId: 1, quantity: 1, unitCost: 10 },
          { productId: 1, quantity: 2, unitCost: 10 },
        ]),
      ),
    ).toBe(ErrorCode.INVALID_PURCHASE_LINE);
    expect(errorCodeOf(() => buildPurchaseLines([]))).toBe(ErrorCode.INVALID_PURCHASE_LINE);
  });
});
