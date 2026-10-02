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

import { CreatePurchaseDto, ListPurchasesQueryDto, UpdatePurchaseDto } from './dto/purchases.dto';
import { PurchaseDetail, PurchaseListItem, PurchasesService } from './purchases.service';

@ApiTags('Purchases')
@ApiBearerAuth()
@Roles(...PERMISSIONS.PURCHASES_MANAGE)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async list(@Query() query: ListPurchasesQueryDto): Promise<Page<PurchaseListItem>> {
    return this.purchasesService.list(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.create(dto, user);
  }

  /** Edit supplier, note or lines of a DRAFT purchase. */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseDto,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.update(id, dto);
  }

  /** Confirm receipt: increases stock and updates weighted-average cost. */
  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.receive(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.cancel(id);
  }
}
