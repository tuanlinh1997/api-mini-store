import { bearer, bootTestContext, createProduct, stockOf, TestContext } from './helpers/test-app';

interface CountResponse {
  code?: string;
  details?: Record<string, number>;
  stockCount: {
    id: number;
    countNo: string;
    systemQty: number;
    countedQty: number;
    difference: number;
    reason: string;
  };
  product: { stockQty: number };
}

describe('Stock counts (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function count(
    username: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: CountResponse }> {
    const response = await context
      .http()
      .post('/api/v1/inventory/stock-counts')
      .set('Authorization', await bearer(context, username))
      .send(payload);
    return { status: response.status, body: response.body };
  }

  it('records the count, an ADJUSTMENT movement with the signed difference and the new stock', async () => {
    const product = await createProduct(context.prisma, { stockQty: 10, costPrice: 4321 });

    const { status, body } = await count('stockkeeper', {
      productId: product.id,
      countedQty: 7,
      expectedSystemQty: 10,
      reason: 'Hàng hỏng',
    });

    expect(status).toBe(201);
    expect(body.stockCount).toMatchObject({
      systemQty: 10,
      countedQty: 7,
      difference: -3,
      reason: 'Hàng hỏng',
    });
    expect(body.stockCount.countNo).toMatch(/^KK\d{8}\d{4}$/);
    expect(body.product.stockQty).toBe(7);
    expect(await stockOf(context.prisma, product.id)).toBe(7);

    const movement = await context.prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(movement).toMatchObject({
      movementType: 'ADJUSTMENT',
      referenceType: 'STOCK_COUNT',
      referenceId: body.stockCount.id,
      createdBy: context.users.stockkeeper.id,
    });
    expect(movement.quantityChange.toNumber()).toBe(-3);
    const unchanged = await context.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(unchanged.costPrice.toNumber()).toBe(4321);
  });

  it('returns 409 STOCK_CONFLICT with the current stock when it changed since it was read (E2)', async () => {
    const product = await createProduct(context.prisma, { stockQty: 10 });
    await context.prisma.product.update({ where: { id: product.id }, data: { stockQty: 8 } });

    const { status, body } = await count('admin', {
      productId: product.id,
      countedQty: 9,
      expectedSystemQty: 10,
      reason: 'Kiểm kê định kỳ',
    });

    expect(status).toBe(409);
    expect(body.code).toBe('STOCK_CONFLICT');
    expect(body.details).toMatchObject({ expectedSystemQty: 10, currentStockQty: 8 });
    expect(await stockOf(context.prisma, product.id)).toBe(8);
    expect(await context.prisma.stockCount.count({ where: { productId: product.id } })).toBe(0);
    expect(await context.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      0,
    );
  });

  it('records a zero-difference count without creating a movement', async () => {
    const product = await createProduct(context.prisma, { stockQty: 5 });
    const { status, body } = await count('stockkeeper', {
      productId: product.id,
      countedQty: 5,
      expectedSystemQty: 5,
      reason: 'Đếm lại khớp',
    });
    expect(status).toBe(201);
    expect(body.stockCount.difference).toBe(0);
    expect(await context.prisma.stockCount.count({ where: { productId: product.id } })).toBe(1);
    expect(await context.prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(
      0,
    );
  });

  it('can raise stock with a positive difference', async () => {
    const product = await createProduct(context.prisma, { stockQty: 2 });
    await count('stockkeeper', {
      productId: product.id,
      countedQty: 6,
      expectedSystemQty: 2,
      reason: 'Tìm thấy thêm',
    });
    const movement = await context.prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(movement.quantityChange.toNumber()).toBe(4);
    expect(await stockOf(context.prisma, product.id)).toBe(6);
  });

  it.each([
    ['negative counted quantity (E1)', { countedQty: -1, reason: 'x' }],
    ['missing reason (E3)', { countedQty: 3 }],
    ['blank reason (E3)', { countedQty: 3, reason: '   ' }],
  ])('rejects %s', async (_label, extra) => {
    const product = await createProduct(context.prisma, { stockQty: 5 });
    const { status } = await count('stockkeeper', {
      productId: product.id,
      expectedSystemQty: 5,
      ...extra,
    });
    expect(status).toBe(400);
    expect(await stockOf(context.prisma, product.id)).toBe(5);
  });

  it('rejects a fractional counted quantity (BR4)', async () => {
    const product = await createProduct(context.prisma, { stockQty: 5 });
    const { status, body } = await count('stockkeeper', {
      productId: product.id,
      countedQty: 2.5,
      expectedSystemQty: 5,
      reason: 'half',
    });
    expect(status).toBe(422);
    expect(body.code).toBe('INVALID_QUANTITY');
    expect(await stockOf(context.prisma, product.id)).toBe(5);
  });

  it('forbids cashiers from counting and lists counts for stockkeepers', async () => {
    const product = await createProduct(context.prisma, { stockQty: 5 });
    const denied = await count('cashier', {
      productId: product.id,
      countedQty: 1,
      expectedSystemQty: 5,
      reason: 'nope',
    });
    expect(denied.status).toBe(403);

    const list = await context
      .http()
      .get('/api/v1/inventory/stock-counts?pageSize=5')
      .set('Authorization', await bearer(context, 'stockkeeper'))
      .expect(200);
    expect(list.body.meta.total).toBeGreaterThan(0);
    expect(list.body.items[0]).toHaveProperty('countNo');
  });
});
