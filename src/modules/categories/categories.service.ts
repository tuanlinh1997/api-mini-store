import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoriesQueryDto): Promise<Page<Category>> {
    const where: Prisma.CategoryWhereInput = {
      isActive: query.isActive,
      ...(query.search ? { name: { contains: query.search } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(query) }),
      this.prisma.category.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw AppException.notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Không tìm thấy danh mục.');
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({
      data: { name: dto.name, description: dto.description },
    });
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
  }

  async setActive(id: number, isActive: boolean): Promise<Category> {
    await this.findOne(id);
    return this.prisma.category.update({ where: { id }, data: { isActive } });
  }
}
