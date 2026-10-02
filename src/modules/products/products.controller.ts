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

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles(...PERMISSIONS.CATALOG_READ)
  @Get()
  async list(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Page<ProductView>> {
    return this.productsService.list(query, user.role);
  }

  /** Declared before `:id` so "lookup" is not parsed as an id. */
  @Roles(...PERMISSIONS.CATALOG_READ)
  @Get('lookup')
  async lookup(
    @Query() query: LookupProductQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.lookup(query.code, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_READ)
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.findOne(id, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @Post()
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.create(dto, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.update(id, dto, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.setActive(id, false, user.role);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductView> {
    return this.productsService.setActive(id, true, user.role);
  }
}
