import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import {
  assertPositiveIntegerQuantity,
  Decimal,
  DecimalInput,
  roundMoney,
  sumDecimals,
  toDecimal,
} from 'src/common/money/decimal';

export interface PurchaseLineInput {
  productId: number;
  quantity: DecimalInput;
  unitCost: DecimalInput;
}

export interface PurchaseLine {
  productId: number;
  quantity: Decimal;
  unitCost: Decimal;
  lineTotal: Decimal;
}

/**
 * BR11 weighted-average cost: (oldQty*oldCost + receivedQty*unitCost) / (oldQty + receivedQty),
 * rounded to 2 decimals (half up). With no stock on hand the new cost is simply the unit cost.
 */
export function weightedAverageCost(
  oldQty: Decimal,
  oldCost: Decimal,
  receivedQty: Decimal,
  unitCost: Decimal,
): Decimal {
  if (oldQty.lte(0)) {
    return roundMoney(unitCost);
  }
  const totalValue = oldQty.times(oldCost).plus(receivedQty.times(unitCost));
  return roundMoney(totalValue.div(oldQty.plus(receivedQty)));
}

/**
 * Validates and prices purchase lines (UC-03 E2): at least one line, one line per product,
 * whole-unit quantities greater than 0 and a unit cost that is not negative.
 */
export function buildPurchaseLines(inputs: readonly PurchaseLineInput[]): PurchaseLine[] {
  if (inputs.length === 0) {
    throw AppException.unprocessable(
      ErrorCode.INVALID_PURCHASE_LINE,
      'Phiếu nhập phải có ít nhất một mặt hàng.',
    );
  }
  const seenProductIds = new Set<number>();
  return inputs.map((input) => {
    if (seenProductIds.has(input.productId)) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_PURCHASE_LINE,
        'Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu nhập.',
        { productId: input.productId },
      );
    }
    seenProductIds.add(input.productId);
    const quantity = assertPositiveIntegerQuantity(input.quantity);
    const unitCost = roundMoney(toDecimal(input.unitCost));
    if (unitCost.lt(0)) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_PURCHASE_LINE,
        'Đơn giá nhập không được âm.',
        { productId: input.productId },
      );
    }
    return {
      productId: input.productId,
      quantity,
      unitCost,
      lineTotal: roundMoney(quantity.times(unitCost)),
    };
  });
}

export function sumLineTotals(lines: readonly { lineTotal: Decimal }[]): Decimal {
  return sumDecimals(lines.map((line) => line.lineTotal));
}
