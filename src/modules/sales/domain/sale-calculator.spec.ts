import { PaymentMethod } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { Decimal, sumDecimals, toDecimal } from 'src/common/money/decimal';

import {
  allocateDiscount,
  calculateLoyaltyPoints,
  calculateSale,
  resolvePayments,
  SaleLineInput,
} from './sale-calculator';

function line(productId: number, quantity: number, unitPrice: number, unitCost = 0): SaleLineInput {
  return {
    productId,
    sku: `SKU-${productId}`,
    name: `Product ${productId}`,
    quantity: toDecimal(quantity),
    unitPrice: toDecimal(unitPrice),
    unitCost: toDecimal(unitCost),
  };
}

function errorCodeOf(action: () => unknown): ErrorCode | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppException ? error.code : undefined;
  }
  return undefined;
}

describe('allocateDiscount', () => {
  it('splits proportionally and sums exactly to the discount', () => {
    const gross = [toDecimal(10000), toDecimal(20000), toDecimal(30000)];
    const allocation = allocateDiscount(gross, toDecimal(6000));
    expect(allocation.map((d) => d.toNumber())).toEqual([1000, 2000, 3000]);
  });

  it('gives the rounding remainder to the last line', () => {
    const gross = [toDecimal(10000), toDecimal(10000), toDecimal(10000)];
    const allocation = allocateDiscount(gross, toDecimal(100));
    expect(allocation.map((d) => d.toNumber())).toEqual([33, 33, 34]);
    expect(sumDecimals(allocation).toNumber()).toBe(100);
  });

  it('returns zeros when there is no discount', () => {
    const allocation = allocateDiscount([toDecimal(5000), toDecimal(7000)], toDecimal(0));
    expect(allocation.every((d) => d.isZero())).toBe(true);
  });

  it('never allocates more than a line is worth and still sums exactly', () => {
    const gross = [toDecimal(1000), toDecimal(1000), toDecimal(1)];
    const allocation = allocateDiscount(gross, toDecimal(2000));
    expect(sumDecimals(allocation).toNumber()).toBe(2000);
    allocation.forEach((share, index) => {
      expect(share.gte(0)).toBe(true);
      expect(share.lte(gross[index] ?? 0)).toBe(true);
    });
  });
});

describe('calculateSale', () => {
  const lines = [line(1, 2, 5000), line(2, 3, 10000)];

  it('computes subtotal, line totals and total with the discount allocated to lines', () => {
    const result = calculateSale(lines, toDecimal(4000), 10);
    expect(result.subtotal.toNumber()).toBe(40000);
    expect(result.total.toNumber()).toBe(36000);
    expect(result.lines.map((l) => l.discountAmount.toNumber())).toEqual([1000, 3000]);
    expect(result.lines.map((l) => l.lineTotal.toNumber())).toEqual([9000, 27000]);
  });

  it('rejects a discount above the role maximum percentage', () => {
    expect(errorCodeOf(() => calculateSale(lines, toDecimal(4001), 10))).toBe(
      ErrorCode.INVALID_DISCOUNT,
    );
  });

  it('rejects a discount equal to the subtotal even when the role cap is 100%', () => {
    expect(errorCodeOf(() => calculateSale(lines, toDecimal(40000), 100))).toBe(
      ErrorCode.INVALID_DISCOUNT,
    );
  });

  it('allows an admin discount just below the subtotal', () => {
    const result = calculateSale(lines, toDecimal(39999), 100);
    expect(result.total.toNumber()).toBe(1);
  });

  it('rejects a negative discount', () => {
    expect(errorCodeOf(() => calculateSale(lines, toDecimal(-1), 100))).toBe(
      ErrorCode.INVALID_DISCOUNT,
    );
  });

  it('rejects an invoice whose subtotal is zero', () => {
    expect(errorCodeOf(() => calculateSale([line(1, 1, 0)], toDecimal(0), 10))).toBe(
      ErrorCode.INVALID_PAYMENT,
    );
  });
});

describe('resolvePayments', () => {
  const total = toDecimal(36000);

  it('computes change for cash tendered above the amount', () => {
    const [payment] = resolvePayments(total, [
      { method: PaymentMethod.CASH, amount: total, tenderedAmount: toDecimal(50000) },
    ]);
    expect(payment?.changeAmount.toNumber()).toBe(14000);
    expect(payment?.tenderedAmount.toNumber()).toBe(50000);
  });

  it('defaults cash tendered to the amount', () => {
    const [payment] = resolvePayments(total, [{ method: PaymentMethod.CASH, amount: total }]);
    expect(payment?.tenderedAmount.toNumber()).toBe(36000);
    expect(payment?.changeAmount.isZero()).toBe(true);
  });

  it('supports split payments that sum exactly to the total', () => {
    const resolved = resolvePayments(total, [
      { method: PaymentMethod.CASH, amount: toDecimal(20000), tenderedAmount: toDecimal(20000) },
      { method: PaymentMethod.TRANSFER, amount: toDecimal(16000), reference: 'FT123' },
    ]);
    expect(resolved).toHaveLength(2);
    expect(resolved[1]?.reference).toBe('FT123');
  });

  it('rejects payments that do not add up to the total', () => {
    expect(
      errorCodeOf(() =>
        resolvePayments(total, [{ method: PaymentMethod.CASH, amount: toDecimal(35999) }]),
      ),
    ).toBe(ErrorCode.INVALID_PAYMENT);
  });

  it('rejects cash tendered below the amount', () => {
    expect(
      errorCodeOf(() =>
        resolvePayments(total, [
          { method: PaymentMethod.CASH, amount: total, tenderedAmount: toDecimal(30000) },
        ]),
      ),
    ).toBe(ErrorCode.INVALID_PAYMENT);
  });

  it('forces tendered = amount and zero change for non-cash methods', () => {
    const [payment] = resolvePayments(total, [{ method: PaymentMethod.CARD, amount: total }]);
    expect(payment?.tenderedAmount.toNumber()).toBe(36000);
    expect(payment?.changeAmount.isZero()).toBe(true);
  });

  it('rejects non-cash tendered above the amount', () => {
    expect(
      errorCodeOf(() =>
        resolvePayments(total, [
          { method: PaymentMethod.CARD, amount: total, tenderedAmount: toDecimal(40000) },
        ]),
      ),
    ).toBe(ErrorCode.INVALID_PAYMENT);
  });
});

describe('calculateLoyaltyPoints', () => {
  it.each([
    [36000, 10000, 3],
    [9999, 10000, 0],
    [10000, 10000, 1],
    [1_250_000, 10000, 125],
  ])('total %d with %d VND per point gives %d points', (total, perPoint, expected) => {
    expect(calculateLoyaltyPoints(new Decimal(total), perPoint)).toBe(expected);
  });
});
