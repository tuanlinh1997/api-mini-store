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
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Purchases')
@ApiBearerAuth()
@Roles(...PERMISSIONS.PURCHASES_MANAGE)
@ApiEnvelopedController()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @ApiPaginatedEnvelope({ status: 200 })
  @Get()
  async list(@Query() query: ListPurchasesQueryDto): Promise<Page<PurchaseListItem>> {
    return this.purchasesService.list(query);
  }

  @ApiOkEnvelope({ status: 200 })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.findOne(id);
  }

  @ApiOkEnvelope({ status: 201 })
  @ResponseMessage('Tạo phiếu nhập thành công')
  @Post()
  async create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.create(dto, user);
  }

  /** Edit supplier, note or lines of a DRAFT purchase. */
  @ApiOkEnvelope({ status: 200 })
  @ResponseMessage('Cập nhật phiếu nhập thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseDto,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.update(id, dto);
  }

  /** Confirm receipt: increases stock and updates weighted-average cost. */
  @ApiOkEnvelope({ status: 200 })
  @ResponseMessage('Xác nhận nhận hàng thành công')
  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PurchaseDetail> {
    return this.purchasesService.receive(id, user);
  }

  @ApiOkEnvelope({ status: 200 })
  @ResponseMessage('Hủy phiếu nhập thành công')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseIntPipe) id: number): Promise<PurchaseDetail> {
    return this.purchasesService.cancel(id);
  }
}
