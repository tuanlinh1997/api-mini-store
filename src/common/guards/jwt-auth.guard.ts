import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';

import { IS_PUBLIC_KEY } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { AccessTokenPayload } from 'src/modules/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | undefined): string | undefined {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : undefined;
}

/**
 * Global authentication guard. Besides verifying the JWT signature/expiry it loads the
 * session on every request, so logout, session revocation and locking a user (is_active=false)
 * take effect immediately instead of when the access token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly requestLogger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw this.unauthenticated();
    }
    const payload = await this.verifyToken(token);
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      session.userId !== payload.sub
    ) {
      throw this.unauthenticated();
    }

    request.user = {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      role: session.user.role,
      sessionId: session.id,
    };
    // Every later log line of this request (and its completion line) carries who made it.
    this.requestLogger.assign({ userId: session.user.id, role: session.user.role });
    return true;
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw this.unauthenticated();
    }
  }

  private unauthenticated(): AppException {
    return AppException.unauthorized(
      ErrorCode.UNAUTHENTICATED,
      'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
    );
  }
}
