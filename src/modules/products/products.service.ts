import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { Decimal, toDecimal } from 'src/common/money/decimal';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/products.dto';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export interface ProductView {
  id: number;
  categoryId: number;
  category: { id: number; name: string };
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  salePrice: Decimal;
  /** Omitted for cashiers: cost is commercially sensitive. */
  costPrice?: Decimal;
  stockQty: Decimal;
  reorderLevel: Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toProductView(product: ProductRecord, viewerRole: Role): ProductView {
  const { costPrice, ...rest } = product;
  return viewerRole === Role.CASHIER ? rest : { ...rest, costPrice };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQueryDto, viewerRole: Role): Promise<Page<ProductView>> {
    const where: Prisma.ProductWhereInput = {
      categoryId: query.categoryId,
      isActive: query.isActive,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { sku: { contains: query.search } },
              { barcode: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { name: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.product.count({ where }),
    ]);
    return buildPage(
      items.map((item) => toProductView(item, viewerRole)),
      total,
      query,
    );
  }

  /** POS scan: exact barcode or SKU match, active products only (UC-02 E1). */
  async lookup(code: string, viewerRole: Role): Promise<ProductView> {
    const product = await this.prisma.product.findFirst({
      where: { isActive: true, OR: [{ barcode: code }, { sku: code }] },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw AppException.notFound(
        ErrorCode.PRODUCT_NOT_FOUND,
        'Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng bán.',
      );
    }
    return toProductView(product, viewerRole);
  }

  async findOne(id: number, viewerRole: Role): Promise<ProductView> {
    return toProductView(await this.requireProduct(id), viewerRole);
  }

  async create(dto: CreateProductDto, viewerRole: Role): Promise<ProductView> {
    await this.assertCategoryUsable(dto.categoryId);
    const created = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        unit: dto.unit,
        salePrice: toDecimal(dto.salePrice),
        costPrice: toDecimal(dto.costPrice ?? 0),
        reorderLevel: toDecimal(dto.reorderLevel ?? 0),
      },
      include: PRODUCT_INCLUDE,
    });
    return toProductView(created, viewerRole);
  }

  async update(id: number, dto: UpdateProductDto, viewerRole: Role): Promise<ProductView> {
    const existing = await this.requireProduct(id);
    if (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) {
      await this.assertCategoryUsable(dto.categoryId);
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        unit: dto.unit,
        salePrice: dto.salePrice === undefined ? undefined : toDecimal(dto.salePrice),
        reorderLevel: dto.reorderLevel === undefined ? undefined : toDecimal(dto.reorderLevel),
      },
      include: PRODUCT_INCLUDE,
    });
    return toProductView(updated, viewerRole);
  }

  async setActive(id: number, isActive: boolean, viewerRole: Role): Promise<ProductView> {
    await this.requireProduct(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { isActive },
      include: PRODUCT_INCLUDE,
    });
    return toProductView(updated, viewerRole);
  }

  private async requireProduct(id: number): Promise<ProductRecord> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm.');
    }
    return product;
  }

  private async assertCategoryUsable(categoryId: number): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw AppException.unprocessable(ErrorCode.CATEGORY_NOT_FOUND, 'Danh mục không tồn tại.');
    }
    if (!category.isActive) {
      throw AppException.unprocessable(
        ErrorCode.CATEGORY_INACTIVE,
        'Danh mục đã ngừng sử dụng, vui lòng chọn danh mục khác.',
      );
    }
  }
}
