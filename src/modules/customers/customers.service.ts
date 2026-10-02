import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { DocumentNumbersService } from 'src/common/sequences/document-numbers.service';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customers.dto';
import { normalizeVietnamesePhone } from './phone';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentNumbers: DocumentNumbersService,
  ) {}

  async list(query: ListCustomersQueryDto): Promise<Page<Customer>> {
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { fullName: { contains: query.search } },
            { customerCode: { contains: query.search } },
            { phone: { contains: normalizeVietnamesePhone(query.search) } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { id: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  /** POS lookup by customer code or exact phone; never guesses a customer (UC-02 E5). */
  async lookup(term: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ customerCode: term }, { phone: normalizeVietnamesePhone(term) }] },
    });
    if (!customer) {
      throw this.customerNotFound();
    }
    return customer;
  }

  async findOne(id: number): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw this.customerNotFound();
    }
    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    return this.prisma.$transaction(async (tx) => {
      const customerCode = await this.documentNumbers.nextCustomerCode(tx);
      return tx.customer.create({
        data: { customerCode, fullName: dto.fullName, phone: dto.phone, email: dto.email },
      });
    });
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: { fullName: dto.fullName, phone: dto.phone, email: dto.email },
    });
  }

  private customerNotFound(): AppException {
    return AppException.notFound(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng.');
  }
}
