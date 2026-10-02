import { Injectable } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './dto/suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSuppliersQueryDto): Promise<Page<Supplier>> {
    const where: Prisma.SupplierWhereInput = {
      isActive: query.isActive,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.supplier.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw AppException.notFound(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp.');
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    return this.prisma.supplier.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        note: dto.note,
      },
    });
  }

  async update(id: number, dto: UpdateSupplierDto): Promise<Supplier> {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        note: dto.note,
      },
    });
  }

  async setActive(id: number, isActive: boolean): Promise<Supplier> {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive } });
  }
}
