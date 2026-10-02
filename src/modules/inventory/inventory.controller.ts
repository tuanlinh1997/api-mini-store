import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser, Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import {
  CreateStockCountDto,
  ListLowStockQueryDto,
  ListMovementsQueryDto,
  ListStockCountsQueryDto,
  ListStockQueryDto,
} from './dto/inventory.dto';
import {
  InventoryService,
  MovementView,
  StockCountResult,
  StockCountView,
  StockItem,
} from './inventory.service';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import {
  MovementResponse,
  StockCountResponse,
  StockCountResultResponse,
  StockItemResponse,
} from './dto/inventory.response';

@ApiTags('Inventory')
@ApiBearerAuth()
@ApiEnvelopedController()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /** Current stock (cashiers may view this; no cost data is returned). */
  @Roles(...PERMISSIONS.STOCK_VIEW_CURRENT)
  @ApiPaginatedEnvelope({ status: 200, model: StockItemResponse })
  @Get('stock')
  async listStock(@Query() query: ListStockQueryDto): Promise<Page<StockItem>> {
    return this.inventoryService.listStock(query);
  }

  @Roles(...PERMISSIONS.INVENTORY_MANAGE)
  @ApiPaginatedEnvelope({ status: 200, model: StockItemResponse })
  @Get('low-stock')
  async listLowStock(@Query() query: ListLowStockQueryDto): Promise<Page<StockItem>> {
    return this.inventoryService.listLowStock(query);
  }

  @Roles(...PERMISSIONS.INVENTORY_MANAGE)
  @ApiPaginatedEnvelope({ status: 200, model: MovementResponse })
  @ApiErrors({
    400: [ErrorCode.INVALID_DATE_RANGE],
  })
  @Get('movements')
  async listMovements(@Query() query: ListMovementsQueryDto): Promise<Page<MovementView>> {
    return this.inventoryService.listMovements(query);
  }

  @Roles(...PERMISSIONS.INVENTORY_MANAGE)
  @ApiPaginatedEnvelope({ status: 200, model: StockCountResponse })
  @ApiErrors({
    400: [ErrorCode.INVALID_DATE_RANGE],
  })
  @Get('stock-counts')
  async listStockCounts(@Query() query: ListStockCountsQueryDto): Promise<Page<StockCountView>> {
    return this.inventoryService.listStockCounts(query);
  }

  @Roles(...PERMISSIONS.INVENTORY_MANAGE)
  @ApiOkEnvelope({ status: 201, model: StockCountResultResponse })
  @ApiErrors({
    404: [ErrorCode.PRODUCT_NOT_FOUND],
    409: [ErrorCode.STOCK_CONFLICT, ErrorCode.TRANSACTION_CONFLICT],
    422: [ErrorCode.INVALID_QUANTITY],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Ghi nhận kiểm kê thành công')
  @Post('stock-counts')
  async createStockCount(
    @Body() dto: CreateStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountResult> {
    return this.inventoryService.createStockCount(dto, user);
  }
}
