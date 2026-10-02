import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/common/decorators/auth.decorators';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import {
  InventoryReportQueryDto,
  PeriodReportQueryDto,
  TopProductsQueryDto,
} from './dto/reports.dto';
import {
  GrossProfitReport,
  InventoryReport,
  ReportsService,
  RevenueReport,
  TopProductsReport,
} from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(...PERMISSIONS.REPORTS_SALES)
  @Get('revenue')
  async revenue(@Query() query: PeriodReportQueryDto): Promise<RevenueReport> {
    return this.reportsService.revenue(query);
  }

  @Roles(...PERMISSIONS.REPORTS_SALES)
  @Get('top-products')
  async topProducts(@Query() query: TopProductsQueryDto): Promise<TopProductsReport> {
    return this.reportsService.topProducts(query);
  }

  @Roles(...PERMISSIONS.REPORTS_SALES)
  @Get('gross-profit')
  async grossProfit(@Query() query: PeriodReportQueryDto): Promise<GrossProfitReport> {
    return this.reportsService.grossProfit(query);
  }

  @Roles(...PERMISSIONS.REPORTS_INVENTORY)
  @Get('inventory')
  async inventory(@Query() query: InventoryReportQueryDto): Promise<InventoryReport> {
    return this.reportsService.inventory(query);
  }
}
