import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import { EnvironmentVariables } from 'src/config/environment';
import { PrismaService } from 'src/prisma/prisma.service';

import { AuthTokensView, LoginDto, RefreshTokenDto, SessionUserView } from './dto/auth.dto';
import { PasswordService } from './password.service';

const REFRESH_TOKEN_BYTES = 48;
const MAX_USER_AGENT_LENGTH = 255;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ClientMetadata {
  userAgent?: string;
  ip?: string;
}

export interface AccessTokenPayload {
  sub: number;
  sid: string;
  role: string;
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async login(dto: LoginDto, client: ClientMetadata): Promise<AuthTokensView> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username.trim().toLowerCase() },
    });
    const passwordHash = user?.passwordHash ?? (await this.passwords.dummyHash());
    const isPasswordValid = await this.passwords.verify(passwordHash, dto.password);

    if (!user || !isPasswordValid) {
      this.logger.warn(`Failed login attempt from ip=${client.ip ?? 'unknown'}`);
      throw AppException.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Tên đăng nhập hoặc mật khẩu không đúng.',
      );
    }
    // Revealed only after the password verified, so it cannot be used to probe for accounts (E3).
    if (!user.isActive) {
      this.logger.warn(`Login refused for locked user id=${user.id}`);
      throw AppException.forbidden(
        ErrorCode.ACCOUNT_LOCKED,
        'Tài khoản đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ quản lý.',
      );
    }
    return this.openSession(user, client);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensView> {
    const currentHash = hashRefreshToken(dto.refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: currentHash },
      include: { user: true },
    });
    const now = new Date();
    if (!session) {
      await this.revokeSessionIfTokenReused(currentHash, now);
      throw this.invalidRefreshToken();
    }
    if (session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
      throw this.invalidRefreshToken();
    }

    const nextRefreshToken = this.generateRefreshToken();
    const refreshExpiresAt = this.refreshExpiry(now);
    // Compare-and-set on the old hash: of two concurrent refreshes with one token, only one wins.
    const rotated = await this.prisma.userSession.updateMany({
      where: { id: session.id, refreshTokenHash: currentHash, revokedAt: null },
      data: {
        refreshTokenHash: hashRefreshToken(nextRefreshToken),
        previousRefreshTokenHash: currentHash,
        expiresAt: refreshExpiresAt,
      },
    });
    if (rotated.count !== 1) {
      throw this.invalidRefreshToken();
    }
    return this.buildTokens(session.user, session.id, nextRefreshToken, refreshExpiresAt);
  }

  /**
   * Token-reuse detection: a token that was already rotated away is presented again, so either
   * the client or an attacker holds a stale copy. The whole session is revoked, which forces a
   * fresh login and invalidates whichever party holds the current token.
   */
  private async revokeSessionIfTokenReused(presentedHash: string, now: Date): Promise<void> {
    const reusedSession = await this.prisma.userSession.findUnique({
      where: { previousRefreshTokenHash: presentedHash },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!reusedSession) {
      return;
    }
    if (!reusedSession.revokedAt) {
      await this.prisma.userSession.updateMany({
        where: { id: reusedSession.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    this.logger.warn(
      `Refresh token reuse detected: session ${reusedSession.id} of user ${reusedSession.userId} revoked`,
    );
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: number): Promise<SessionUserView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toSessionUser(user);
  }

  private async openSession(user: User, client: ClientMetadata): Promise<AuthTokensView> {
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresAt = this.refreshExpiry(new Date());
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
        ip: client.ip,
      },
    });
    return this.buildTokens(user, session.id, refreshToken, refreshExpiresAt);
  }

  private async buildTokens(
    user: User,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthTokensView> {
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const payload: AccessTokenPayload = { sub: user.id, sid: sessionId, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresAt,
      user: this.toSessionUser(user),
    };
  }

  private toSessionUser(user: User): SessionUserView {
    return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  }

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private refreshExpiry(from: Date): Date {
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(from.getTime() + ttlDays * MILLISECONDS_PER_DAY);
  }

  private invalidRefreshToken(): AppException {
    return AppException.unauthorized(
      ErrorCode.INVALID_REFRESH_TOKEN,
      'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }
}
