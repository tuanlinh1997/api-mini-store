import { DateTime } from 'luxon';
import type { Response } from 'supertest';

import { bearer, bootTestContext, createProduct, TestContext } from './helpers/test-app';

const STORE_ZONE = 'Asia/Ho_Chi_Minh';

describe('Reports (e2e)', () => {
  let context: TestContext;
  let today: string;
  let cheapProductId: number;

  beforeAll(async () => {
    context = await bootTestContext();
    today = DateTime.now().setZone(STORE_ZONE).toFormat('yyyy-LL-dd');
    const cheap = await createProduct(context.prisma, {
      sku: 'RPT-CHEAP',
      salePrice: 10000,
      costPrice: 6000,
      stockQty: 100,
      reorderLevel: 5,
    });
    const pricey = await createProduct(context.prisma, {
      sku: 'RPT-PRICEY',
      salePrice: 50000,
      costPrice: 30000,
      stockQty: 10,
      reorderLevel: 20,
    });
    cheapProductId = cheap.id;
    // Sale A: admin, 3 x cheap with 3000 discount. Sale B: cashier, 1 x pricey.
    await context
      .http()
      .post('/api/v1/sales')
      .set('Authorization', await bearer(context, 'admin'))
      .send({
        items: [{ productId: cheap.id, quantity: 3 }],
        discountAmount: 3000,
        payments: [{ method: 'CASH', amount: 27000 }],
      })
      .expect(201);
    await context
      .http()
      .post('/api/v1/sales')
      .set('Authorization', await bearer(context, 'cashier'))
      .send({
        items: [{ productId: pricey.id, quantity: 1 }],
        payments: [{ method: 'TRANSFER', amount: 50000, reference: 'FT1' }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function get(
    path: string,
    username = 'admin',
  ): Promise<{ status: number; body: Response['body'] }> {
    const response = await context
      .http()
      .get(`/api/v1/reports${path}`)
      .set('Authorization', await bearer(context, username));
    return { status: response.status, body: response.body };
  }

  it('revenue: aggregates invoices, gross sales, discount and net revenue per day with totals', async () => {
    const { status, body } = await get(`/revenue?from=${today}&to=${today}&groupBy=day`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ from: today, to: today, groupBy: 'day' });
    expect(body.generatedAt).toEqual(expect.any(String));
    expect(body.rows).toEqual([
      {
        period: today,
        invoiceCount: 2,
        grossSales: 80000,
        discountAmount: 3000,
        netRevenue: 77000,
      },
    ]);
    expect(body.totals).toEqual({
      invoiceCount: 2,
      grossSales: 80000,
      discountAmount: 3000,
      netRevenue: 77000,
    });
  });

  it('revenue: groups by month', async () => {
    const { body } = await get(`/revenue?from=${today}&to=${today}&groupBy=month`);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].period).toBe(today.slice(0, 7));
  });

  it('returns empty data, not an error, for a range without sales (E3)', async () => {
    const { status, body } = await get('/revenue?from=2020-01-01&to=2020-01-31');
    expect(status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.totals).toMatchObject({ invoiceCount: 0, netRevenue: 0 });
  });

  it('rejects to < from, an oversized range and malformed dates with 400 (E1)', async () => {
    const reversed = await get('/revenue?from=2026-02-01&to=2026-01-01');
    expect(reversed.status).toBe(400);
    expect(reversed.body.code).toBe('INVALID_DATE_RANGE');
    const tooLong = await get('/revenue?from=2024-01-01&to=2026-01-01');
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.code).toBe('INVALID_DATE_RANGE');
    expect((await get('/revenue?from=yesterday&to=today')).status).toBe(400);
    expect((await get('/revenue?from=2026-01-01')).status).toBe(400);
  });

  it('top products: ranks by quantity or revenue and honours the limit', async () => {
    const byQuantity = await get(`/top-products?from=${today}&to=${today}&sortBy=quantity`);
    expect(byQuantity.body.rows.map((row: { sku: string }) => row.sku)).toEqual([
      'RPT-CHEAP',
      'RPT-PRICEY',
    ]);
    expect(byQuantity.body.rows[0]).toMatchObject({ rank: 1, quantitySold: 3, revenue: 27000 });

    const byRevenue = await get(`/top-products?from=${today}&to=${today}&sortBy=revenue&limit=1`);
    expect(byRevenue.body.rows).toHaveLength(1);
    expect(byRevenue.body.rows[0].sku).toBe('RPT-PRICEY');
  });

  it('gross profit: revenue after discount minus the captured cost, with margin', async () => {
    const { status, body } = await get(`/gross-profit?from=${today}&to=${today}`);
    expect(status).toBe(200);
    // A: 27000 - 3 * 6000 = 9000.  B: 50000 - 30000 = 20000.
    expect(body.totals).toMatchObject({
      invoiceCount: 2,
      revenue: 77000,
      cogs: 48000,
      grossProfit: 29000,
      marginPercent: 37.66,
    });
    expect(body.rows).toHaveLength(1);
  });

  it('inventory report: stock value, low-stock count and movements for the range', async () => {
    const { status, body } = await get(`/inventory?from=${today}&to=${today}&pageSize=10`);
    expect(status).toBe(200);
    // cheap: 97 * 6000 = 582000, pricey: 9 * 30000 = 270000
    expect(body.summary.totalStockValue).toBe(852000);
    expect(body.summary.productCount).toBe(2);
    expect(body.summary.lowStockCount).toBe(1);
    expect(body.summary.movements).toMatchObject({ qtyIn: 0, qtyOut: 4, qtyAdjusted: 0 });
    const cheap = body.products.items.find(
      (item: { productId: number }) => item.productId === cheapProductId,
    );
    expect(cheap).toMatchObject({ stockQty: 97, stockValue: 582000, qtyOut: 3, isLowStock: false });
    expect(body.products.meta).toMatchObject({ total: 2, page: 1, pageSize: 10 });
  });

  it('lets stockkeepers read the inventory report but not revenue', async () => {
    expect((await get(`/inventory?from=${today}&to=${today}`, 'stockkeeper')).status).toBe(200);
    expect((await get(`/revenue?from=${today}&to=${today}`, 'stockkeeper')).status).toBe(403);
    expect((await get(`/inventory?from=${today}&to=${today}`, 'cashier')).status).toBe(403);
  });
});
