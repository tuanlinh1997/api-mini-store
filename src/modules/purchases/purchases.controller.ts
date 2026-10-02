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
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { PurchaseDetailResponse, PurchaseListItemResponse } from './dto/purchases.response';

@ApiTags('Purchases')
@ApiBearerAuth()
@Roles(...PERMISSIONS.PURCHASES_MANAGE)
@ApiEnvelopedController()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @ApiPaginatedEnvelope({ status: 200, model: PurchaseListItemResponse })
  @ApiErrors({
    400: [ErrorCode.INVALID_DATE_RANGE],
  })
  @Get()
  async list(@Query() query: ListPurchasesQueryDto): Promise<Page<PurchaseListItem>> {
    return this.purchasesService.list(query);
  }

  @ApiOkEnvelope({ status: 200, model: PurchaseDetailResponse })
  @ApiErrors({
    404: [ErrorCode.PURCHASE_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.findOne(id);
  }

  @ApiOkEnvelope({ status: 201, model: PurchaseDetailResponse })
  @ApiErrors({
    409: [ErrorCode.TRANSACTION_CONFLICT],
    422: [
      ErrorCode.SUPPLIER_NOT_FOUND,
      ErrorCode.SUPPLIER_INACTIVE,
      ErrorCode.PRODUCT_UNAVAILABLE,
      ErrorCode.INVALID_PURCHASE_LINE,
      ErrorCode.INVALID_QUANTITY,
    ],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Tạo phiếu nhập thành công')
  @Post()
  async create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.create(dto, user);
  }

  /** Edit supplier, note or lines of a DRAFT purchase. */
  @ApiOkEnvelope({ status: 200, model: PurchaseDetailResponse })
  @ApiErrors({
    404: [ErrorCode.PURCHASE_NOT_FOUND],
    409: [
      ErrorCode.PURCHASE_ALREADY_RECEIVED,
      ErrorCode.PURCHASE_CANCELLED,
      ErrorCode.TRANSACTION_CONFLICT,
    ],
    422: [
      ErrorCode.SUPPLIER_NOT_FOUND,
      ErrorCode.SUPPLIER_INACTIVE,
      ErrorCode.PRODUCT_UNAVAILABLE,
      ErrorCode.INVALID_PURCHASE_LINE,
      ErrorCode.INVALID_QUANTITY,
    ],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Cập nhật phiếu nhập thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseDto,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.update(id, dto);
  }

  /** Confirm receipt: increases stock and updates weighted-average cost. */
  @ApiOkEnvelope({ status: 200, model: PurchaseDetailResponse })
  @ApiErrors({
    404: [ErrorCode.PURCHASE_NOT_FOUND],
    409: [
      ErrorCode.PURCHASE_ALREADY_RECEIVED,
      ErrorCode.PURCHASE_CANCELLED,
      ErrorCode.TRANSACTION_CONFLICT,
    ],
    422: [ErrorCode.SUPPLIER_INACTIVE, ErrorCode.PRODUCT_UNAVAILABLE],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Xác nhận nhận hàng thành công')
  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.receive(id, user);
  }

  @ApiOkEnvelope({ status: 200, model: PurchaseDetailResponse })
  @ApiErrors({
    404: [ErrorCode.PURCHASE_NOT_FOUND],
    409: [
      ErrorCode.PURCHASE_ALREADY_RECEIVED,
      ErrorCode.PURCHASE_CANCELLED,
      ErrorCode.TRANSACTION_CONFLICT,
    ],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Hủy phiếu nhập thành công')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.cancel(id);
  }
}
