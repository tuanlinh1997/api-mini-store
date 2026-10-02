import type { TestContext } from './helpers/test-app';

const LOGIN_ATTEMPTS_ALLOWED = 3;

describe('Login rate limiting (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    process.env.LOGIN_THROTTLE_LIMIT = String(LOGIN_ATTEMPTS_ALLOWED);
    // Imported lazily: ConfigModule.forRoot() reads process.env when AppModule is first loaded.
    const { bootTestContext } = await import('./helpers/test-app');
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('answers 429 with the error envelope once the login limit is exceeded', async () => {
    for (let attempt = 0; attempt < LOGIN_ATTEMPTS_ALLOWED; attempt += 1) {
      await context
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'cashier', password: 'wrong-password' })
        .expect(401);
    }
    const blocked = await context
      .http()
      .post('/api/v1/auth/login')
      .send({ username: 'cashier', password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ statusCode: 429, code: 'TOO_MANY_REQUESTS' });
  });

  it('does not throttle other routes with the login limit', async () => {
    await context.http().get('/api/v1/health').expect(200);
    await context.http().get('/api/v1/health').expect(200);
    await context.http().get('/api/v1/health').expect(200);
    await context.http().get('/api/v1/health').expect(200);
  });
});
