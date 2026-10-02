import {
  bearer,
  bootTestContext,
  createProduct,
  stockOf,
  TestContext,
  unwrap,
} from './helpers/test-app';

interface SaleBody {
  id: number;
  invoiceNo: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  pointsEarned: number;
  cashierId: number;
  items: {
    productId: number;
    discountAmount: number;
    lineTotal: number;
    unitCostSnapshot: number;
  }[];
  payments: { method: string; amount: number; tenderedAmount: number; changeAmount: number }[];
}

describe('POS checkout (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function checkout(
    username: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> & Partial<SaleBody> }> {
    const response = await context
      .http()
      .post('/api/v1/sales')
      .set('Authorization', await bearer(context, username))
      .send(payload);
    return { status: response.status, body: unwrap(response.body) };
  }

  async function movementCount(): Promise<number> {
    return context.prisma.inventoryMovement.count({ where: { movementType: 'SALE' } });
  }

  it('creates a PAID sale, decrements stock, writes SALE movements and adds points', async () => {
    const water = await createProduct(context.prisma, {
      salePrice: 5000,
      costPrice: 3500,
      stockQty: 50,
    });
    const cola = await createProduct(context.prisma, {
      salePrice: 10000,
      costPrice: 7500,
      stockQty: 20,
    });
    const customer = await context.prisma.customer.create({
      data: { customerCode: 'KH-TEST-1', fullName: 'Khach Test' },
    });

    const { status, body } = await checkout('cashier', {
      customerId: customer.id,
      items: [
        { productId: water.id, quantity: 2 },
        { productId: cola.id, quantity: 3 },
      ],
      discountAmount: 4000,
      payments: [{ method: 'CASH', amount: 36000, tenderedAmount: 50000 }],
    });

    expect(status).toBe(201);
    expect(body.invoiceNo).toMatch(/^HD\d{8}0001$/);
    expect(body).toMatchObject({
      subtotal: 40000,
      discountAmount: 4000,
      total: 36000,
      pointsEarned: 3,
      cashierId: context.users.cashier.id,
    });
    expect(body.payments?.[0]).toMatchObject({
      amount: 36000,
      tenderedAmount: 50000,
      changeAmount: 14000,
    });
    const lineDiscounts = body.items?.map((item) => item.discountAmount) ?? [];
    expect(lineDiscounts.reduce((sum, value) => sum + value, 0)).toBe(4000);
    expect(body.items?.map((item) => item.unitCostSnapshot).sort((a, b) => a - b)).toEqual([
      3500, 7500,
    ]);

    expect(await stockOf(context.prisma, water.id)).toBe(48);
    expect(await stockOf(context.prisma, cola.id)).toBe(17);
    const movements = await context.prisma.inventoryMovement.findMany({
      where: { referenceType: 'SALE', referenceId: body.id },
    });
    expect(
      movements.map((movement) => movement.quantityChange.toNumber()).sort((a, b) => a - b),
    ).toEqual([-3, -2]);
    expect(movements.every((movement) => movement.createdBy === context.users.cashier.id)).toBe(
      true,
    );
    const updatedCustomer = await context.prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(updatedCustomer.loyaltyPoints).toBe(3);
  });

  it('snapshots price and cost so later price changes do not alter history (BR5, BR11)', async () => {
    const product = await createProduct(context.prisma, {
      salePrice: 8000,
      costPrice: 5000,
      stockQty: 5,
    });
    const { body } = await checkout('admin', {
      items: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'CARD', amount: 8000 }],
    });
    await context.prisma.product.update({
      where: { id: product.id },
      data: { salePrice: 9999, costPrice: 1 },
    });
    const detail = await context
      .http()
      .get(`/api/v1/sales/${body.id}`)
      .set('Authorization', await bearer(context, 'admin'))
      .expect(200);
    expect(detail.body.data.items[0]).toMatchObject({ unitPrice: 8000, unitCostSnapshot: 5000 });
  });

  it('generates sequential invoice numbers', async () => {
    const product = await createProduct(context.prisma, { salePrice: 1000, stockQty: 10 });
    const first = await checkout('cashier', {
      items: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 1000 }],
    });
    const second = await checkout('cashier', {
      items: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 1000 }],
    });
    const sequenceOf = (invoiceNo: string | undefined): number => Number(invoiceNo?.slice(-4));
    expect(sequenceOf(second.body.invoiceNo)).toBe(sequenceOf(first.body.invoiceNo) + 1);
  });

  describe('insufficient stock', () => {
    it('returns 409 INSUFFICIENT_STOCK with current availability and rolls everything back', async () => {
      const plenty = await createProduct(context.prisma, { stockQty: 100 });
      const scarce = await createProduct(context.prisma, { stockQty: 2 });
      const customer = await context.prisma.customer.create({
        data: { customerCode: 'KH-TEST-2', fullName: 'Rollback' },
      });
      const salesBefore = await context.prisma.sale.count();
      const movementsBefore = await movementCount();

      const { status, body } = await checkout('cashier', {
        customerId: customer.id,
        items: [
          { productId: plenty.id, quantity: 5 },
          { productId: scarce.id, quantity: 3 },
        ],
        payments: [{ method: 'CASH', amount: 80000 }],
      });

      expect(status).toBe(409);
      expect(body.code).toBe('INSUFFICIENT_STOCK');
      expect(body.details).toEqual([
        expect.objectContaining({ productId: scarce.id, requested: 3, available: 2 }),
      ]);
      expect(await stockOf(context.prisma, plenty.id)).toBe(100);
      expect(await stockOf(context.prisma, scarce.id)).toBe(2);
      expect(await context.prisma.sale.count()).toBe(salesBefore);
      expect(await movementCount()).toBe(movementsBefore);
      const untouched = await context.prisma.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      expect(untouched.loyaltyPoints).toBe(0);
    });

    it('rolls back stock already decremented when a later step fails (invalid payment)', async () => {
      const product = await createProduct(context.prisma, { salePrice: 10000, stockQty: 10 });
      const salesBefore = await context.prisma.sale.count();
      const { status, body } = await checkout('cashier', {
        items: [{ productId: product.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 19999 }],
      });
      expect(status).toBe(422);
      expect(body.code).toBe('INVALID_PAYMENT');
      expect(await stockOf(context.prisma, product.id)).toBe(10);
      expect(await context.prisma.sale.count()).toBe(salesBefore);
    });

    it('lets exactly one of two concurrent checkouts take the last unit', async () => {
      const product = await createProduct(context.prisma, { salePrice: 10000, stockQty: 1 });
      const payload = {
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 10000 }],
      };
      const results = await Promise.all([checkout('cashier', payload), checkout('admin', payload)]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(await stockOf(context.prisma, product.id)).toBe(0);
      const sold = await context.prisma.saleItem.count({ where: { productId: product.id } });
      expect(sold).toBe(1);
    });
  });

  describe('validation and business rules', () => {
    it('rejects inactive products (E1)', async () => {
      const product = await createProduct(context.prisma, { stockQty: 5, isActive: false });
      const { status, body } = await checkout('cashier', {
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 10000 }],
      });
      expect(status).toBe(422);
      expect(body.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it.each([0, -1, 1.5])('rejects quantity %s', async (quantity) => {
      const product = await createProduct(context.prisma, { stockQty: 5 });
      const { status } = await checkout('cashier', {
        items: [{ productId: product.id, quantity }],
        payments: [{ method: 'CASH', amount: 10000 }],
      });
      expect(status).toBe(400);
    });

    it('caps a cashier discount at the configured percentage but not an admin up to the subtotal', async () => {
      const product = await createProduct(context.prisma, { salePrice: 10000, stockQty: 10 });
      const tooMuchForCashier = await checkout('cashier', {
        items: [{ productId: product.id, quantity: 1 }],
        discountAmount: 1001,
        payments: [{ method: 'CASH', amount: 8999 }],
      });
      expect(tooMuchForCashier.status).toBe(422);
      expect(tooMuchForCashier.body.code).toBe('INVALID_DISCOUNT');

      const adminOk = await checkout('admin', {
        items: [{ productId: product.id, quantity: 1 }],
        discountAmount: 5000,
        payments: [{ method: 'CASH', amount: 5000 }],
      });
      expect(adminOk.status).toBe(201);

      const equalToSubtotal = await checkout('admin', {
        items: [{ productId: product.id, quantity: 1 }],
        discountAmount: 10000,
        payments: [{ method: 'CASH', amount: 1 }],
      });
      expect(equalToSubtotal.status).toBe(422);
      expect(equalToSubtotal.body.code).toBe('INVALID_DISCOUNT');
    });

    it('rejects an unknown customer without selling anything', async () => {
      const product = await createProduct(context.prisma, { stockQty: 5 });
      const { status, body } = await checkout('cashier', {
        customerId: 987654,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 10000 }],
      });
      expect(status).toBe(404);
      expect(body.code).toBe('CUSTOMER_NOT_FOUND');
      expect(await stockOf(context.prisma, product.id)).toBe(5);
    });

    it('forbids stockkeepers from selling', async () => {
      const product = await createProduct(context.prisma, { stockQty: 5 });
      const { status } = await checkout('stockkeeper', {
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 10000 }],
      });
      expect(status).toBe(403);
    });
  });

  describe('receipt', () => {
    it('returns a print payload and never creates another sale when reprinted (E7)', async () => {
      const product = await createProduct(context.prisma, {
        salePrice: 12000,
        stockQty: 4,
        name: 'Receipt item',
      });
      const { body } = await checkout('cashier', {
        items: [{ productId: product.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 24000, tenderedAmount: 30000 }],
      });
      const salesBefore = await context.prisma.sale.count();
      const auth = await bearer(context, 'cashier');

      const first = await context
        .http()
        .get(`/api/v1/sales/${body.id}/print`)
        .set('Authorization', auth)
        .expect(200);
      const second = await context
        .http()
        .get(`/api/v1/sales/${body.id}/print`)
        .set('Authorization', auth)
        .expect(200);

      expect(first.body.data).toMatchObject({
        store: { name: 'Test Store' },
        invoiceNo: body.invoiceNo,
        total: 24000,
        cashier: { id: context.users.cashier.id },
        customer: null,
        pointsEarned: 0,
      });
      expect(first.body.data.items[0]).toMatchObject({
        name: 'Receipt item',
        quantity: 2,
        lineTotal: 24000,
      });
      expect(first.body.data.payments[0]).toMatchObject({ method: 'CASH', changeAmount: 6000 });
      expect(second.body.data).toEqual(first.body.data);
      expect(await context.prisma.sale.count()).toBe(salesBefore);
    });

    it('lists sales filtered by invoice number', async () => {
      const response = await context
        .http()
        .get('/api/v1/sales?search=HD&pageSize=2&page=1')
        .set('Authorization', await bearer(context, 'cashier'))
        .expect(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.meta).toMatchObject({ page: 1, pageSize: 2 });
      expect(response.body.meta.total).toBeGreaterThan(0);
    });
  });
});
