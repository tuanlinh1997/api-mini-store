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
  CreateUserDto,
  ListUsersQueryDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserView,
} from './dto/users.dto';
import { UsersService } from './users.service';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { UserResponse } from './dto/users.response';

@ApiTags('Users')
@ApiBearerAuth()
@Roles(...PERMISSIONS.USERS_MANAGE)
@ApiEnvelopedController()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiPaginatedEnvelope({ status: 200, model: UserResponse })
  @Get()
  async list(@Query() query: ListUsersQueryDto): Promise<Page<UserView>> {
    return this.usersService.list(query);
  }

  @ApiOkEnvelope({ status: 200, model: UserResponse })
  @ApiErrors({
    404: [ErrorCode.USER_NOT_FOUND],
  })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<UserView> {
    return this.usersService.findOne(id);
  }

  @ApiOkEnvelope({ status: 201, model: UserResponse })
  @ApiErrors({
    409: [ErrorCode.DUPLICATE_VALUE],
  })
  @ResponseMessage('Tạo người dùng thành công')
  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserView> {
    return this.usersService.create(dto);
  }

  @ApiOkEnvelope({ status: 200, model: UserResponse })
  @ApiErrors({
    404: [ErrorCode.USER_NOT_FOUND],
    409: [ErrorCode.LAST_ACTIVE_ADMIN, ErrorCode.TRANSACTION_CONFLICT],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Cập nhật người dùng thành công')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserView> {
    return this.usersService.update(id, dto);
  }

  @ApiOkEnvelope({ status: 200, model: UserResponse })
  @ApiErrors({
    404: [ErrorCode.USER_NOT_FOUND],
    409: [ErrorCode.CANNOT_LOCK_SELF, ErrorCode.LAST_ACTIVE_ADMIN, ErrorCode.TRANSACTION_CONFLICT],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Đã khóa tài khoản')
  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  async lock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserView> {
    return this.usersService.setActive(id, false, actor.id);
  }

  @ApiOkEnvelope({ status: 200, model: UserResponse })
  @ApiErrors({
    404: [ErrorCode.USER_NOT_FOUND],
    409: [ErrorCode.TRANSACTION_CONFLICT],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Đã mở khóa tài khoản')
  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  async unlock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserView> {
    return this.usersService.setActive(id, true, actor.id);
  }

  @ApiOkEnvelope({ status: 200 })
  @ApiErrors({
    404: [ErrorCode.USER_NOT_FOUND],
    409: [ErrorCode.TRANSACTION_CONFLICT],
    503: [ErrorCode.TRANSACTION_TIMEOUT],
  })
  @ResponseMessage('Đặt lại mật khẩu thành công')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto);
  }
}
