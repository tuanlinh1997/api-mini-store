import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { AuthenticatedUser, IS_PUBLIC_KEY, ROLES_KEY } from 'src/common/decorators/auth.decorators';
import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { RolesGuard } from './roles.guard';

function contextFor(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', url: '/api/v1/reports/revenue?from=a' }),
    }),
  } as unknown as ExecutionContext;
}

function reflectorWith(metadata: Record<string, unknown>): Reflector {
  return { getAllAndOverride: (key: string) => metadata[key] } as unknown as Reflector;
}

const cashier: AuthenticatedUser = {
  id: 7,
  username: 'cashier',
  fullName: 'Cashier',
  role: Role.CASHIER,
  sessionId: 's',
};

describe('RolesGuard', () => {
  it('allows public routes without a user', () => {
    const guard = new RolesGuard(reflectorWith({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.ADMIN, Role.CASHIER] }));
    expect(guard.canActivate(contextFor(cashier))).toBe(true);
  });

  it('denies a role that is not listed with FORBIDDEN', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(() => guard.canActivate(contextFor(cashier))).toThrow(AppException);
    try {
      guard.canActivate(contextFor(cashier));
    } catch (error) {
      expect(error instanceof AppException && error.code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it('denies by default when a route declares neither @Public nor @Roles', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(() => guard.canActivate(contextFor(cashier))).toThrow(AppException);
  });
});
