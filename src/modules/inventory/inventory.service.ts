import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, ReferenceType } from '@prisma/client';

import { AuthenticatedUser } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { lockProductsForUpdate } from 'src/common/locking/product-locks';
import { assertNonNegativeIntegerQuantity, Decimal, toDecimal } from 'src/common/money/decimal';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { DocumentNumbersService } from 'src/common/sequences/document-numbers.service';
import { toOptionalUtcRange } from 'src/common/time/vn-time';
import { escapeLike } from 'src/common/validation/validation';
import { PrismaService, WRITE_TRANSACTION_OPTIONS } from 'src/prisma/prisma.service';

import {
  CreateStockCountDto,
  ListLowStockQueryDto,
  ListMovementsQueryDto,
  ListStockCountsQueryDto,
  ListStockQueryDto,
} from './dto/inventory.dto';

const MOVEMENT_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, unit: true } },
  creator: { select: { id: true, fullName: true } },
} satisfies Prisma.InventoryMovementInclude;

const STOCK_COUNT_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, unit: true } },
  creator: { select: { id: true, fullName: true } },
} satisfies Prisma.StockCountInclude;

export type MovementView = Prisma.InventoryMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;
export type StockCountView = Prisma.StockCountGetPayload<{ include: typeof STOCK_COUNT_INCLUDE }>;

export interface StockItem {
  productId: number;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  categoryId: number;
  categoryName: string;
  stockQty: Decimal;
  reorderLevel: Decimal;
  isLowStock: boolean;
  isActive: boolean;
}

interface StockRow {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  category_id: number;
  category_name: string;
  stock_qty: Prisma.Decimal;
  reorder_level: Prisma.Decimal;
  is_active: number | boolean | bigint;
}

interface StockFilter {
  search?: string;
  categoryId?: number;
  lowStock?: boolean;
  isActive?: boolean;
}

export interface StockCountResult {
  stockCount: StockCountView;
  product: { id: number; sku: string; name: string; unit: string; stockQty: Decimal };
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumbersService,
  ) {}

  async listStock(query: ListStockQueryDto): Promise<Page<StockItem>> {
    return this.queryStock(query, query);
  }

  /** Active products at or below their reorder level. */
  async listLowStock(query: ListLowStockQueryDto): Promise<Page<StockItem>> {
    return this.queryStock({ ...query, lowStock: true, isActive: true }, query);
  }

  async listMovements(query: ListMovementsQueryDto): Promise<Page<MovementView>> {
    const where: Prisma.InventoryMovementWhereInput = {
      productId: query.productId,
      movementType: query.type,
      createdAt: toOptionalUtcRange(query.from, query.to),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async listStockCounts(query: ListStockCountsQueryDto): Promise<Page<StockCountView>> {
    const where: Prisma.StockCountWhereInput = {
      productId: query.productId,
      createdAt: toOptionalUtcRange(query.from, query.to),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockCount.findMany({
        where,
        include: STOCK_COUNT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.stockCount.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  /**
   * UC-04: record a physical count. In one transaction the product is locked, the user's
   * view of the stock is compared with the current stock (409 STOCK_CONFLICT on mismatch),
   * and the count, the ADJUSTMENT movement and the new stock are written. Cost is untouched (BR11).
   */
  async createStockCount(
    dto: CreateStockCountDto,
    user: AuthenticatedUser,
  ): Promise<StockCountResult> {
    const countedQty = assertNonNegativeIntegerQuantity(dto.countedQty, 'Số lượng đếm');
    const expectedSystemQty = toDecimal(dto.expectedSystemQty);
    const stockCountId = await this.prisma.runWriteTransaction(async (tx) => {
      const locked = await lockProductsForUpdate(tx, [dto.productId]);
      const product = locked.get(dto.productId);
      if (!product) {
        throw AppException.notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm.');
      }
      if (!product.stockQty.equals(expectedSystemQty)) {
        throw AppException.conflict(
          ErrorCode.STOCK_CONFLICT,
          'Tồn kho đã thay đổi sau khi bạn xem số liệu. Vui lòng tải lại và xác nhận lại.',
          {
            productId: product.id,
            expectedSystemQty: expectedSystemQty.toNumber(),
            currentStockQty: product.stockQty.toNumber(),
          },
        );
      }
      const difference = countedQty.minus(product.stockQty);
      const stockCount = await tx.stockCount.create({
        data: {
          countNo: await this.documentNumbers.nextStockCountNo(tx, new Date()),
          productId: product.id,
          systemQty: product.stockQty,
          countedQty,
          difference,
          reason: dto.reason,
          createdBy: user.id,
        },
        select: { id: true },
      });
      if (!difference.isZero()) {
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            movementType: MovementType.ADJUSTMENT,
            quantityChange: difference,
            referenceType: ReferenceType.STOCK_COUNT,
            referenceId: stockCount.id,
            createdBy: user.id,
            note: dto.reason,
          },
        });
      }
      await tx.product.update({ where: { id: product.id }, data: { stockQty: countedQty } });
      return stockCount.id;
    }, WRITE_TRANSACTION_OPTIONS);
    return this.loadStockCountResult(stockCountId);
  }

  private async loadStockCountResult(stockCountId: number): Promise<StockCountResult> {
    const stockCount = await this.prisma.stockCount.findUniqueOrThrow({
      where: { id: stockCountId },
      include: STOCK_COUNT_INCLUDE,
    });
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: stockCount.productId },
      select: { id: true, sku: true, name: true, unit: true, stockQty: true },
    });
    return { stockCount, product };
  }

  private async queryStock(
    filter: StockFilter,
    paging: { page: number; pageSize: number },
  ): Promise<Page<StockItem>> {
    const where = this.buildStockWhere(filter);
    const { skip, take } = toSkipTake({ page: paging.page, pageSize: paging.pageSize });
    const rows = await this.prisma.$queryRaw<StockRow[]>`
      SELECT p.id, p.sku, p.barcode, p.name, p.unit, p.category_id, c.name AS category_name,
             p.stock_qty, p.reorder_level, p.is_active
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${take} OFFSET ${skip}`;
    const counted = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM products p WHERE ${where}`;
    return buildPage(
      rows.map((row) => this.toStockItem(row)),
      Number(counted[0]?.total ?? 0),
      paging,
    );
  }

  /** Builds a fully parameterised WHERE clause (user text is bound, never concatenated). */
  private buildStockWhere(filter: StockFilter): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.is_active = ${filter.isActive === false ? 0 : 1}`,
    ];
    if (filter.search) {
      const pattern = `%${escapeLike(filter.search)}%`;
      conditions.push(
        Prisma.sql`(p.name LIKE ${pattern} OR p.sku LIKE ${pattern} OR p.barcode LIKE ${pattern})`,
      );
    }
    if (filter.categoryId !== undefined) {
      conditions.push(Prisma.sql`p.category_id = ${filter.categoryId}`);
    }
    if (filter.lowStock) {
      conditions.push(Prisma.sql`p.stock_qty <= p.reorder_level`);
    }
    return Prisma.join(conditions, ' AND ');
  }

  private toStockItem(row: StockRow): StockItem {
    const stockQty = new Decimal(row.stock_qty);
    const reorderLevel = new Decimal(row.reorder_level);
    return {
      productId: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      unit: row.unit,
      categoryId: row.category_id,
      categoryName: row.category_name,
      stockQty,
      reorderLevel,
      isLowStock: stockQty.lte(reorderLevel),
      isActive: Number(row.is_active) === 1,
    };
  }
}
