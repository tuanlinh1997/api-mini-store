import { buildOpenApiDocument } from 'src/common/swagger/openapi-document';

import { DateTime } from 'luxon';
import type { Response } from 'supertest';

import { bearer, bootTestContext, TEST_PASSWORD, TestContext } from './helpers/test-app';
import { ContractValidator, HttpMethod, toJsonSchema } from './helpers/openapi-contract';

const STORE_ZONE = 'Asia/Ho_Chi_Minh';
const API = '/api/v1';
const TODAY = DateTime.now().setZone(STORE_ZONE).toFormat('yyyy-LL-dd');

interface Created {
  id: number;
}

/**
 * Accuracy test of the API contract: real responses are validated against the schemas of the
 * OpenAPI document produced by SwaggerModule (the same document that is exported to
 * docs/backend/openapi.json). Any field that is missing, mistyped, null where it must not be,
 * or sent but undeclared fails the test.
 */
describe('OpenAPI contract conformance (e2e)', () => {
  let context: TestContext;
  let validator: ContractValidator;
  const verified = new Set<string>();

  const ids = {
    category: 0,
    supplier: 0,
    productA: 0,
    productB: 0,
    draftPurchase: 0,
    receivedPurchase: 0,
    cancelPurchase: 0,
    customer: 0,
    sale: 0,
    managedUser: 0,
  };
  let productASku = '';
  let customerPhone = '';

  beforeAll(async () => {
    context = await bootTestContext();
    validator = new ContractValidator(buildOpenApiDocument(context.app));
  });

  afterAll(async () => {
    await context.app.close();
  });

  /** Sends a request as `username` (or anonymously) and returns the raw response. */
  async function send(
    method: 'get' | 'post' | 'patch',
    path: string,
    options: { as?: string; body?: Record<string, unknown> } = {},
  ): Promise<Response> {
    let pending = context.http()[method](`${API}${path}`);
    if (options.as) {
      pending = pending.set('Authorization', await bearer(context, options.as));
    }
    return options.body ? pending.send(options.body) : pending;
  }

  /** Asserts the response status and that its body conforms to the spec of `method template`. */
  function conforms(
    response: Response,
    method: HttpMethod,
    template: string,
    expectedStatus: number,
  ): unknown {
    expect(response.status).toBe(expectedStatus);
    const result = validator.check(method, `${API}${template}`, response.status, response.body);
    if (!result.ok) {
      throw new Error(result.message);
    }
    verified.add(result.message);
    return (response.body as { data: unknown }).data;
  }

  async function createdId(
    response: Response,
    method: HttpMethod,
    template: string,
  ): Promise<number> {
    return (conforms(response, method, template, 201) as Created).id;
  }

  it('GET /health', async () => {
    conforms(await send('get', '/health'), 'get', '/health', 200);
  });

  describe('auth', () => {
    it('POST /auth/login, POST /auth/refresh, GET /auth/me, POST /auth/logout', async () => {
      const login = await send('post', '/auth/login', {
        body: { username: 'Admin', password: TEST_PASSWORD },
      });
      const tokens = conforms(login, 'post', '/auth/login', 200) as {
        accessToken: string;
        refreshToken: string;
      };

      const refreshed = await send('post', '/auth/refresh', {
        body: { refreshToken: tokens.refreshToken },
      });
      const rotated = conforms(refreshed, 'post', '/auth/refresh', 200) as {
        accessToken: string;
      };

      const me = await context
        .http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${rotated.accessToken}`);
      expect(conforms(me, 'get', '/auth/me', 200)).toMatchObject({ username: 'admin' });

      const logout = await context
        .http()
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${rotated.accessToken}`);
      expect(conforms(logout, 'post', '/auth/logout', 200)).toBeNull();
    });
  });

  describe('catalog', () => {
    it('categories: create, list, get, update, deactivate, activate', async () => {
      const asStockkeeper = { as: 'stockkeeper' };
      ids.category = await createdId(
        await send('post', '/categories', { ...asStockkeeper, body: { name: 'Đồ uống' } }),
        'post',
        '/categories',
      );
      conforms(await send('get', '/categories', asStockkeeper), 'get', '/categories', 200);
      conforms(
        await send('get', `/categories/${ids.category}`, asStockkeeper),
        'get',
        '/categories/{id}',
        200,
      );
      conforms(
        await send('patch', `/categories/${ids.category}`, {
          ...asStockkeeper,
          body: { description: 'Nước ngọt, nước suối' },
        }),
        'patch',
        '/categories/{id}',
        200,
      );
      conforms(
        await send('post', `/categories/${ids.category}/deactivate`, asStockkeeper),
        'post',
        '/categories/{id}/deactivate',
        200,
      );
      conforms(
        await send('post', `/categories/${ids.category}/activate`, asStockkeeper),
        'post',
        '/categories/{id}/activate',
        200,
      );
    });

    it('suppliers: create, list, get, update, deactivate, activate', async () => {
      const asStockkeeper = { as: 'stockkeeper' };
      ids.supplier = await createdId(
        await send('post', '/suppliers', {
          ...asStockkeeper,
          body: { name: 'Công ty ABC', phone: '0281234567', email: 'abc@example.com' },
        }),
        'post',
        '/suppliers',
      );
      conforms(await send('get', '/suppliers', asStockkeeper), 'get', '/suppliers', 200);
      conforms(
        await send('get', `/suppliers/${ids.supplier}`, asStockkeeper),
        'get',
        '/suppliers/{id}',
        200,
      );
      conforms(
        await send('patch', `/suppliers/${ids.supplier}`, {
          ...asStockkeeper,
          body: { note: null, address: '12 Nguyễn Huệ' },
        }),
        'patch',
        '/suppliers/{id}',
        200,
      );
      conforms(
        await send('post', `/suppliers/${ids.supplier}/deactivate`, asStockkeeper),
        'post',
        '/suppliers/{id}/deactivate',
        200,
      );
      conforms(
        await send('post', `/suppliers/${ids.supplier}/activate`, asStockkeeper),
        'post',
        '/suppliers/{id}/activate',
        200,
      );
    });

    it('products: create, list, get, lookup, update, deactivate, activate', async () => {
      const asStockkeeper = { as: 'stockkeeper' };
      productASku = 'COCA-330';
      const base = { categoryId: ids.category, unit: 'lon' };
      const created = await send('post', '/products', {
        ...asStockkeeper,
        body: {
          ...base,
          sku: productASku,
          barcode: '8934588063017',
          name: 'Coca-Cola lon 330ml',
          salePrice: 10000,
          costPrice: 6000,
          reorderLevel: 24,
        },
      });
      ids.productA = await createdId(created, 'post', '/products');
      expect((created.body as { data: { costPrice?: number } }).data.costPrice).toBe(6000);
      ids.productB = await createdId(
        await send('post', '/products', {
          ...asStockkeeper,
          body: {
            ...base,
            sku: 'NUOC-500',
            name: 'Nước suối 500ml',
            salePrice: 5000,
            reorderLevel: 50,
          },
        }),
        'post',
        '/products',
      );

      conforms(await send('get', '/products', asStockkeeper), 'get', '/products', 200);
      conforms(
        await send('get', `/products/${ids.productA}`, asStockkeeper),
        'get',
        '/products/{id}',
        200,
      );
      conforms(
        await send('get', `/products/lookup?code=${productASku}`, asStockkeeper),
        'get',
        '/products/lookup',
        200,
      );
      conforms(
        await send('patch', `/products/${ids.productA}`, {
          ...asStockkeeper,
          body: { salePrice: 10000, barcode: null },
        }),
        'patch',
        '/products/{id}',
        200,
      );
      conforms(
        await send('post', `/products/${ids.productA}/deactivate`, asStockkeeper),
        'post',
        '/products/{id}/deactivate',
        200,
      );
      conforms(
        await send('post', `/products/${ids.productA}/activate`, asStockkeeper),
        'post',
        '/products/{id}/activate',
        200,
      );
    });
  });

  describe('purchasing', () => {
    const line = (
      productId: number,
      quantity: number,
      unitCost: number,
    ): Record<string, unknown> => ({
      productId,
      quantity,
      unitCost,
    });

    it('purchases: create draft, list, get, edit, receive, receiveNow, cancel', async () => {
      const asStockkeeper = { as: 'stockkeeper' };
      ids.draftPurchase = await createdId(
        await send('post', '/purchases', {
          ...asStockkeeper,
          body: {
            supplierId: ids.supplier,
            note: 'Giao sáng',
            items: [line(ids.productA, 100, 6000)],
          },
        }),
        'post',
        '/purchases',
      );
      conforms(await send('get', '/purchases', asStockkeeper), 'get', '/purchases', 200);
      conforms(
        await send('get', `/purchases/${ids.draftPurchase}`, asStockkeeper),
        'get',
        '/purchases/{id}',
        200,
      );
      conforms(
        await send('patch', `/purchases/${ids.draftPurchase}`, {
          ...asStockkeeper,
          body: { note: null, items: [line(ids.productA, 100, 6000), line(ids.productB, 5, 3000)] },
        }),
        'patch',
        '/purchases/{id}',
        200,
      );
      const received = conforms(
        await send('post', `/purchases/${ids.draftPurchase}/receive`, asStockkeeper),
        'post',
        '/purchases/{id}/receive',
        200,
      ) as { status: string; receivedAt: string; receivedBy: number };
      expect(received).toMatchObject({ status: 'RECEIVED' });
      expect(received.receivedBy).toEqual(expect.any(Number));

      ids.receivedPurchase = await createdId(
        await send('post', '/purchases', {
          ...asStockkeeper,
          body: {
            supplierId: ids.supplier,
            items: [line(ids.productB, 10, 3000)],
            receiveNow: true,
          },
        }),
        'post',
        '/purchases',
      );
      ids.cancelPurchase = await createdId(
        await send('post', '/purchases', {
          ...asStockkeeper,
          body: { supplierId: ids.supplier, items: [line(ids.productB, 1, 3000)] },
        }),
        'post',
        '/purchases',
      );
      conforms(
        await send('post', `/purchases/${ids.cancelPurchase}/cancel`, asStockkeeper),
        'post',
        '/purchases/{id}/cancel',
        200,
      );
    });
  });

  describe('point of sale', () => {
    it('customers: create, list, lookup, get, update', async () => {
      const asCashier = { as: 'cashier' };
      customerPhone = '0901234567';
      ids.customer = await createdId(
        await send('post', '/customers', {
          ...asCashier,
          body: { fullName: 'Trần Thị Bình', phone: '+84 901 234 567' },
        }),
        'post',
        '/customers',
      );
      conforms(await send('get', '/customers', asCashier), 'get', '/customers', 200);
      conforms(
        await send('get', `/customers/lookup?q=${customerPhone}`, asCashier),
        'get',
        '/customers/lookup',
        200,
      );
      conforms(
        await send('get', `/customers/${ids.customer}`, asCashier),
        'get',
        '/customers/{id}',
        200,
      );
      conforms(
        await send('patch', `/customers/${ids.customer}`, {
          ...asCashier,
          body: { email: 'binh@example.com' },
        }),
        'patch',
        '/customers/{id}',
        200,
      );
    });

    it('cashier catalogue reads never include costPrice', async () => {
      const asCashier = { as: 'cashier' };
      const list = conforms(await send('get', '/products', asCashier), 'get', '/products', 200);
      const lookup = conforms(
        await send('get', `/products/lookup?code=${productASku}`, asCashier),
        'get',
        '/products/lookup',
        200,
      );
      const one = conforms(
        await send('get', `/products/${ids.productA}`, asCashier),
        'get',
        '/products/{id}',
        200,
      );
      for (const product of [...(list as object[]), lookup as object, one as object]) {
        expect(product).not.toHaveProperty('costPrice');
      }
    });

    it('sales: checkout (split payment, discount, customer), list, detail, receipt', async () => {
      const asCashier = { as: 'cashier' };
      const checkout = await send('post', '/sales', {
        ...asCashier,
        body: {
          customerId: ids.customer,
          items: [{ productId: ids.productA, quantity: 3 }],
          discountAmount: 1000,
          payments: [
            { method: 'CASH', amount: 20000, tenderedAmount: 25000 },
            { method: 'TRANSFER', amount: 9000, reference: 'FT26100212345' },
          ],
          note: 'Khách quen',
        },
      });
      ids.sale = await createdId(checkout, 'post', '/sales');
      expect((checkout.body as { data: object }).data).toMatchObject({
        total: 29000,
        pointsEarned: 2,
      });

      const anonymous = await send('post', '/sales', {
        ...asCashier,
        body: {
          items: [{ productId: ids.productB, quantity: 2 }],
          payments: [{ method: 'CASH', amount: 10000 }],
        },
      });
      const anonymousId = await createdId(anonymous, 'post', '/sales');

      conforms(await send('get', '/sales', asCashier), 'get', '/sales', 200);
      conforms(await send('get', `/sales/${ids.sale}`, asCashier), 'get', '/sales/{id}', 200);
      const receipt = conforms(
        await send('get', `/sales/${ids.sale}/print`, asCashier),
        'get',
        '/sales/{id}/print',
        200,
      );
      expect(receipt).toMatchObject({ customerPointsBalance: 2 });
      const anonymousReceipt = conforms(
        await send('get', `/sales/${anonymousId}/print`, asCashier),
        'get',
        '/sales/{id}/print',
        200,
      );
      expect(anonymousReceipt).toMatchObject({ customer: null, customerPointsBalance: null });
    });
  });

  describe('inventory', () => {
    it('stock, low-stock, movements, stock counts', async () => {
      const asStockkeeper = { as: 'stockkeeper' };
      conforms(
        await send('get', '/inventory/stock', { as: 'cashier' }),
        'get',
        '/inventory/stock',
        200,
      );
      const low = conforms(
        await send('get', '/inventory/low-stock', asStockkeeper),
        'get',
        '/inventory/low-stock',
        200,
      ) as unknown[];
      expect(low.length).toBeGreaterThan(0);
      conforms(
        await send('get', '/inventory/movements', asStockkeeper),
        'get',
        '/inventory/movements',
        200,
      );

      const currentStock = await context.prisma.product.findUniqueOrThrow({
        where: { id: ids.productA },
      });
      const counted = await send('post', '/inventory/stock-counts', {
        ...asStockkeeper,
        body: {
          productId: ids.productA,
          countedQty: currentStock.stockQty.toNumber() - 2,
          expectedSystemQty: currentStock.stockQty.toNumber(),
          reason: 'Hàng hỏng',
        },
      });
      conforms(counted, 'post', '/inventory/stock-counts', 201);
      conforms(
        await send('get', '/inventory/stock-counts', asStockkeeper),
        'get',
        '/inventory/stock-counts',
        200,
      );
    });
  });

  describe('reports', () => {
    const range = `from=${TODAY}&to=${TODAY}`;
    const emptyRange = 'from=2000-01-01&to=2000-01-31';

    it.each([
      ['/reports/revenue', `?${range}&groupBy=day`],
      ['/reports/revenue', `?${range}&groupBy=month`],
      ['/reports/top-products', `?${range}&limit=5&sortBy=revenue`],
      ['/reports/gross-profit', `?${range}`],
      ['/reports/revenue', `?${emptyRange}`],
      ['/reports/top-products', `?${emptyRange}`],
      ['/reports/gross-profit', `?${emptyRange}`],
    ])('admin %s%s', async (template, query) => {
      conforms(await send('get', `${template}${query}`, { as: 'admin' }), 'get', template, 200);
    });

    it.each([`?${range}`, `?${emptyRange}`, `?${range}&isActive=true&page=1&pageSize=5`])(
      'stockkeeper GET /reports/inventory%s',
      async (query) => {
        const data = conforms(
          await send('get', `/reports/inventory${query}`, { as: 'stockkeeper' }),
          'get',
          '/reports/inventory',
          200,
        );
        expect(data).toHaveProperty('products.meta.total');
      },
    );
  });

  describe('users', () => {
    it('create, list, get, update, lock, unlock, reset password', async () => {
      const asAdmin = { as: 'admin' };
      ids.managedUser = await createdId(
        await send('post', '/users', {
          ...asAdmin,
          body: {
            username: 'cashier02',
            password: 'Another-Passw0rd',
            fullName: 'Lê Văn Cường',
            role: 'CASHIER',
          },
        }),
        'post',
        '/users',
      );
      conforms(await send('get', '/users', asAdmin), 'get', '/users', 200);
      conforms(await send('get', `/users/${ids.managedUser}`, asAdmin), 'get', '/users/{id}', 200);
      conforms(
        await send('patch', `/users/${ids.managedUser}`, {
          ...asAdmin,
          body: { role: 'STOCKKEEPER' },
        }),
        'patch',
        '/users/{id}',
        200,
      );
      conforms(
        await send('post', `/users/${ids.managedUser}/lock`, asAdmin),
        'post',
        '/users/{id}/lock',
        200,
      );
      conforms(
        await send('post', `/users/${ids.managedUser}/unlock`, asAdmin),
        'post',
        '/users/{id}/unlock',
        200,
      );
      const reset = conforms(
        await send('post', `/users/${ids.managedUser}/reset-password`, {
          ...asAdmin,
          body: { newPassword: 'Brand-New-Passw0rd' },
        }),
        'post',
        '/users/{id}/reset-password',
        200,
      );
      expect(reset).toBeNull();
    });
  });

  describe('error responses', () => {
    it('401 UNAUTHENTICATED and INVALID_CREDENTIALS', async () => {
      conforms(await send('get', '/users'), 'get', '/users', 401);
      conforms(
        await send('post', '/auth/login', {
          body: { username: 'admin', password: 'wrong-password' },
        }),
        'post',
        '/auth/login',
        401,
      );
    });

    it('403 FORBIDDEN', async () => {
      conforms(await send('get', '/users', { as: 'cashier' }), 'get', '/users', 403);
    });

    it('404 SALE_NOT_FOUND', async () => {
      conforms(await send('get', '/sales/999999', { as: 'cashier' }), 'get', '/sales/{id}', 404);
    });

    it('400 VALIDATION_ERROR with field details and INVALID_DATE_RANGE', async () => {
      const invalid = await send('post', '/sales', {
        as: 'cashier',
        body: { items: [{ productId: ids.productA, quantity: 0 }], payments: [] },
      });
      conforms(invalid, 'post', '/sales', 400);
      expect((invalid.body as { details: unknown[] }).details.length).toBeGreaterThan(0);
      conforms(
        await send('get', '/reports/revenue?from=2026-10-10&to=2026-10-01', { as: 'admin' }),
        'get',
        '/reports/revenue',
        400,
      );
    });

    it('409 INSUFFICIENT_STOCK lists every short product', async () => {
      const response = await send('post', '/sales', {
        as: 'cashier',
        body: {
          items: [{ productId: ids.productA, quantity: 99999 }],
          payments: [{ method: 'CASH', amount: 999990000 }],
        },
      });
      conforms(response, 'post', '/sales', 409);
      expect((response.body as { code: string }).code).toBe('INSUFFICIENT_STOCK');
    });

    it('422 INVALID_PAYMENT when payments do not add up', async () => {
      const response = await send('post', '/sales', {
        as: 'cashier',
        body: {
          items: [{ productId: ids.productA, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 1000 }],
        },
      });
      conforms(response, 'post', '/sales', 422);
      expect((response.body as { code: string }).code).toBe('INVALID_PAYMENT');
    });

    it('409 PURCHASE_ALREADY_RECEIVED', async () => {
      const response = await send('post', `/purchases/${ids.draftPurchase}/receive`, {
        as: 'stockkeeper',
      });
      conforms(response, 'post', '/purchases/{id}/receive', 409);
      expect((response.body as { code: string }).code).toBe('PURCHASE_ALREADY_RECEIVED');
    });

    it('409 STOCK_CONFLICT carries the current stock', async () => {
      const response = await send('post', '/inventory/stock-counts', {
        as: 'stockkeeper',
        body: { productId: ids.productA, countedQty: 1, expectedSystemQty: 123456, reason: 'test' },
      });
      conforms(response, 'post', '/inventory/stock-counts', 409);
      expect((response.body as { details: object }).details).toMatchObject({
        expectedSystemQty: 123456,
      });
    });

    it('409 DUPLICATE_VALUE on a repeated SKU', async () => {
      const response = await send('post', '/products', {
        as: 'stockkeeper',
        body: {
          categoryId: ids.category,
          sku: productASku,
          name: 'Trùng SKU',
          unit: 'lon',
          salePrice: 1000,
        },
      });
      conforms(response, 'post', '/products', 409);
      expect((response.body as { code: string }).code).toBe('DUPLICATE_VALUE');
    });

    it('422 PRODUCT_UNAVAILABLE for an inactive product', async () => {
      await send('post', `/products/${ids.productB}/deactivate`, { as: 'stockkeeper' });
      const response = await send('post', '/sales', {
        as: 'cashier',
        body: {
          items: [{ productId: ids.productB, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 5000 }],
        },
      });
      await send('post', `/products/${ids.productB}/activate`, { as: 'stockkeeper' });
      conforms(response, 'post', '/sales', 422);
      expect((response.body as { details: object[] }).details[0]).toMatchObject({
        productId: ids.productB,
        reason: 'INACTIVE',
      });
    });
  });

  describe('the harness itself', () => {
    it('rejects bodies that differ from the contract', async () => {
      const response = await send('get', '/auth/me', { as: 'cashier' });
      const body = response.body as { data: Record<string, unknown> };
      const check = (mutated: unknown): boolean =>
        validator.check('get', `${API}/auth/me`, 200, mutated).ok;
      expect(check(body)).toBe(true);
      expect(check({ ...body, data: { ...body.data, role: 'OWNER' } })).toBe(false);
      expect(check({ ...body, data: { ...body.data, id: '2' } })).toBe(false);
      expect(check({ ...body, data: { ...body.data, extra: true } })).toBe(false);
      expect(check({ ...body, data: { id: 2, username: 'x', role: 'CASHIER' } })).toBe(false);
      expect(check({ ...body, statusCode: 201 })).toBe(false);
    });

    it('converts OpenAPI nullable into a JSON Schema union', () => {
      expect(toJsonSchema({ type: 'string', nullable: true })).toEqual({
        anyOf: [{ type: 'null' }, { type: 'string' }],
      });
    });

    it('has verified every documented success response (a new endpoint needs a case above)', () => {
      const missing = validator
        .documentedSuccessResponses()
        .filter((response) => !verified.has(response));
      expect(missing).toEqual([]);
    });
  });
});
