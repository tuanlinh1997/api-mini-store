import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser, Roles } from 'src/common/decorators/auth.decorators';
import { Page } from 'src/common/pagination/pagination';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { CreateSaleDto, ListSalesQueryDto } from './dto/sales.dto';
import { Receipt, SaleDetail, SaleListItem, SalesService } from './sales.service';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { ReceiptResponse, SaleDetailResponse, SaleListItemResponse } from './dto/sales.response';

@ApiTags('Sales (POS)')
@ApiBearerAuth()
@ApiEnvelopedController()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /** POS checkout: creates a PAID invoice and decrements stock in one transaction. */
  @Roles(...PERMISSIONS.SALES_CREATE)
  @ApiOkEnvelope({ status: 201, model: SaleDetailResponse })
  @ApiErrors({
    404: [ErrorCode.CUSTOMER_NOT_FOUND],
    409: [ErrorCode.INSUFFICIENT_STOCK, ErrorCode.TRANSACTION_CONFLICT],
    422: [
      ErrorCode.PRODUCT_UNAVAILABLE,
      ErrorCode.INVALID_QUANTITY,
      ErrorCode.INVALID_DISCOUNT,
      ErrorCode.INVALID_PAYMENT,
    ],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Tạo hóa đơn thành công')
  @Post()
  async checkout(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SaleDetail> {
    return this.salesService.checkout(dto, user);
  }

  @Roles(...PERMISSIONS.SALES_READ)
  @ApiPaginatedEnvelope({ status: 200, model: SaleListItemResponse })
  @ApiErrors({
    400: [ErrorCode.INVALID_DATE_RANGE],
  })
  @Get()
  async list(@Query() query: ListSalesQueryDto): Promise<Page<SaleListItem>> {
    return this.salesService.list(query);
  }

  @Roles(...PERMISSIONS.SALES_READ)
  @ApiOkEnvelope({ status: 200, model: SaleDetailResponse })
  @ApiErrors({
    404: [ErrorCode.SALE_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<SaleDetail> {
    return this.salesService.findOne(id);
  }

  /** Print-friendly receipt payload. Safe to call repeatedly; never creates a sale. */
  @Roles(...PERMISSIONS.SALES_READ)
  @ApiOkEnvelope({ status: 200, model: ReceiptResponse })
  @ApiErrors({
    404: [ErrorCode.SALE_NOT_FOUND],
  })
  @Get(':id/print')
  async print(@Param('id', ParseIntPipe) id: number): Promise<Receipt> {
    return this.salesService.getReceipt(id);
  }
}
