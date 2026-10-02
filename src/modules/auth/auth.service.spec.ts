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

describe('AuthService.refresh (token-reuse detection)', () => {
  const user: User = {
    id: 7,
    username: 'cashier',
    passwordHash: 'x',
    fullName: 'Cashier',
    role: Role.CASHIER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const currentToken = 'current-token';
  const staleToken = 'stale-token';
  const now = Date.now();

  interface FakeSession {
    id: string;
    userId: number;
    refreshTokenHash: string;
    previousRefreshTokenHash: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
  }
  let session: FakeSession;
  let service: AuthService;
  let revokeCalls: number;

  function matches(candidate: FakeSession, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(
      ([key, value]) => (candidate as unknown as Record<string, unknown>)[key] === value,
    );
  }

  beforeEach(() => {
    revokeCalls = 0;
    session = {
      id: 'session-1',
      userId: user.id,
      refreshTokenHash: hashRefreshToken(currentToken),
      previousRefreshTokenHash: hashRefreshToken(staleToken),
      expiresAt: new Date(now + 60_000),
      revokedAt: null,
    };
    const prisma = {
      userSession: {
        findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(matches(session, where) ? { ...session, user } : null),
        ),
        updateMany: jest.fn(
          ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeSession> }) => {
            if (!matches(session, where)) {
              return Promise.resolve({ count: 0 });
            }
            if (data.revokedAt) {
              revokeCalls += 1;
            }
            session = { ...session, ...data };
            return Promise.resolve({ count: 1 });
          },
        ),
      },
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('jwt') } as unknown as JwtService;
    const config = {
      get: (key: string) => ({ ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7 })[key],
    } as unknown as ConfigService<EnvironmentVariables, true>;
    service = new AuthService(prisma, jwt, new PasswordService(), config);
  });

  it('remembers the replaced token hash when rotating', async () => {
    const result = await service.refresh({ refreshToken: currentToken });
    expect(session.previousRefreshTokenHash).toBe(hashRefreshToken(currentToken));
    expect(session.refreshTokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(session.revokedAt).toBeNull();
  });

  it('revokes the whole session when an already-rotated token is presented again', async () => {
    await expect(service.refresh({ refreshToken: staleToken })).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    });
    expect(session.revokedAt).toBeInstanceOf(Date);
    // The legitimate (current) token no longer works either: the user must log in again.
    await expect(service.refresh({ refreshToken: currentToken })).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    });
  });

  it('does not revoke anything for a token that was never issued', async () => {
    await expect(service.refresh({ refreshToken: 'random-garbage' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    });
    expect(revokeCalls).toBe(0);
    expect(session.revokedAt).toBeNull();
  });

  it('revokes only once when the stale token is replayed repeatedly', async () => {
    await expect(service.refresh({ refreshToken: staleToken })).rejects.toBeInstanceOf(
      AppException,
    );
    await expect(service.refresh({ refreshToken: staleToken })).rejects.toBeInstanceOf(
      AppException,
    );
    expect(revokeCalls).toBe(1);
  });
});
