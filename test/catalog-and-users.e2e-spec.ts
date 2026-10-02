import { bearer, bootTestContext, createProduct, TestContext } from './helpers/test-app';

describe('Catalog, customers and users (e2e)', () => {
  let context: TestContext;
  let categoryId: number;

  beforeAll(async () => {
    context = await bootTestContext();
    const category = await context.prisma.category.create({ data: { name: 'Catalog category' } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function send(
    username: string,
    method: 'get' | 'post' | 'patch',
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const request = context
      .http()
      [method](`/api/v1${path}`)
      .set('Authorization', await bearer(context, username));
    const response = payload ? await request.send(payload) : await request;
    return { status: response.status, body: response.body };
  }

  describe('products', () => {
    it('creates a product with stock 0 and rejects stockQty from the client', async () => {
      const created = await send('stockkeeper', 'post', '/products', {
        categoryId,
        sku: 'P-NEW-1',
        barcode: '8930000000001',
        name: 'New product',
        unit: 'chai',
        salePrice: 15000,
        costPrice: 9000,
        reorderLevel: 4,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        sku: 'P-NEW-1',
        stockQty: 0,
        costPrice: 9000,
        isActive: true,
      });

      const withStock = await send('admin', 'post', '/products', {
        categoryId,
        sku: 'P-NEW-2',
        name: 'x',
        unit: 'u',
        salePrice: 1,
        stockQty: 50,
      });
      expect(withStock.status).toBe(400);
    });

    it('enforces unique SKU and unique barcode, and non-negative prices', async () => {
      const base = { categoryId, name: 'Dup', unit: 'u', salePrice: 1000 };
      await send('admin', 'post', '/products', { ...base, sku: 'DUP-1', barcode: '111111' });
      const sameSku = await send('admin', 'post', '/products', { ...base, sku: 'DUP-1' });
      expect(sameSku.status).toBe(409);
      expect(sameSku.body.code).toBe('DUPLICATE_VALUE');
      const sameBarcode = await send('admin', 'post', '/products', {
        ...base,
        sku: 'DUP-2',
        barcode: '111111',
      });
      expect(sameBarcode.status).toBe(409);
      const negative = await send('admin', 'post', '/products', {
        ...base,
        sku: 'DUP-3',
        salePrice: -1,
      });
      expect(negative.status).toBe(400);
      // Several products without a barcode are allowed.
      expect((await send('admin', 'post', '/products', { ...base, sku: 'DUP-4' })).status).toBe(
        201,
      );
      expect((await send('admin', 'post', '/products', { ...base, sku: 'DUP-5' })).status).toBe(
        201,
      );
    });

    it('updates allowed fields only (no stock or cost) and supports deactivate/activate', async () => {
      const product = await createProduct(context.prisma, { costPrice: 500, stockQty: 9 });
      const patched = await send('stockkeeper', 'patch', `/products/${product.id}`, {
        name: 'Renamed',
        salePrice: 2222,
      });
      expect(patched.body).toMatchObject({
        name: 'Renamed',
        salePrice: 2222,
        stockQty: 9,
        costPrice: 500,
      });
      expect(
        (await send('stockkeeper', 'patch', `/products/${product.id}`, { stockQty: 1 })).status,
      ).toBe(400);
      expect(
        (await send('stockkeeper', 'patch', `/products/${product.id}`, { costPrice: 1 })).status,
      ).toBe(400);

      const off = await send('stockkeeper', 'post', `/products/${product.id}/deactivate`);
      expect(off.body.isActive).toBe(false);
      expect((await send('cashier', 'post', `/products/${product.id}/activate`)).status).toBe(403);
    });

    it('looks up active products by barcode or SKU only (POS scan)', async () => {
      const active = await createProduct(context.prisma, { sku: 'SCAN-1', barcode: '9990001' });
      const inactive = await createProduct(context.prisma, {
        sku: 'SCAN-2',
        barcode: '9990002',
        isActive: false,
      });
      expect((await send('cashier', 'get', '/products/lookup?code=9990001')).body.id).toBe(
        active.id,
      );
      expect((await send('cashier', 'get', '/products/lookup?code=SCAN-1')).body.id).toBe(
        active.id,
      );
      const missing = await send('cashier', 'get', `/products/lookup?code=${inactive.sku}`);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('searches and filters with pagination metadata', async () => {
      const response = await send(
        'cashier',
        'get',
        `/products?search=SCAN&isActive=true&pageSize=1&page=1`,
      );
      expect(response.status).toBe(200);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 1 });
      const tooBig = await send('cashier', 'get', '/products?pageSize=101');
      expect(tooBig.status).toBe(400);
    });
  });

  describe('customers', () => {
    it('creates customers with generated codes and normalises phone numbers', async () => {
      const first = await send('cashier', 'post', '/customers', {
        fullName: 'An',
        phone: '+84 901 234 567',
      });
      expect(first.status).toBe(201);
      expect(first.body.phone).toBe('0901234567');
      expect(first.body.customerCode).toMatch(/^KH\d{6}$/);
      const second = await send('admin', 'post', '/customers', { fullName: 'Binh' });
      expect(Number(String(second.body.customerCode).slice(2))).toBe(
        Number(String(first.body.customerCode).slice(2)) + 1,
      );
    });

    it('rejects a duplicate phone (even in another notation) and invalid phones', async () => {
      const duplicate = await send('cashier', 'post', '/customers', {
        fullName: 'Dup',
        phone: '0901234567',
      });
      expect(duplicate.status).toBe(409);
      expect(
        (await send('cashier', 'post', '/customers', { fullName: 'Bad', phone: '12345' })).status,
      ).toBe(400);
    });

    it('looks up by exact phone or by code, and 404s otherwise (E5)', async () => {
      const byPhone = await send('cashier', 'get', '/customers/lookup?q=0901234567');
      expect(byPhone.status).toBe(200);
      const code = String(byPhone.body.customerCode);
      expect((await send('cashier', 'get', `/customers/lookup?q=${code}`)).body.fullName).toBe(
        'An',
      );
      expect(
        (await send('cashier', 'get', '/customers/lookup?q=%2B84901234567')).body.fullName,
      ).toBe('An');
      expect((await send('cashier', 'get', '/customers/lookup?q=0900000000')).status).toBe(404);
      expect((await send('cashier', 'get', '/customers?search=An')).body.meta).toMatchObject({
        total: 1,
      });
    });
  });

  describe('users', () => {
    it('lets an admin create a user who can then log in; usernames are unique and passwords have a minimum length', async () => {
      const created = await send('admin', 'post', '/users', {
        username: 'NewClerk',
        password: 'a-long-enough-password',
        fullName: 'New Clerk',
        role: 'CASHIER',
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ username: 'newclerk', role: 'CASHIER', isActive: true });
      expect(created.body).not.toHaveProperty('passwordHash');
      await context
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'newclerk', password: 'a-long-enough-password' })
        .expect(200);

      const duplicate = await send('admin', 'post', '/users', {
        username: 'newclerk',
        password: 'a-long-enough-password',
        fullName: 'Again',
        role: 'CASHIER',
      });
      expect(duplicate.status).toBe(409);
      const weak = await send('admin', 'post', '/users', {
        username: 'weakling',
        password: 'short',
        fullName: 'Weak',
        role: 'CASHIER',
      });
      expect(weak.status).toBe(400);
    });

    it('prevents an admin from locking themselves or demoting the last active admin', async () => {
      const selfLock = await send('admin', 'post', `/users/${context.users.admin.id}/lock`);
      expect(selfLock.status).toBe(409);
      expect(selfLock.body.code).toBe('CANNOT_LOCK_SELF');

      const demote = await send('admin', 'patch', `/users/${context.users.admin.id}`, {
        role: 'CASHIER',
      });
      expect(demote.status).toBe(409);
      expect(demote.body.code).toBe('LAST_ACTIVE_ADMIN');
    });

    it('allows demotion once another active admin exists, and the new admin cannot be the last one standing', async () => {
      const second = await send('admin', 'post', '/users', {
        username: 'admin2',
        password: 'a-long-enough-password',
        fullName: 'Second Admin',
        role: 'ADMIN',
      });
      const secondId = Number(second.body.id);
      const demoted = await send('admin', 'patch', `/users/${context.users.admin.id}`, {
        role: 'STOCKKEEPER',
      });
      expect(demoted.status).toBe(200);
      // `admin` is no longer an admin; admin2 is the last one and cannot be locked by themselves.
      const secondToken = (
        await context
          .http()
          .post('/api/v1/auth/login')
          .send({ username: 'admin2', password: 'a-long-enough-password' })
          .expect(200)
      ).body.accessToken as string;
      const lastAdmin = await context
        .http()
        .patch(`/api/v1/users/${secondId}`)
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ role: 'CASHIER' });
      expect(lastAdmin.status).toBe(409);
      expect(lastAdmin.body.code).toBe('LAST_ACTIVE_ADMIN');
    });

    it('resets a password, revoking the old sessions', async () => {
      const victimToken = await context.tokenFor('stockkeeper');
      const secondToken = (
        await context
          .http()
          .post('/api/v1/auth/login')
          .send({ username: 'admin2', password: 'a-long-enough-password' })
          .expect(200)
      ).body.accessToken as string;
      await context
        .http()
        .post(`/api/v1/users/${context.users.stockkeeper.id}/reset-password`)
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ newPassword: 'brand-new-password-1' })
        .expect(204);
      await context
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(401);
      await context
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'stockkeeper', password: 'brand-new-password-1' })
        .expect(200);
    });
  });
});
