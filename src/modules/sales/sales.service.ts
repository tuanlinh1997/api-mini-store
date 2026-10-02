import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MovementType, Prisma, ReferenceType, Role, SaleStatus } from '@prisma/client';

import { AuthenticatedUser } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { LockedProduct, lockProductsForUpdate } from 'src/common/locking/product-locks';
import { assertPositiveIntegerQuantity, Decimal, toDecimal, ZERO } from 'src/common/money/decimal';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { DocumentNumbersService } from 'src/common/sequences/document-numbers.service';
import { toOptionalUtcRange } from 'src/common/time/vn-time';
import { EnvironmentVariables } from 'src/config/environment';
import {
  PrismaService,
  TransactionClient,
  WRITE_TRANSACTION_OPTIONS,
} from 'src/prisma/prisma.service';

import {
  calculateLoyaltyPoints,
  calculateSale,
  CalculatedSale,
  PaymentInput,
  resolvePayments,
  ResolvedPayment,
  SaleLineInput,
} from './domain/sale-calculator';
import { CartItemDto, CreateSaleDto, ListSalesQueryDto } from './dto/sales.dto';
import { customerMatching } from './sale-filters';

const SALE_DETAIL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  payments: { orderBy: { id: 'asc' } },
  customer: {
    select: { id: true, customerCode: true, fullName: true, phone: true, loyaltyPoints: true },
  },
  cashier: { select: { id: true, fullName: true } },
} satisfies Prisma.SaleInclude;

const SALE_LIST_INCLUDE = {
  customer: { select: { id: true, customerCode: true, fullName: true } },
  cashier: { select: { id: true, fullName: true } },
  payments: { select: { method: true, amount: true } },
} satisfies Prisma.SaleInclude;

export type SaleDetail = Prisma.SaleGetPayload<{ include: typeof SALE_DETAIL_INCLUDE }>;
export type SaleListItem = Prisma.SaleGetPayload<{ include: typeof SALE_LIST_INCLUDE }>;

interface CartLine {
  productId: number;
  quantity: Decimal;
}

export interface Receipt {
  store: { name: string; address: string; phone: string };
  invoiceNo: string;
  soldAt: Date;
  cashier: { id: number; fullName: string };
  customer: { id: number; customerCode: string; fullName: string; phone: string | null } | null;
  items: {
    sku: string;
    name: string;
    quantity: Decimal;
    unitPrice: Decimal;
    discountAmount: Decimal;
    lineTotal: Decimal;
  }[];
  subtotal: Decimal;
  discountAmount: Decimal;
  total: Decimal;
  payments: {
    method: string;
    amount: Decimal;
    tenderedAmount: Decimal;
    changeAmount: Decimal;
    reference: string | null;
  }[];
  pointsEarned: number;
  customerPointsBalance: number | null;
}

/** Merges duplicate products and enforces whole-unit quantities (BR4). */
function mergeCartItems(items: readonly CartItemDto[]): CartLine[] {
  const merged = new Map<number, Decimal>();
  for (const item of items) {
    const quantity = assertPositiveIntegerQuantity(item.quantity);
    merged.set(item.productId, (merged.get(item.productId) ?? ZERO).plus(quantity));
  }
  return [...merged]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumbersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * POS checkout (UC-02). One transaction: lock products, validate stock, price the cart,
   * validate payments, then write sale + items + payments + stock + movements + points.
   * Any failure rolls everything back (E6).
   */
  async checkout(dto: CreateSaleDto, user: AuthenticatedUser): Promise<SaleDetail> {
    const cart = mergeCartItems(dto.items);
    const saleId = await this.prisma.runWriteTransaction(
      (tx) => this.executeCheckout(tx, cart, dto, user),
      WRITE_TRANSACTION_OPTIONS,
    );
    return this.findOne(saleId);
  }

  async list(query: ListSalesQueryDto): Promise<Page<SaleListItem>> {
    const where: Prisma.SaleWhereInput = {
      customerId: query.customerId,
      cashierId: query.cashierId,
      soldAt: toOptionalUtcRange(query.from, query.to),
      ...(query.search ? { invoiceNo: { contains: query.search } } : {}),
      ...(query.customerQuery ? { customer: { is: customerMatching(query.customerQuery) } } : {}),
      ...(query.paymentMethod ? { payments: { some: { method: query.paymentMethod } } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: SALE_LIST_INCLUDE,
        orderBy: { soldAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.sale.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async findOne(id: number): Promise<SaleDetail> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: SALE_DETAIL_INCLUDE,
    });
    if (!sale) {
      throw AppException.notFound(ErrorCode.SALE_NOT_FOUND, 'Không tìm thấy hóa đơn.');
    }
    return sale;
  }

  /** Read-only receipt payload; printing (or reprinting) never writes anything (UC-02 E7). */
  async getReceipt(id: number): Promise<Receipt> {
    const sale = await this.findOne(id);
    return {
      store: {
        name: this.config.get('STORE_NAME', { infer: true }),
        address: this.config.get('STORE_ADDRESS', { infer: true }),
        phone: this.config.get('STORE_PHONE', { infer: true }),
      },
      invoiceNo: sale.invoiceNo,
      soldAt: sale.soldAt,
      cashier: sale.cashier,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            customerCode: sale.customer.customerCode,
            fullName: sale.customer.fullName,
            phone: sale.customer.phone,
          }
        : null,
      items: sale.items.map((item) => ({
        sku: item.skuSnapshot,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      total: sale.total,
      payments: sale.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        tenderedAmount: payment.tenderedAmount,
        changeAmount: payment.changeAmount,
        reference: payment.reference,
      })),
      pointsEarned: sale.pointsEarned,
      customerPointsBalance: sale.customer?.loyaltyPoints ?? null,
    };
  }

  private async executeCheckout(
    tx: TransactionClient,
    cart: readonly CartLine[],
    dto: CreateSaleDto,
    user: AuthenticatedUser,
  ): Promise<number> {
    const products = await lockProductsForUpdate(
      tx,
      cart.map((line) => line.productId),
    );
    this.assertProductsSellable(cart, products);
    this.assertStockAvailable(cart, products);

    const calculated = calculateSale(
      this.toPricedLines(cart, products),
      toDecimal(dto.discountAmount ?? 0),
      this.maxDiscountPercentFor(user.role),
    );
    const payments = resolvePayments(calculated.total, this.toPaymentInputs(dto));
    await this.assertCustomerExists(tx, dto.customerId);

    const soldAt = new Date();
    const invoiceNo = await this.documentNumbers.nextInvoiceNo(tx, soldAt);
    const pointsEarned = dto.customerId
      ? calculateLoyaltyPoints(calculated.total, this.config.get('POINTS_PER_VND', { infer: true }))
      : 0;
    const sale = await this.insertSale(tx, {
      dto,
      user,
      calculated,
      payments,
      invoiceNo,
      soldAt,
      pointsEarned,
    });
    await this.applyStockAndMovements(tx, sale.id, calculated, user.id);
    if (dto.customerId && pointsEarned > 0) {
      await tx.customer.update({
        where: { id: dto.customerId },
        data: { loyaltyPoints: { increment: pointsEarned } },
      });
    }
    return sale.id;
  }

  private assertProductsSellable(
    cart: readonly CartLine[],
    products: ReadonlyMap<number, LockedProduct>,
  ): void {
    const unavailable = cart
      .map((line) => ({ productId: line.productId, product: products.get(line.productId) }))
      .filter(({ product }) => !product?.isActive)
      .map(({ productId, product }) => ({
        productId,
        reason: product ? 'INACTIVE' : 'NOT_FOUND',
      }));
    if (unavailable.length > 0) {
      throw AppException.unprocessable(
        ErrorCode.PRODUCT_UNAVAILABLE,
        'Có sản phẩm không tồn tại hoặc đã ngừng bán. Vui lòng cập nhật giỏ hàng.',
        unavailable,
      );
    }
  }

  /** BR1: never sell more than the locked, current stock (UC-02 E2/E3). */
  private assertStockAvailable(
    cart: readonly CartLine[],
    products: ReadonlyMap<number, LockedProduct>,
  ): void {
    const shortages = cart.flatMap((line) => {
      const product = products.get(line.productId);
      return product && product.stockQty.lt(line.quantity)
        ? [
            {
              productId: product.id,
              sku: product.sku,
              name: product.name,
              requested: line.quantity.toNumber(),
              available: product.stockQty.toNumber(),
            },
          ]
        : [];
    });
    if (shortages.length > 0) {
      throw AppException.conflict(
        ErrorCode.INSUFFICIENT_STOCK,
        'Không đủ tồn kho cho một số sản phẩm. Vui lòng giảm số lượng hoặc cập nhật giỏ hàng.',
        shortages,
      );
    }
  }

  /** Snapshots current price and cost per line (BR5, BR11). */
  private toPricedLines(
    cart: readonly CartLine[],
    products: ReadonlyMap<number, LockedProduct>,
  ): SaleLineInput[] {
    return cart.flatMap((line) => {
      const product = products.get(line.productId);
      return product
        ? [
            {
              productId: product.id,
              sku: product.sku,
              name: product.name,
              quantity: line.quantity,
              unitPrice: product.salePrice,
              unitCost: product.costPrice,
            },
          ]
        : [];
    });
  }

  private toPaymentInputs(dto: CreateSaleDto): PaymentInput[] {
    return dto.payments.map((payment) => ({
      method: payment.method,
      amount: toDecimal(payment.amount),
      tenderedAmount:
        payment.tenderedAmount === undefined ? undefined : toDecimal(payment.tenderedAmount),
      reference: payment.reference,
    }));
  }

  private maxDiscountPercentFor(role: Role): number {
    return role === Role.ADMIN
      ? this.config.get('MAX_DISCOUNT_PERCENT_ADMIN', { infer: true })
      : this.config.get('MAX_DISCOUNT_PERCENT_CASHIER', { infer: true });
  }

  private async assertCustomerExists(
    tx: TransactionClient,
    customerId: number | undefined,
  ): Promise<void> {
    if (customerId === undefined) {
      return;
    }
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw AppException.notFound(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng.');
    }
  }

  private async insertSale(
    tx: TransactionClient,
    input: {
      dto: CreateSaleDto;
      user: AuthenticatedUser;
      calculated: CalculatedSale;
      payments: readonly ResolvedPayment[];
      invoiceNo: string;
      soldAt: Date;
      pointsEarned: number;
    },
  ): Promise<{ id: number }> {
    const { dto, user, calculated, payments, invoiceNo, soldAt, pointsEarned } = input;
    return tx.sale.create({
      data: {
        invoiceNo,
        customerId: dto.customerId,
        cashierId: user.id,
        status: SaleStatus.PAID,
        subtotal: calculated.subtotal,
        discountAmount: calculated.discountAmount,
        total: calculated.total,
        pointsEarned,
        note: dto.note,
        soldAt,
        items: {
          create: calculated.lines.map((line) => ({
            productId: line.productId,
            skuSnapshot: line.sku,
            nameSnapshot: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCostSnapshot: line.unitCost,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
        },
        payments: {
          create: payments.map((payment) => ({
            method: payment.method,
            amount: payment.amount,
            tenderedAmount: payment.tenderedAmount,
            changeAmount: payment.changeAmount,
            paidAt: soldAt,
            reference: payment.reference,
          })),
        },
      },
      select: { id: true },
    });
  }

  private async applyStockAndMovements(
    tx: TransactionClient,
    saleId: number,
    calculated: CalculatedSale,
    userId: number,
  ): Promise<void> {
    const orderedLines = [...calculated.lines].sort((a, b) => a.productId - b.productId);
    for (const line of orderedLines) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stockQty: { decrement: line.quantity } },
      });
    }
    await tx.inventoryMovement.createMany({
      data: orderedLines.map((line) => ({
        productId: line.productId,
        movementType: MovementType.SALE,
        quantityChange: line.quantity.negated(),
        referenceType: ReferenceType.SALE,
        referenceId: saleId,
        createdBy: userId,
      })),
    });
  }
}
