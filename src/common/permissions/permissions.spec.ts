import { Role } from '@prisma/client';

import { PERMISSIONS } from './permissions';

describe('PERMISSIONS matrix (SRS section 8 defaults)', () => {
  it('restricts user management and sales reports to admins', () => {
    expect(PERMISSIONS.USERS_MANAGE).toEqual([Role.ADMIN]);
    expect(PERMISSIONS.REPORTS_SALES).toEqual([Role.ADMIN]);
  });

  it('lets cashiers sell and manage customers but not touch purchasing or stock counts', () => {
    expect(PERMISSIONS.SALES_CREATE).toContain(Role.CASHIER);
    expect(PERMISSIONS.CUSTOMERS_MANAGE).toContain(Role.CASHIER);
    expect(PERMISSIONS.PURCHASES_MANAGE).not.toContain(Role.CASHIER);
    expect(PERMISSIONS.INVENTORY_MANAGE).not.toContain(Role.CASHIER);
    expect(PERMISSIONS.SUPPLIERS_MANAGE).not.toContain(Role.CASHIER);
  });

  it('lets stockkeepers manage catalog, suppliers, purchases and the inventory report but not sell', () => {
    expect(PERMISSIONS.CATALOG_WRITE).toContain(Role.STOCKKEEPER);
    expect(PERMISSIONS.SUPPLIERS_MANAGE).toContain(Role.STOCKKEEPER);
    expect(PERMISSIONS.PURCHASES_MANAGE).toContain(Role.STOCKKEEPER);
    expect(PERMISSIONS.REPORTS_INVENTORY).toContain(Role.STOCKKEEPER);
    expect(PERMISSIONS.SALES_CREATE).not.toContain(Role.STOCKKEEPER);
    expect(PERMISSIONS.CUSTOMERS_MANAGE).not.toContain(Role.STOCKKEEPER);
  });

  it('lets every role read the catalog and the current stock', () => {
    expect(PERMISSIONS.CATALOG_READ).toHaveLength(3);
    expect(PERMISSIONS.STOCK_VIEW_CURRENT).toHaveLength(3);
  });
});
