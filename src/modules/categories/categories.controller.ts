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
import { Category } from '@prisma/client';

import { Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { CategoriesService } from './categories.service';
import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto/categories.dto';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { CategoryResponse } from './dto/categories.response';

@ApiTags('Categories')
@ApiBearerAuth()
@ApiEnvelopedController()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Roles(...PERMISSIONS.CATALOG_READ)
  @ApiPaginatedEnvelope({ status: 200, model: CategoryResponse })
  @Get()
  async list(@Query() query: ListCategoriesQueryDto): Promise<Page<Category>> {
    return this.categoriesService.list(query);
  }

  @Roles(...PERMISSIONS.CATALOG_READ)
  @ApiOkEnvelope({ status: 200, model: CategoryResponse })
  @ApiErrors({
    404: [ErrorCode.CATEGORY_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 201, model: CategoryResponse })
  @ApiErrors({
    409: [ErrorCode.DUPLICATE_VALUE],
  })
  @ResponseMessage('Tạo danh mục thành công')
  @Post()
  async create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: CategoryResponse })
  @ApiErrors({
    404: [ErrorCode.CATEGORY_NOT_FOUND],
    409: [ErrorCode.DUPLICATE_VALUE],
  })
  @ResponseMessage('Cập nhật danh mục thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: CategoryResponse })
  @ApiErrors({
    404: [ErrorCode.CATEGORY_NOT_FOUND],
  })
  @ResponseMessage('Ngừng sử dụng danh mục thành công')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.setActive(id, false);
  }

  @Roles(...PERMISSIONS.CATALOG_WRITE)
  @ApiOkEnvelope({ status: 200, model: CategoryResponse })
  @ApiErrors({
    404: [ErrorCode.CATEGORY_NOT_FOUND],
  })
  @ResponseMessage('Kích hoạt lại danh mục thành công')
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.setActive(id, true);
  }
}
