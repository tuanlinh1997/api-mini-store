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

import { AuthenticatedUser, CurrentUser, Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import {
  CreateProductDto,
  ListProductsQueryDto,
  LookupProductQueryDto,
  UpdateProductDto,
} from './dto/products.dto';
import { ProductsService, ProductView } from './products.service';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { ProductResponse } from './dto/products.response';

@ApiTags('Products')
@ApiBearerAuth()
@ApiEnvelopedController()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles(...PERMISSIONS.CATALOG_READ)
  @ApiPaginatedEnvelope({ status: 200, model: ProductResponse })
  @Get()
  async list(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Page<ProductView>> {
    return this.productsService.list(query, user.role);
  }

  /** Declared before `:id` so "lookup" is not parsed as an id. */
  @Roles(...PERMISSIONS.CATALOG_READ)
  @ApiOkEnvelope({ status: 200, model: ProductResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
  })
  @Get('lookup')
  async lookup(
    @Query() query: LookupProductQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.lookup(query.code, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_READ)
  @ApiOkEnvelope({ status: 200, model: ProductResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
  })
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.findOne(id, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 201, model: ProductResponse })
  @ApiErrors({
    409: [ErrorCode.DUPLICATE_VALUE],
    422: [ErrorCode.CATEGORY_NOT_FOUND, ErrorCode.CATEGORY_INACTIVE],
  })
  @ResponseMessage('Tạo sản phẩm thành công')
  @Post()
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.create(dto, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: ProductResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
    409: [ErrorCode.DUPLICATE_VALUE],
    422: [ErrorCode.CATEGORY_NOT_FOUND, ErrorCode.CATEGORY_INACTIVE],
  })
  @ResponseMessage('Cập nhật sản phẩm thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.update(id, dto, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: ProductResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
  })
  @ResponseMessage('Ngừng sử dụng sản phẩm thành công')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.setActive(id, false, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: ProductResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
  })
  @ResponseMessage('Kích hoạt lại sản phẩm thành công')
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.setActive(id, true, user.role);
  }
}
