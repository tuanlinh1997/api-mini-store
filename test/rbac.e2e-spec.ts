import { bearer, bootTestContext, createProduct, TestContext } from './helpers/test-app';

type Method = 'get' | 'post' | 'patch';

interface Case {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
  allowed: string[];
}

const REPORT_RANGE = 'from=2026-01-01&to=2026-01-31';

describe('RBAC (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function statusFor(username: string, testCase: Case): Promise<number> {
    const request = context
      .http()
      [testCase.method](`/api/v1${testCase.path}`)
      .set('Authorization', await bearer(context, username));
    const response = testCase.body ? await request.send(testCase.body) : await request;
    return response.status;
  }

  // "allowed" roles must NOT get 401/403; everyone else must get exactly 403.
  const cases: Case[] = [
    { method: 'get', path: '/users', allowed: ['admin'] },
    { method: 'get', path: `/reports/revenue?${REPORT_RANGE}`, allowed: ['admin'] },
    { method: 'get', path: `/reports/top-products?${REPORT_RANGE}`, allowed: ['admin'] },
    { method: 'get', path: `/reports/gross-profit?${REPORT_RANGE}`, allowed: ['admin'] },
    {
      method: 'get',
      path: `/reports/inventory?${REPORT_RANGE}`,
      allowed: ['admin', 'stockkeeper'],
    },
    { method: 'get', path: '/suppliers', allowed: ['admin', 'stockkeeper'] },
    { method: 'get', path: '/purchases', allowed: ['admin', 'stockkeeper'] },
    { method: 'get', path: '/sales', allowed: ['admin', 'cashier'] },
    { method: 'get', path: '/customers', allowed: ['admin', 'cashier'] },
    { method: 'get', path: '/inventory/stock', allowed: ['admin', 'cashier', 'stockkeeper'] },
    { method: 'get', path: '/inventory/low-stock', allowed: ['admin', 'stockkeeper'] },
    { method: 'get', path: '/inventory/movements', allowed: ['admin', 'stockkeeper'] },
    { method: 'get', path: '/inventory/stock-counts', allowed: ['admin', 'stockkeeper'] },
    { method: 'get', path: '/products', allowed: ['admin', 'cashier', 'stockkeeper'] },
    { method: 'get', path: '/categories', allowed: ['admin', 'cashier', 'stockkeeper'] },
    {
      method: 'post',
      path: '/categories',
      body: { name: 'RBAC cat' },
      allowed: ['admin', 'stockkeeper'],
    },
    { method: 'post', path: '/users', body: { username: 'x' }, allowed: ['admin'] },
    { method: 'post', path: '/sales', body: { items: [] }, allowed: ['admin', 'cashier'] },
  ];

  it.each(cases)('$method $path enforces the permission matrix', async (testCase) => {
    for (const username of ['admin', 'cashier', 'stockkeeper']) {
      const status = await statusFor(username, testCase);
      if (testCase.allowed.includes(username)) {
        expect([401, 403]).not.toContain(status);
      } else {
        expect(status).toBe(403);
      }
    }
  });

  it('returns the standard error envelope on denial', async () => {
    const response = await context
      .http()
      .get(`/api/v1/reports/revenue?${REPORT_RANGE}`)
      .set('Authorization', await bearer(context, 'cashier'))
      .expect(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: expect.any(String),
    });
  });

  it('denies every protected route without a token (deny by default)', async () => {
    await context.http().get('/api/v1/products').expect(401);
    await context.http().get('/api/v1/reports/inventory?from=2026-01-01&to=2026-01-02').expect(401);
    await context.http().post('/api/v1/sales').send({}).expect(401);
  });

  it('keeps cost data away from cashiers but visible to stockkeepers', async () => {
    const product = await createProduct(context.prisma, { costPrice: 777, stockQty: 3 });
    const forCashier = await context
      .http()
      .get(`/api/v1/products/${product.id}`)
      .set('Authorization', await bearer(context, 'cashier'))
      .expect(200);
    const forStockkeeper = await context
      .http()
      .get(`/api/v1/products/${product.id}`)
      .set('Authorization', await bearer(context, 'stockkeeper'))
      .expect(200);
    expect(forCashier.body).not.toHaveProperty('costPrice');
    expect(forStockkeeper.body.costPrice).toBe(777);
  });
});
