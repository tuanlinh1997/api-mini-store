import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Supplier } from '@prisma/client';

import { Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './dto/suppliers.dto';
import { SuppliersService } from './suppliers.service';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { SupplierResponse } from './dto/suppliers.response';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Roles(...PERMISSIONS.SUPPLIERS_MANAGE)
@ApiEnvelopedController()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @ApiPaginatedEnvelope({ status: 200, model: SupplierResponse })
  @Get()
  async list(@Query() query: ListSuppliersQueryDto): Promise<Page<Supplier>> {
    return this.suppliersService.list(query);
  }

  @ApiOkEnvelope({ status: 200, model: SupplierResponse })
  @ApiErrors({
    404: [ErrorCode.SUPPLIER_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Supplier> {
    return this.suppliersService.findOne(id);
  }

  @ApiOkEnvelope({ status: 201, model: SupplierResponse })
  @ResponseMessage('Tạo nhà cung cấp thành công')
  @Post()
  async create(@Body() dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersService.create(dto);
  }

  @ApiOkEnvelope({ status: 200, model: SupplierResponse })
  @ApiErrors({
    404: [ErrorCode.SUPPLIER_NOT_FOUND],
  })
  @ResponseMessage('Cập nhật nhà cung cấp thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.update(id, dto);
  }

  @ApiOkEnvelope({ status: 200, model: SupplierResponse })
  @ApiErrors({
    404: [ErrorCode.SUPPLIER_NOT_FOUND],
  })
  @ResponseMessage('Ngừng sử dụng nhà cung cấp thành công')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id', ParseIntPipe) id: number): Promise<Supplier> {
    return this.suppliersService.setActive(id, false);
  }

  @ApiOkEnvelope({ status: 200, model: SupplierResponse })
  @ApiErrors({
    404: [ErrorCode.SUPPLIER_NOT_FOUND],
  })
  @ResponseMessage('Kích hoạt lại nhà cung cấp thành công')
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id', ParseIntPipe) id: number): Promise<Supplier> {
    return this.suppliersService.setActive(id, true);
  }
}
