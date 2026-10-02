import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Authenticated staff member attached to the request by the JWT guard. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/** Marks a route as reachable without authentication (login, refresh, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to the given roles. Routes with neither @Public nor @Roles are denied.
 * The roles are also published in the OpenAPI document as `x-roles`.
 */
export const Roles = (...roles: readonly Role[]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiExtension('x-roles', [...roles]));

/** Injects the authenticated user (set by JwtAuthGuard) into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<FastifyRequest>().user,
);
