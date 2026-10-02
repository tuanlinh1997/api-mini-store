import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { EnvironmentVariables } from 'src/config/environment';
import { PrismaService } from 'src/prisma/prisma.service';

import { AuthService, hashRefreshToken } from './auth.service';
import { PasswordService } from './password.service';

const CORRECT_PASSWORD = 'correct-horse-battery';

describe('AuthService.login', () => {
  const passwords = new PasswordService();
  let activeUser: User;
  let lockedUser: User;
  let createdSessionData: Record<string, unknown> | undefined;
  let service: AuthService;

  function buildService(users: User[]): AuthService {
    const prisma = {
      user: {
        findUnique: jest.fn(({ where }: { where: { username: string } }) =>
          Promise.resolve(users.find((user) => user.username === where.username) ?? null),
        ),
      },
      userSession: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          createdSessionData = data;
          return Promise.resolve({ id: 'session-1', ...data });
        }),
      },
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as JwtService;
    const config = {
      get: (key: string) => ({ ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7 })[key],
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new AuthService(prisma, jwt, passwords, config);
  }

  async function failureOf(action: Promise<unknown>): Promise<AppException> {
    try {
      await action;
    } catch (error) {
      if (error instanceof AppException) {
        return error;
      }
      throw error;
    }
    throw new Error('expected the action to fail');
  }

  beforeAll(async () => {
    const passwordHash = await passwords.hash(CORRECT_PASSWORD);
    const base = {
      passwordHash,
      fullName: 'Test User',
      role: Role.CASHIER,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    activeUser = { ...base, id: 1, username: 'active', isActive: true };
    lockedUser = { ...base, id: 2, username: 'locked', isActive: false };
  });

  beforeEach(() => {
    createdSessionData = undefined;
    service = buildService([activeUser, lockedUser]);
  });

  it('returns the same generic error for an unknown username and a wrong password (E2)', async () => {
    const unknownUser = await failureOf(service.login({ username: 'nobody', password: 'x' }, {}));
    const wrongPassword = await failureOf(
      service.login({ username: 'active', password: 'wrong' }, {}),
    );
    expect(unknownUser.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(wrongPassword.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknownUser.message).toBe(wrongPassword.message);
    expect(unknownUser.getStatus()).toBe(wrongPassword.getStatus());
  });

  it('does not reveal a locked account when the password is wrong (E3)', async () => {
    const failure = await failureOf(service.login({ username: 'locked', password: 'wrong' }, {}));
    expect(failure.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('reports ACCOUNT_LOCKED only after the password verified (E3)', async () => {
    const failure = await failureOf(
      service.login({ username: 'locked', password: CORRECT_PASSWORD }, {}),
    );
    expect(failure.code).toBe(ErrorCode.ACCOUNT_LOCKED);
    expect(createdSessionData).toBeUndefined();
  });

  it('normalises the username and stores only the hash of the refresh token', async () => {
    const result = await service.login(
      { username: '  ACTIVE ', password: CORRECT_PASSWORD },
      { userAgent: 'jest', ip: '127.0.0.1' },
    );
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.expiresIn).toBe(900);
    expect(result.user).toEqual({
      id: 1,
      username: 'active',
      fullName: 'Test User',
      role: Role.CASHIER,
    });
    expect(createdSessionData?.refreshTokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(createdSessionData?.refreshTokenHash).not.toBe(result.refreshToken);
    expect(createdSessionData?.ip).toBe('127.0.0.1');
  });
});
