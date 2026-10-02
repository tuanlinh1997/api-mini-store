import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { buildPage, Page, toSkipTake } from 'src/common/pagination/pagination';
import { PasswordService } from 'src/modules/auth/password.service';
import { PrismaService, TransactionClient } from 'src/prisma/prisma.service';

import {
  CreateUserDto,
  ListUsersQueryDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserView,
} from './dto/users.dto';

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Page<UserView>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isActive: query.isActive,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search } },
              { fullName: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { id: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPage(items, total, query);
  }

  async findOne(id: number): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw this.userNotFound();
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    return this.prisma.user.create({
      data: {
        username: dto.username.toLowerCase(),
        passwordHash: await this.passwords.hash(dto.password),
        fullName: dto.fullName,
        role: dto.role,
      },
      select: USER_SELECT,
    });
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserView> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUser(tx, id);
      const isDemotion =
        dto.role !== undefined && dto.role !== Role.ADMIN && user.role === Role.ADMIN;
      if (isDemotion && user.isActive) {
        await this.assertAnotherActiveAdminExists(tx, id);
      }
      return tx.user.update({
        where: { id },
        data: { fullName: dto.fullName, role: dto.role },
        select: USER_SELECT,
      });
    });
  }

  /** Locks (active=false) or unlocks (active=true) an account. Locking ends all its sessions. */
  async setActive(id: number, isActive: boolean, actingUserId: number): Promise<UserView> {
    if (!isActive && id === actingUserId) {
      throw AppException.conflict(
        ErrorCode.CANNOT_LOCK_SELF,
        'Bạn không thể tự khóa tài khoản của chính mình.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await this.requireUser(tx, id);
      if (!isActive && user.isActive && user.role === Role.ADMIN) {
        await this.assertAnotherActiveAdminExists(tx, id);
      }
      const updated = await tx.user.update({
        where: { id },
        data: { isActive },
        select: USER_SELECT,
      });
      if (!isActive) {
        await this.revokeAllSessions(tx, id);
      }
      return updated;
    });
  }

  async resetPassword(id: number, dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, id);
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.revokeAllSessions(tx, id);
    });
  }

  private async requireUser(tx: TransactionClient, id: number): Promise<UserView> {
    const user = await tx.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw this.userNotFound();
    }
    return user;
  }

  private async revokeAllSessions(tx: TransactionClient, userId: number): Promise<void> {
    await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Locks every active admin row (ordered, so concurrent callers queue instead of deadlocking)
   * and requires at least one other active admin to remain.
   */
  private async assertAnotherActiveAdminExists(
    tx: TransactionClient,
    excludedUserId: number,
  ): Promise<void> {
    const activeAdmins = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1 ORDER BY id FOR UPDATE`;
    if (!activeAdmins.some((admin) => admin.id !== excludedUserId)) {
      throw AppException.conflict(
        ErrorCode.LAST_ACTIVE_ADMIN,
        'Phải còn ít nhất một quản trị viên đang hoạt động.',
      );
    }
  }

  private userNotFound(): AppException {
    return AppException.notFound(ErrorCode.USER_NOT_FOUND, 'Không tìm thấy người dùng.');
  }
}
