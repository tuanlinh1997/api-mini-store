import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Customer } from '@prisma/client';

import { Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  LookupCustomerQueryDto,
  UpdateCustomerDto,
} from './dto/customers.dto';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { CustomerResponse } from './dto/customers.response';

@ApiTags('Customers')
@ApiBearerAuth()
@Roles(...PERMISSIONS.CUSTOMERS_MANAGE)
@ApiEnvelopedController()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @ApiPaginatedEnvelope({ status: 200, model: CustomerResponse })
  @Get()
  async list(@Query() query: ListCustomersQueryDto): Promise<Page<Customer>> {
    return this.customersService.list(query);
  }

  /** Declared before `:id` so "lookup" is not parsed as an id. */
  @ApiOkEnvelope({ status: 200, model: CustomerResponse })
  @ApiErrors({
    404: [ErrorCode.CUSTOMER_NOT_FOUND],
  })
  @Get('lookup')
  async lookup(@Query() query: LookupCustomerQueryDto): Promise<Customer> {
    return this.customersService.lookup(query.q);
  }

  @ApiOkEnvelope({ status: 200, model: CustomerResponse })
  @ApiErrors({
    404: [ErrorCode.CUSTOMER_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Customer> {
    return this.customersService.findOne(id);
  }

  @ApiOkEnvelope({ status: 201, model: CustomerResponse })
  @ApiErrors({
    409: [ErrorCode.DUPLICATE_VALUE, ErrorCode.TRANSACTION_CONFLICT],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Tạo khách hàng thành công')
  @Post()
  async create(@Body() dto: CreateCustomerDto): Promise<Customer> {
    return this.customersService.create(dto);
  }

  @ApiOkEnvelope({ status: 200, model: CustomerResponse })
  @ApiErrors({
    404: [ErrorCode.CUSTOMER_NOT_FOUND],
    409: [ErrorCode.DUPLICATE_VALUE],
  })
  @ResponseMessage('Cập nhật khách hàng thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ): Promise<Customer> {
    return this.customersService.update(id, dto);
  }
}
