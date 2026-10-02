import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser, Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { CreateSaleDto, ListSalesQueryDto } from './dto/sales.dto';
import { Receipt, SaleDetail, SaleListItem, SalesService } from './sales.service';

@ApiTags('Sales (POS)')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /** POS checkout: creates a PAID invoice and decrements stock in one transaction. */
  @Roles(...PERMISSIONS.SALES_CREATE)
  @Post()
  async checkout(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaleDetail> {
    return this.salesService.checkout(dto, user);
  }

  @Roles(...PERMISSIONS.SALES_READ)
  @Get()
  async list(@Query() query: ListSalesQueryDto): Promise<Page<SaleListItem>> {
    return this.salesService.list(query);
  }

  @Roles(...PERMISSIONS.SALES_READ)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<SaleDetail> {
    return this.salesService.findOne(id);
  }

  /** Print-friendly receipt payload. Safe to call repeatedly; never creates a sale. */
  @Roles(...PERMISSIONS.SALES_READ)
  @Get(':id/print')
  async print(@Param('id', ParseIntPipe) id: number): Promise<Receipt> {
    return this.salesService.getReceipt(id);
  }
}
