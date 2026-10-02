import {
  bearer,
  bootTestContext,
  createProduct,
  createSupplier,
  stockOf,
  TestContext,
} from './helpers/test-app';

interface PurchaseBody {
  id: number;
  purchaseNo: string;
  status: string;
  subtotal: number;
  total: number;
  receivedAt: string | null;
}

describe('Purchases (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function post(
    username: string,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> & Partial<PurchaseBody> }> {
    const response = await context
      .http()
      .post(`/api/v1${path}`)
      .set('Authorization', await bearer(context, username))
      .send(payload);
    return { status: response.status, body: response.body };
  }

  async function createDraft(
    supplierId: number,
    items: { productId: number; quantity: number; unitCost: number }[],
  ): Promise<PurchaseBody> {
    const { status, body } = await post('stockkeeper', '/purchases', { supplierId, items });
    expect(status).toBe(201);
    return body as unknown as PurchaseBody;
  }

  it('creates a DRAFT with server-computed totals and does not touch stock', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 5, costPrice: 1000 });

    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 10, unitCost: 1200 },
    ]);

    expect(draft).toMatchObject({
      status: 'DRAFT',
      subtotal: 12000,
      total: 12000,
      receivedAt: null,
    });
    expect(draft.purchaseNo).toMatch(/^PN\d{8}\d{4}$/);
    expect(await stockOf(context.prisma, product.id)).toBe(5);
    expect(await context.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      0,
    );
  });

  it('receives a draft: increases stock, writes a PURCHASE movement and sets the weighted-average cost', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 10, costPrice: 1000 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 30, unitCost: 2000 },
    ]);

    const { status, body } = await post('stockkeeper', `/purchases/${draft.id}/receive`);

    expect(status).toBe(200);
    expect(body.status).toBe('RECEIVED');
    expect(body.receivedAt).not.toBeNull();
    const updated = await context.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.stockQty.toNumber()).toBe(40);
    // (10 * 1000 + 30 * 2000) / 40 = 1750
    expect(updated.costPrice.toNumber()).toBe(1750);
    const movement = await context.prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(movement).toMatchObject({
      movementType: 'PURCHASE',
      referenceType: 'PURCHASE',
      referenceId: draft.id,
      createdBy: context.users.stockkeeper.id,
    });
    expect(movement.quantityChange.toNumber()).toBe(30);
  });

  it('uses the unit cost directly when there was no stock', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0, costPrice: 999 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 4, unitCost: 2500 },
    ]);
    await post('admin', `/purchases/${draft.id}/receive`);
    const updated = await context.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.costPrice.toNumber()).toBe(2500);
  });

  it('rejects a second receive with 409 PURCHASE_ALREADY_RECEIVED and adds no stock (E3)', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 5, unitCost: 100 },
    ]);

    expect((await post('stockkeeper', `/purchases/${draft.id}/receive`)).status).toBe(200);
    const again = await post('stockkeeper', `/purchases/${draft.id}/receive`);

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PURCHASE_ALREADY_RECEIVED');
    expect(await stockOf(context.prisma, product.id)).toBe(5);
    expect(await context.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      1,
    );
  });

  it('adds stock only once when two receives race', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 7, unitCost: 100 },
    ]);

    const results = await Promise.all([
      post('stockkeeper', `/purchases/${draft.id}/receive`),
      post('admin', `/purchases/${draft.id}/receive`),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await stockOf(context.prisma, product.id)).toBe(7);
    expect(await context.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      1,
    );
  });

  it('supports receiveNow (create + receive in one transaction)', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 2, costPrice: 100 });
    const { status, body } = await post('stockkeeper', '/purchases', {
      supplierId: supplier.id,
      receiveNow: true,
      items: [{ productId: product.id, quantity: 8, unitCost: 200 }],
    });
    expect(status).toBe(201);
    expect(body.status).toBe('RECEIVED');
    expect(await stockOf(context.prisma, product.id)).toBe(10);
  });

  it('lets a draft be edited, then cancelled; a cancelled purchase cannot be received', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 1, unitCost: 100 },
    ]);

    const patched = await context
      .http()
      .patch(`/api/v1/purchases/${draft.id}`)
      .set('Authorization', await bearer(context, 'stockkeeper'))
      .send({ items: [{ productId: product.id, quantity: 3, unitCost: 150 }], note: 'edited' })
      .expect(200);
    expect(patched.body).toMatchObject({ total: 450, note: 'edited' });

    expect((await post('stockkeeper', `/purchases/${draft.id}/cancel`)).body.status).toBe(
      'CANCELLED',
    );
    const receive = await post('stockkeeper', `/purchases/${draft.id}/receive`);
    expect(receive.status).toBe(409);
    expect(receive.body.code).toBe('PURCHASE_CANCELLED');
    expect(await stockOf(context.prisma, product.id)).toBe(0);
  });

  it('refuses to edit a received purchase', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 1, unitCost: 100 },
    ]);
    await post('stockkeeper', `/purchases/${draft.id}/receive`);
    const response = await context
      .http()
      .patch(`/api/v1/purchases/${draft.id}`)
      .set('Authorization', await bearer(context, 'stockkeeper'))
      .send({ note: 'too late' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PURCHASE_ALREADY_RECEIVED');
  });

  it('blocks receiving when the supplier or a product became inactive (E1) and rolls back', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma, { stockQty: 0 });
    const draft = await createDraft(supplier.id, [
      { productId: product.id, quantity: 5, unitCost: 100 },
    ]);

    await context.prisma.supplier.update({ where: { id: supplier.id }, data: { isActive: false } });
    const supplierBlocked = await post('stockkeeper', `/purchases/${draft.id}/receive`);
    expect(supplierBlocked.status).toBe(422);
    expect(supplierBlocked.body.code).toBe('SUPPLIER_INACTIVE');

    await context.prisma.supplier.update({ where: { id: supplier.id }, data: { isActive: true } });
    await context.prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    const productBlocked = await post('stockkeeper', `/purchases/${draft.id}/receive`);
    expect(productBlocked.status).toBe(422);
    expect(productBlocked.body.code).toBe('PRODUCT_UNAVAILABLE');

    expect(await stockOf(context.prisma, product.id)).toBe(0);
    const stillDraft = await context.prisma.purchase.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stillDraft.status).toBe('DRAFT');
  });

  it.each([
    ['zero quantity', { quantity: 0, unitCost: 100 }],
    ['negative unit cost', { quantity: 1, unitCost: -5 }],
    ['fractional quantity', { quantity: 1.5, unitCost: 100 }],
  ])('rejects %s (E2)', async (_label, line) => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma);
    const { status } = await post('stockkeeper', '/purchases', {
      supplierId: supplier.id,
      items: [{ productId: product.id, ...line }],
    });
    expect(status).toBe(400);
  });

  it('forbids cashiers from purchasing', async () => {
    const supplier = await createSupplier(context.prisma);
    const product = await createProduct(context.prisma);
    const { status } = await post('cashier', '/purchases', {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 1, unitCost: 100 }],
    });
    expect(status).toBe(403);
  });
});
