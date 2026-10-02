import { PaymentMethod } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { Decimal, roundMoney, roundVnd, sumDecimals, ZERO } from 'src/common/money/decimal';

const PERCENT_DIVISOR = 100;

export interface SaleLineInput {
  productId: number;
  sku: string;
  name: string;
  quantity: Decimal;
  unitPrice: Decimal;
  unitCost: Decimal;
}

export interface CalculatedSaleLine extends SaleLineInput {
  grossAmount: Decimal;
  discountAmount: Decimal;
  lineTotal: Decimal;
}

export interface CalculatedSale {
  lines: CalculatedSaleLine[];
  subtotal: Decimal;
  discountAmount: Decimal;
  total: Decimal;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: Decimal;
  tenderedAmount?: Decimal;
  reference?: string;
}

export interface ResolvedPayment {
  method: PaymentMethod;
  amount: Decimal;
  tenderedAmount: Decimal;
  changeAmount: Decimal;
  reference?: string;
}

function invalidDiscount(message: string, details?: unknown): AppException {
  return AppException.unprocessable(ErrorCode.INVALID_DISCOUNT, message, details);
}

/**
 * Splits an invoice-level discount across lines in proportion to each line's gross amount.
 * Every line is rounded to whole VND and the last line takes the remainder, so the line
 * discounts always sum exactly to `discount`. A repair pass keeps each line within [0, gross].
 */
export function allocateDiscount(grossAmounts: readonly Decimal[], discount: Decimal): Decimal[] {
  if (discount.isZero()) {
    return grossAmounts.map(() => ZERO);
  }
  const subtotal = sumDecimals(grossAmounts);
  const lastIndex = grossAmounts.length - 1;
  const allocations: Decimal[] = [];
  let allocated = ZERO;
  grossAmounts.forEach((gross, index) => {
    const share =
      index === lastIndex
        ? discount.minus(allocated)
        : roundVnd(discount.times(gross).div(subtotal));
    allocations.push(share);
    allocated = allocated.plus(share);
  });
  return keepWithinLineAmounts(allocations, grossAmounts, discount);
}

function keepWithinLineAmounts(
  allocations: readonly Decimal[],
  grossAmounts: readonly Decimal[],
  discount: Decimal,
): Decimal[] {
  const clamped = allocations.map((share, index) =>
    Decimal.min(Decimal.max(share, ZERO), grossAmounts[index] ?? ZERO),
  );
  let remaining = discount.minus(sumDecimals(clamped));
  const settled = clamped.map((share, index) => {
    if (remaining.isZero()) {
      return share;
    }
    const gross = grossAmounts[index] ?? ZERO;
    const adjustment = remaining.gt(0)
      ? Decimal.min(remaining, gross.minus(share).floor())
      : Decimal.max(remaining, share.negated());
    remaining = remaining.minus(adjustment);
    return share.plus(adjustment);
  });
  if (!remaining.isZero()) {
    throw invalidDiscount('Không thể phân bổ giảm giá cho các dòng hàng.');
  }
  return settled;
}

/**
 * Prices the cart: line gross amounts, the discount (BR7) and the amount payable.
 * The discount must be >= 0, strictly below the subtotal (so the total stays positive)
 * and within the role's maximum percentage of the subtotal.
 */
export function calculateSale(
  lines: readonly SaleLineInput[],
  discountAmount: Decimal,
  maxDiscountPercent: number,
): CalculatedSale {
  const grossAmounts = lines.map((line) => roundMoney(line.quantity.times(line.unitPrice)));
  const subtotal = sumDecimals(grossAmounts);
  assertDiscountAllowed(discountAmount, subtotal, maxDiscountPercent);

  const discounts = allocateDiscount(grossAmounts, discountAmount);
  const calculatedLines = lines.map((line, index): CalculatedSaleLine => {
    const grossAmount = grossAmounts[index] ?? ZERO;
    const lineDiscount = discounts[index] ?? ZERO;
    return {
      ...line,
      grossAmount,
      discountAmount: lineDiscount,
      lineTotal: grossAmount.minus(lineDiscount),
    };
  });
  return {
    lines: calculatedLines,
    subtotal,
    discountAmount,
    total: subtotal.minus(discountAmount),
  };
}

function assertDiscountAllowed(discount: Decimal, subtotal: Decimal, maxPercent: number): void {
  if (discount.lt(0)) {
    throw invalidDiscount('Giảm giá không được âm.');
  }
  if (subtotal.lte(0)) {
    throw AppException.unprocessable(
      ErrorCode.INVALID_PAYMENT,
      'Hóa đơn phải có tổng tiền lớn hơn 0.',
    );
  }
  if (discount.gte(subtotal)) {
    throw invalidDiscount('Giảm giá phải nhỏ hơn tổng tiền hàng.', {
      subtotal: subtotal.toNumber(),
    });
  }
  const maxDiscountAmount = subtotal.times(maxPercent).div(PERCENT_DIVISOR);
  if (discount.gt(maxDiscountAmount)) {
    throw invalidDiscount(`Giảm giá tối đa cho phép là ${maxPercent}% tổng tiền hàng.`, {
      maxDiscountPercent: maxPercent,
      maxDiscountAmount: maxDiscountAmount.toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber(),
    });
  }
}

function invalidPayment(message: string, details?: unknown): AppException {
  return AppException.unprocessable(ErrorCode.INVALID_PAYMENT, message, details);
}

/**
 * Validates payments against the total (UC-02 E4) and derives tendered/change amounts.
 * The sum of amounts must equal the total exactly; cash may be tendered above its amount.
 */
export function resolvePayments(
  total: Decimal,
  payments: readonly PaymentInput[],
): ResolvedPayment[] {
  const paid = sumDecimals(payments.map((payment) => payment.amount));
  if (!paid.equals(total)) {
    throw invalidPayment('Tổng số tiền thanh toán phải bằng số tiền phải trả.', {
      total: total.toNumber(),
      paid: paid.toNumber(),
    });
  }
  return payments.map(resolvePayment);
}

function resolvePayment(payment: PaymentInput): ResolvedPayment {
  const { method, amount, reference } = payment;
  if (amount.lte(0)) {
    throw invalidPayment('Số tiền thanh toán phải lớn hơn 0.');
  }
  const tenderedAmount = payment.tenderedAmount ?? amount;
  if (method === PaymentMethod.CASH) {
    if (tenderedAmount.lt(amount)) {
      throw invalidPayment('Tiền khách đưa phải lớn hơn hoặc bằng số tiền thanh toán.');
    }
    return {
      method,
      amount,
      tenderedAmount,
      changeAmount: tenderedAmount.minus(amount),
      reference,
    };
  }
  if (!tenderedAmount.equals(amount)) {
    throw invalidPayment('Phương thức không phải tiền mặt không có tiền thối.');
  }
  return { method, amount, tenderedAmount: amount, changeAmount: ZERO, reference };
}

/** BR6: one point per `pointsPerVnd` VND actually paid, rounded down. */
export function calculateLoyaltyPoints(total: Decimal, pointsPerVnd: number): number {
  return total.div(pointsPerVnd).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber();
}
