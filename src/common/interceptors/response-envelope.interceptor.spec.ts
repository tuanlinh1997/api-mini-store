import { Prisma } from '@prisma/client';

import { Paginated } from 'src/common/pagination/pagination';

import { buildSuccessEnvelope, serializeDecimals } from './response-envelope.interceptor';

const NOW = new Date('2026-10-02T04:50:53.609Z');

describe('serializeDecimals', () => {
  it('converts nested Decimals and BigInts to numbers and leaves dates alone', () => {
    const date = new Date('2026-10-02T00:00:00.000Z');
    const result = serializeDecimals({
      total: new Prisma.Decimal('36000.50'),
      count: BigInt(3),
      soldAt: date,
      items: [{ qty: new Prisma.Decimal(2), name: 'Coca' }],
      note: null,
    });
    expect(result).toEqual({
      total: 36000.5,
      count: 3,
      soldAt: date,
      items: [{ qty: 2, name: 'Coca' }],
      note: null,
    });
  });
});

describe('buildSuccessEnvelope', () => {
  const base = { statusCode: 200, message: 'Thành công', requestId: 'req-1', now: NOW };

  it('wraps a plain result with the standard fields and serialised decimals', () => {
    const envelope = buildSuccessEnvelope({ ...base, result: { total: new Prisma.Decimal(10) } });
    expect(envelope).toEqual({
      success: true,
      statusCode: 200,
      code: 'OK',
      message: 'Thành công',
      data: { total: 10 },
      requestId: 'req-1',
      timestamp: '2026-10-02T04:50:53.609Z',
    });
    expect(envelope).not.toHaveProperty('meta');
  });

  it('maps a Paginated result to data = items and top-level meta', () => {
    const meta = { page: 2, pageSize: 10, total: 31 };
    const envelope = buildSuccessEnvelope({
      ...base,
      result: new Paginated([{ id: 1, price: new Prisma.Decimal(5) }], meta),
    });
    expect(envelope.data).toEqual([{ id: 1, price: 5 }]);
    expect(envelope.meta).toEqual(meta);
  });

  it('does not treat a plain object with an items key as a page', () => {
    const envelope = buildSuccessEnvelope({
      ...base,
      result: { items: [1, 2], meta: { page: 1, pageSize: 1, total: 2 } },
    });
    expect(envelope.data).toEqual({ items: [1, 2], meta: { page: 1, pageSize: 1, total: 2 } });
    expect(envelope).not.toHaveProperty('meta');
  });

  it('uses null data for empty results and keeps a custom message and status', () => {
    const envelope = buildSuccessEnvelope({
      ...base,
      statusCode: 201,
      message: 'Tạo hóa đơn thành công',
      result: undefined,
    });
    expect(envelope).toMatchObject({
      statusCode: 201,
      message: 'Tạo hóa đơn thành công',
      data: null,
    });
  });
});
