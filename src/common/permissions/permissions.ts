import { Role } from '@prisma/client';

const ALL_ROLES: readonly Role[] = [Role.ADMIN, Role.CASHIER, Role.STOCKKEEPER];

/**
 * Single permission matrix (SRS section 8, default proposal). The store owner still has to
 * confirm the stockkeeper product permission, so every rule lives here and nowhere else.
 */
export const PERMISSIONS = {
  /** Staff accounts (F2). */
  USERS_MANAGE: [Role.ADMIN],
  /** Read categories and products, POS product lookup. */
  CATALOG_READ: ALL_ROLES,
  /** Create/update/deactivate categories and products. */
  CATALOG_WRITE: [Role.ADMIN, Role.STOCKKEEPER],
  SUPPLIERS_MANAGE: [Role.ADMIN, Role.STOCKKEEPER],
  PURCHASES_MANAGE: [Role.ADMIN, Role.STOCKKEEPER],
  SALES_CREATE: [Role.ADMIN, Role.CASHIER],
  SALES_READ: [Role.ADMIN, Role.CASHIER],
  CUSTOMERS_MANAGE: [Role.ADMIN, Role.CASHIER],
  /** Current stock list only (no cost, no movements). */
  STOCK_VIEW_CURRENT: ALL_ROLES,
  /** Low-stock alerts, movements, stock counts and adjustments. */
  INVENTORY_MANAGE: [Role.ADMIN, Role.STOCKKEEPER],
  REPORTS_SALES: [Role.ADMIN],
  REPORTS_INVENTORY: [Role.ADMIN, Role.STOCKKEEPER],
  /** Any authenticated staff member (profile, logout). */
  AUTHENTICATED: ALL_ROLES,
} as const satisfies Record<string, readonly Role[]>;
