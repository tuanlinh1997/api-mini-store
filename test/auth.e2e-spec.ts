import { SessionCleanupService } from 'src/modules/auth/session-cleanup.service';

import { bootTestContext, TEST_PASSWORD, TestContext } from './helpers/test-app';

interface LoginBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { username: string; role: string };
}

describe('Auth (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function login(username: string, password = TEST_PASSWORD): Promise<LoginBody> {
    const response = await context.http().post('/api/v1/auth/login').send({ username, password });
    expect(response.status).toBe(200);
    return (response.body as { data: LoginBody }).data;
  }

  it('logs in and returns tokens plus the profile; GET /auth/me works with the token', async () => {
    const body = await login('cashier');
    expect(body.user).toMatchObject({ username: 'cashier', role: 'CASHIER' });
    expect(body.expiresIn).toBe(900);

    const me = await context
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(me.body.data).toMatchObject({ username: 'cashier', role: 'CASHIER' });
  });

  it('stores only a hash of the refresh token', async () => {
    const body = await login('cashier');
    const sessions = await context.prisma.userSession.findMany({
      where: { userId: context.users.cashier.id },
    });
    expect(sessions.some((session) => session.refreshTokenHash === body.refreshToken)).toBe(false);
    expect(sessions.every((session) => session.refreshTokenHash.length === 64)).toBe(true);
  });

  it('returns the same generic 401 for an unknown user and a wrong password (E2)', async () => {
    const unknown = await context
      .http()
      .post('/api/v1/auth/login')
      .send({ username: 'ghost', password: 'whatever-123' })
      .expect(401);
    const wrong = await context
      .http()
      .post('/api/v1/auth/login')
      .send({ username: 'cashier', password: 'wrong-password' })
      .expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('rejects a missing username or password with a field-level 400 (E1)', async () => {
    const response = await context.http().post('/api/v1/auth/login').send({ username: 'cashier' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body.details)).toContain('password');
  });

  it('rejects unknown properties in the body', async () => {
    await context
      .http()
      .post('/api/v1/auth/login')
      .send({ username: 'cashier', password: TEST_PASSWORD, role: 'ADMIN' })
      .expect(400);
  });

  it('requires a valid bearer token on protected routes', async () => {
    await context.http().get('/api/v1/auth/me').expect(401);
    await context
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401);
  });

  it('logout revokes the session immediately', async () => {
    const body = await login('stockkeeper');
    const auth = `Bearer ${body.accessToken}`;
    await context.http().post('/api/v1/auth/logout').set('Authorization', auth).expect(200);
    const after = await context.http().get('/api/v1/auth/me').set('Authorization', auth);
    expect(after.status).toBe(401);
    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken })
      .expect(401);
  });

  it('rotates the refresh token: the old one stops working, the new one works', async () => {
    const first = await login('cashier');
    const rotated = await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = (rotated.body as { data: LoginBody }).data;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // The new tokens work first; replaying the old refresh token is covered by the reuse test.
    await context
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
  });

  it('revokes the whole session when an already-rotated refresh token is replayed', async () => {
    const first = await login('cashier');
    const rotated = await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = (rotated.body as { data: LoginBody }).data;

    // A stale client or an attacker replays the first token...
    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    // ...which kills the session: the newest refresh token and its access token stop working.
    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
    await context
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(401);
  });

  it('purges sessions stale for longer than the retention period and keeps the rest', async () => {
    const cleanup = context.app.get(SessionCleanupService);
    const userId = context.users.cashier.id;
    const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const session = (tag: string, expiresAt: Date, revokedAt: Date | null) => ({
      userId,
      refreshTokenHash: tag.padEnd(64, '0'),
      expiresAt,
      revokedAt,
    });
    await context.prisma.userSession.createMany({
      data: [
        session('expired-long-ago', daysAgo(40), null),
        session('revoked-long-ago', farFuture, daysAgo(35)),
        session('expired-recently', daysAgo(5), null),
        session('revoked-recently', farFuture, daysAgo(2)),
        session('still-active', farFuture, null),
      ],
    });

    expect(await cleanup.purgeStaleSessions()).toBe(2);

    const remaining = await context.prisma.userSession.findMany({
      where: {
        refreshTokenHash: {
          in: ['expired-recently', 'revoked-recently', 'still-active'].map((tag) =>
            tag.padEnd(64, '0'),
          ),
        },
      },
    });
    expect(remaining).toHaveLength(3);
    expect(await cleanup.purgeStaleSessions()).toBe(0);
  });

  describe('locking a user', () => {
    it('ends the locked user sessions immediately and blocks new logins with ACCOUNT_LOCKED', async () => {
      const victim = await login('cashier');
      const adminToken = await context.tokenFor('admin');

      await context
        .http()
        .post(`/api/v1/users/${context.users.cashier.id}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await context
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .expect(401);
      await context
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: victim.refreshToken })
        .expect(401);

      const withCorrectPassword = await context
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'cashier', password: TEST_PASSWORD })
        .expect(403);
      expect(withCorrectPassword.body.code).toBe('ACCOUNT_LOCKED');

      const withWrongPassword = await context
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'cashier', password: 'wrong-password' })
        .expect(401);
      expect(withWrongPassword.body.code).toBe('INVALID_CREDENTIALS');

      await context
        .http()
        .post(`/api/v1/users/${context.users.cashier.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await login('cashier');
    });
  });
});
