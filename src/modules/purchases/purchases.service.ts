import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, PurchaseStatus, ReferenceType } from '@prisma/client';

import { AuthenticatedUser } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { lockProductsForUpdate } from 'src/common/locking/product-locks';
import { assertPositiveIntegerQuantity } from 'src/common/money/decimal';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { DocumentNumbersService } from 'src/common/sequences/document-numbers.service';
import { toOptionalUtcRange } from 'src/common/time/vn-time';
import {
  PrismaService,
  TransactionClient,
  WRITE_TRANSACTION_OPTIONS,
} from 'src/prisma/prisma.service';

import {
  buildPurchaseLines,
  PurchaseLine,
  sumLineTotals,
  weightedAverageCost,
} from './domain/purchase-rules';
import { CreatePurchaseDto, ListPurchasesQueryDto, UpdatePurchaseDto } from './dto/purchases.dto';

const PURCHASE_DETAIL_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  creator: { select: { id: true, fullName: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
  },
} satisfies Prisma.PurchaseInclude;

const PURCHASE_LIST_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  creator: { select: { id: true, fullName: true } },
} satisfies Prisma.PurchaseInclude;

export type PurchaseDetail = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_DETAIL_INCLUDE }>;
export type PurchaseListItem = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_LIST_INCLUDE }>;

interface LockedPurchaseRow {
  id: number;
  status: PurchaseStatus;
  supplier_id: number;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumbersService,
  ) {}

  /** Creates a DRAFT purchase; with `receiveNow` it is received in the same transaction. */
  async create(dto: CreatePurchaseDto, user: AuthenticatedUser): Promise<PurchaseDetail> {
    const lines = buildPurchaseLines(dto.items);
    const purchaseId = await this.prisma.$transaction(async (tx) => {
      await this.assertSupplierActive(tx, dto.supplierId);
      await this.assertProductsActive(tx, lines);
      const purchase = await tx.purchase.create({
        data: {
          purchaseNo: await this.documentNumbers.nextPurchaseNo(tx, new Date()),
          supplierId: dto.supplierId,
          createdBy: user.id,
          status: PurchaseStatus.DRAFT,
          subtotal: sumLineTotals(lines),
          total: sumLineTotals(lines),
          note: dto.note,
          items: { create: this.toItemRows(lines) },
        },
        select: { id: true },
      });
      if (dto.receiveNow) {
        await this.receiveWithinTransaction(tx, purchase.id, user.id);
      }
      return purchase.id;
    }, WRITE_TRANSACTION_OPTIONS);
    return this.findOne(purchaseId);
  }

  async update(id: number, dto: UpdatePurchaseDto): Promise<PurchaseDetail> {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await this.lockPurchase(tx, id);
      this.assertDraft(purchase.status);
      if (dto.supplierId !== undefined) {
        await this.assertSupplierActive(tx, dto.supplierId);
      }
      const lines = dto.items ? buildPurchaseLines(dto.items) : undefined;
      if (lines) {
        await this.assertProductsActive(tx, lines);
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      }
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          note: dto.note,
          ...(lines
            ? {
                subtotal: sumLineTotals(lines),
                total: sumLineTotals(lines),
                items: { create: this.toItemRows(lines) },
              }
            : {}),
        },
      });
    }, WRITE_TRANSACTION_OPTIONS);
    return this.findOne(id);
  }

  async cancel(id: number): Promise<PurchaseDetail> {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await this.lockPurchase(tx, id);
      this.assertDraft(purchase.status);
      await tx.purchase.update({ where: { id }, data: { status: PurchaseStatus.CANCELLED } });
    });
    return this.findOne(id);
  }

  /** UC-03: the DRAFT -> RECEIVED transition is the only thing that increases stock. */
  async receive(id: number, user: AuthenticatedUser): Promise<PurchaseDetail> {
    await this.prisma.$transaction(
      (tx) => this.receiveWithinTransaction(tx, id, user.id),
      WRITE_TRANSACTION_OPTIONS,
    );
    return this.findOne(id);
  }

  async list(query: ListPurchasesQueryDto): Promise<Page<PurchaseListItem>> {
    const where: Prisma.PurchaseWhereInput = {
      status: query.status,
      supplierId: query.supplierId,
      createdAt: toOptionalUtcRange(query.from, query.to),
      ...(query.search ? { purchaseNo: { contains: query.search } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: PURCHASE_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async findOne(id: number): Promise<PurchaseDetail> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_DETAIL_INCLUDE,
    });
    if (!purchase) {
      throw this.purchaseNotFound();
    }
    return purchase;
  }

  private async receiveWithinTransaction(
    tx: TransactionClient,
    purchaseId: number,
    userId: number,
  ): Promise<void> {
    const purchase = await this.lockPurchase(tx, purchaseId);
    this.assertDraft(purchase.status);
    await this.assertSupplierActive(tx, purchase.supplier_id);

    const items = await tx.purchaseItem.findMany({
      where: { purchaseId },
      orderBy: { productId: 'asc' },
    });
    const products = await lockProductsForUpdate(
      tx,
      items.map((item) => item.productId),
    );
    const unavailable = items.filter((item) => !products.get(item.productId)?.isActive);
    if (unavailable.length > 0) {
      throw AppException.unprocessable(
        ErrorCode.PRODUCT_UNAVAILABLE,
        'Có sản phẩm không tồn tại hoặc đã ngừng hoạt động, không thể xác nhận nhận hàng.',
        unavailable.map((item) => ({ productId: item.productId })),
      );
    }

    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) {
        continue;
      }
      const quantity = assertPositiveIntegerQuantity(item.quantity);
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stockQty: { increment: quantity },
          costPrice: weightedAverageCost(
            product.stockQty,
            product.costPrice,
            quantity,
            item.unitCost,
          ),
        },
      });
    }
    await tx.inventoryMovement.createMany({
      data: items.map((item) => ({
        productId: item.productId,
        movementType: MovementType.PURCHASE,
        quantityChange: item.quantity,
        referenceType: ReferenceType.PURCHASE,
        referenceId: purchaseId,
        createdBy: userId,
      })),
    });
    const total = sumLineTotals(items);
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: PurchaseStatus.RECEIVED,
        receivedAt: new Date(),
        receivedBy: userId,
        subtotal: total,
        total,
      },
    });
  }

  /** Row lock on the purchase: two concurrent receives serialise and the second sees RECEIVED. */
  private async lockPurchase(tx: TransactionClient, id: number): Promise<LockedPurchaseRow> {
    const rows = await tx.$queryRaw<LockedPurchaseRow[]>`
      SELECT id, status, supplier_id FROM purchases WHERE id = ${id} FOR UPDATE`;
    const purchase = rows[0];
    if (!purchase) {
      throw this.purchaseNotFound();
    }
    return purchase;
  }

  private assertDraft(status: PurchaseStatus): void {
    if (status === PurchaseStatus.RECEIVED) {
      throw AppException.conflict(
        ErrorCode.PURCHASE_ALREADY_RECEIVED,
        'Phiếu nhập đã được xác nhận nhận hàng, không thể thao tác lại.',
      );
    }
    if (status === PurchaseStatus.CANCELLED) {
      throw AppException.conflict(ErrorCode.PURCHASE_CANCELLED, 'Phiếu nhập đã bị hủy.');
    }
  }

  private async assertSupplierActive(tx: TransactionClient, supplierId: number): Promise<void> {
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw AppException.unprocessable(ErrorCode.SUPPLIER_NOT_FOUND, 'Nhà cung cấp không tồn tại.');
    }
    if (!supplier.isActive) {
      throw AppException.unprocessable(
        ErrorCode.SUPPLIER_INACTIVE,
        'Nhà cung cấp đã ngừng hoạt động. Vui lòng chọn nhà cung cấp khác.',
      );
    }
  }

  private async assertProductsActive(
    tx: TransactionClient,
    lines: readonly PurchaseLine[],
  ): Promise<void> {
    const products = await tx.product.findMany({
      where: { id: { in: lines.map((line) => line.productId) } },
      select: { id: true, isActive: true },
    });
    const activeIds = new Set(products.filter((p) => p.isActive).map((p) => p.id));
    const unavailable = lines.filter((line) => !activeIds.has(line.productId));
    if (unavailable.length > 0) {
      throw AppException.unprocessable(
        ErrorCode.PRODUCT_UNAVAILABLE,
        'Có sản phẩm không tồn tại hoặc đã ngừng hoạt động.',
        unavailable.map((line) => ({ productId: line.productId })),
      );
    }
  }

  private toItemRows(
    lines: readonly PurchaseLine[],
  ): Prisma.PurchaseItemUncheckedCreateWithoutPurchaseInput[] {
    return lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal: line.lineTotal,
    }));
  }

  private purchaseNotFound(): AppException {
    return AppException.notFound(ErrorCode.PURCHASE_NOT_FOUND, 'Không tìm thấy phiếu nhập.');
  }
}
