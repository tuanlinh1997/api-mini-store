import { Prisma } from '@prisma/client';

import { serializeDecimals } from './decimal-serializer.interceptor';

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
