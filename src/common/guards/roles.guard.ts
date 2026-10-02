import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';

import { IS_PUBLIC_KEY, ROLES_KEY } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

/**
 * Global RBAC guard: deny by default. A route must be @Public() or declare @Roles(...);
 * denied attempts are logged (UC-05 E2).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('AccessControl');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const allowedRoles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = request.user;
    if (user && allowedRoles?.includes(user.role)) {
      return true;
    }

    this.logger.warn(
      `Access denied: userId=${user?.id ?? 'anonymous'} role=${user?.role ?? 'none'} ` +
        `${request.method} ${request.url.split('?')[0]} requires=[${allowedRoles?.join(',') ?? 'none'}]`,
    );
    throw AppException.forbidden(ErrorCode.FORBIDDEN, 'Bạn không có quyền thực hiện thao tác này.');
  }
}
