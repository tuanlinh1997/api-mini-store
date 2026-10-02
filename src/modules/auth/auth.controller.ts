import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import {
  AuthenticatedUser,
  CurrentUser,
  Public,
  Roles,
} from 'src/common/decorators/auth.decorators';
import { PERMISSIONS } from 'src/common/permissions/permissions';

import { AuthService, ClientMetadata } from './auth.service';
import { AuthTokensView, LoginDto, RefreshTokenDto, SessionUserView } from './dto/auth.dto';
import { LoginThrottle } from './login-throttle.decorator';
import {
  ApiEnvelopedController,
  ApiOkEnvelope,
  ApiErrors,
} from 'src/common/swagger/envelope.decorators';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ErrorCode } from 'src/common/errors/error-codes';
import { AuthTokensResponse, SessionUserResponse } from './dto/auth.response';

function clientMetadata(request: FastifyRequest): ClientMetadata {
  return { userAgent: request.headers['user-agent'], ip: request.ip };
}

@ApiTags('Auth')
@ApiEnvelopedController()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Exchange username + password for an access token and a rotating refresh token. */
  @Public()
  @LoginThrottle()
  @ApiOkEnvelope({ status: 200, model: AuthTokensResponse })
  @ApiErrors({
    401: [ErrorCode.INVALID_CREDENTIALS],
    403: [ErrorCode.ACCOUNT_LOCKED],
  })
  @ResponseMessage('Đăng nhập thành công')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: FastifyRequest): Promise<AuthTokensView> {
    return this.authService.login(dto, clientMetadata(request));
  }

  /** Rotate the refresh token and get a new access token. */
  @Public()
  @ApiOkEnvelope({ status: 200, model: AuthTokensResponse })
  @ApiErrors({
    401: [ErrorCode.INVALID_REFRESH_TOKEN],
  })
  @ResponseMessage('Làm mới phiên đăng nhập thành công')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensView> {
    return this.authService.refresh(dto);
  }

  /** Revoke the current session; the access token stops working immediately. */
  @ApiBearerAuth()
  @Roles(...PERMISSIONS.AUTHENTICATED)
  @ApiOkEnvelope({ status: 200 })
  @ResponseMessage('Đăng xuất thành công')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  @ApiBearerAuth()
  @Roles(...PERMISSIONS.AUTHENTICATED)
  @ApiOkEnvelope({ status: 200, model: SessionUserResponse })
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<SessionUserView> {
    return this.authService.getProfile(user.id);
  }
}
