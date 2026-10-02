import { Prisma } from '@prisma/client';

import { normalizeVietnamesePhone } from 'src/modules/customers/phone';

/**
 * Customer filter for the sales list: a partial match on the customer code or on the phone
 * number. The phone input is normalised first, so "+84 912 345 678" finds "0912345678".
 */
export function customerMatching(customerQuery: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { customerCode: { contains: customerQuery } },
      { phone: { contains: normalizeVietnamesePhone(customerQuery) } },
    ],
  };
}
