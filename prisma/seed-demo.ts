/* Demo data seed (`npm run seed:demo`): ~90 days of consistent store activity in every table.
 *
 *   npm run seed:demo -- --reset          clear all tables, re-seed base users, then demo data
 *   npm run seed:demo                     only on a database with no business data yet
 *   npm run seed:demo -- --reset --seed=7 deterministic: the same seed gives the same data
 *
 * Safety: refuses NODE_ENV=production, refuses databases that are not the dev database
 * (never mini_store_test), and never double-applies without --reset. */
import 'dotenv/config';
import 'reflect-metadata';

import { PrismaClient, Role } from '@prisma/client';

import { PasswordService } from 'src/modules/auth/password.service';

import {
  DemoSimulation,
  describeSimulationWindow,
  FirstIds,
  SimUser,
  simulationInstant,
} from './demo/simulation';
import { seedUsers } from './seed';

const DEFAULT_SEED = 20261002;
const INSERT_BATCH_SIZE = 500;
const TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;
const DEV_DATABASE_NAMES = new Set(['mini_store', 'mini_store_dev']);
const ALL_TABLES = [
  'payments',
  'sale_items',
  'sales',
  'inventory_movements',
  'stock_counts',
  'purchase_items',
  'purchases',
  'user_sessions',
  'customers',
  'products',
  'suppliers',
  'categories',
  'users',
  'document_sequences',
];

function fail(message: string): never {
  console.error(`seed:demo refused: ${message}`);
  process.exit(1);
}

function parseArguments(argv: string[]): { reset: boolean; seed: number } {
  const seedArgument = argv.find((arg) => arg.startsWith('--seed='));
  const seed = Number(seedArgument?.split('=')[1] ?? process.env.DEMO_SEED ?? DEFAULT_SEED);
  if (!Number.isInteger(seed)) {
    fail('--seed must be an integer');
  }
  return { reset: argv.includes('--reset'), seed };
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV=production');
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set');
  }
  const databaseName = new URL(url).pathname.replace('/', '');
  if (!DEV_DATABASE_NAMES.has(databaseName)) {
    fail(
      `database "${databaseName}" does not look like the dev database (${[...DEV_DATABASE_NAMES].join(', ')})`,
    );
  }
}

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...ALL_TABLES.map((table) => prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}

async function assertNoBusinessData(prisma: PrismaClient): Promise<void> {
  const counts = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
    prisma.purchase.count(),
    prisma.sale.count(),
    prisma.stockCount.count(),
  ]);
  if (counts.some((count) => count > 0)) {
    fail('business data already exists. Re-run with --reset to clear and rebuild it');
  }
}

async function maxId(prisma: PrismaClient, table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ id: number | null }[]>(
    `SELECT MAX(id) AS id FROM \`${table}\``,
  );
  return Number(rows[0]?.id ?? 0) + 1;
}

async function loadFirstIds(prisma: PrismaClient): Promise<FirstIds> {
  const [
    category,
    supplier,
    product,
    customer,
    purchase,
    purchaseItem,
    sale,
    saleItem,
    payment,
    movement,
    stockCount,
  ] = await Promise.all(
    [
      'categories',
      'suppliers',
      'products',
      'customers',
      'purchases',
      'purchase_items',
      'sales',
      'sale_items',
      'payments',
      'inventory_movements',
      'stock_counts',
    ].map((table) => maxId(prisma, table)),
  );
  return {
    category: category ?? 1,
    supplier: supplier ?? 1,
    product: product ?? 1,
    customer: customer ?? 1,
    purchase: purchase ?? 1,
    purchaseItem: purchaseItem ?? 1,
    sale: sale ?? 1,
    saleItem: saleItem ?? 1,
    payment: payment ?? 1,
    movement: movement ?? 1,
    stockCount: stockCount ?? 1,
  };
}

async function createDemoUsers(prisma: PrismaClient, now: Date): Promise<SimUser[]> {
  const passwordHash = await new PasswordService().hash(process.env.SEED_DEMO_PASSWORD ?? '');
  const extras = [
    { username: 'cashier2', fullName: 'Trần Thị Mai', role: Role.CASHIER, day: 0, lockedDay: null },
    { username: 'cashier3', fullName: 'Lê Văn Hùng', role: Role.CASHIER, day: 30, lockedDay: null },
    {
      username: 'stockkeeper2',
      fullName: 'Phạm Quốc Bảo',
      role: Role.STOCKKEEPER,
      day: 20,
      lockedDay: null,
    },
    {
      username: 'cashier.cu',
      fullName: 'Hoàng Văn Cường (đã nghỉ việc)',
      role: Role.CASHIER,
      day: 2,
      lockedDay: 55,
    },
  ];
  for (const extra of extras) {
    const createdAt = simulationInstant(now, extra.day, 6, 10);
    const lockedAt =
      extra.lockedDay === null ? null : simulationInstant(now, extra.lockedDay, 18, 0);
    await prisma.user.create({
      data: {
        username: extra.username,
        fullName: extra.fullName,
        role: extra.role,
        passwordHash,
        isActive: lockedAt === null,
        createdAt,
        updatedAt: lockedAt ?? createdAt,
      },
    });
  }
  const baseCreatedAt = simulationInstant(now, 0, 6, 0);
  await prisma.user.updateMany({
    where: { username: { notIn: extras.map((e) => e.username) } },
    data: { createdAt: baseCreatedAt },
  });
  const users = await prisma.user.findMany();
  return users.map((user) => {
    const extra = extras.find((e) => e.username === user.username);
    return {
      id: user.id,
      role: user.role,
      createdAt: user.createdAt,
      lockedAt: extra?.lockedDay == null ? null : simulationInstant(now, extra.lockedDay, 18, 0),
    };
  });
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    await insert(rows.slice(start, start + INSERT_BATCH_SIZE));
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const { reset, seed } = parseArguments(process.argv.slice(2));
  assertSafeEnvironment();
  const prisma = new PrismaClient();
  try {
    if (reset) {
      await resetAllTables(prisma);
      console.log('All tables cleared.');
    } else {
      await assertNoBusinessData(prisma);
    }
    await seedUsers(prisma, new PasswordService());

    const now = new Date();
    const users = await createDemoUsers(prisma, now);
    const firstIds = await loadFirstIds(prisma);
    const result = new DemoSimulation({ seed, now, users, firstIds }).run();
    const window = describeSimulationWindow(now);
    console.log(
      `Simulated ${window.from} .. ${window.to} (seed ${seed}); writing to the database...`,
    );

    await prisma.$transaction(
      async (tx) => {
        await tx.documentSequence.deleteMany();
        await tx.category.createMany({ data: result.categories });
        await tx.supplier.createMany({ data: result.suppliers });
        await tx.product.createMany({ data: result.products });
        await tx.customer.createMany({ data: result.customers });
        await insertInBatches(result.purchases, (data) => tx.purchase.createMany({ data }));
        await insertInBatches(result.purchaseItems, (data) => tx.purchaseItem.createMany({ data }));
        await insertInBatches(result.sales, (data) => tx.sale.createMany({ data }));
        await insertInBatches(result.saleItems, (data) => tx.saleItem.createMany({ data }));
        await insertInBatches(result.payments, (data) => tx.payment.createMany({ data }));
        await insertInBatches(result.movements, (data) =>
          tx.inventoryMovement.createMany({ data }),
        );
        await insertInBatches(result.stockCounts, (data) => tx.stockCount.createMany({ data }));
        await tx.userSession.createMany({ data: result.sessions });
        await tx.documentSequence.createMany({ data: result.sequences });
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    console.log('Rows created:');
    console.table({
      users: await prisma.user.count(),
      user_sessions: result.sessions.length,
      categories: result.categories.length,
      suppliers: result.suppliers.length,
      products: result.products.length,
      customers: result.customers.length,
      purchases: result.purchases.length,
      purchase_items: result.purchaseItems.length,
      sales: result.sales.length,
      sale_items: result.saleItems.length,
      payments: result.payments.length,
      inventory_movements: result.movements.length,
      stock_counts: result.stockCounts.length,
      document_sequences: result.sequences.length,
    });
    console.log(`Products at or below reorder level: ${result.lowStockProducts}`);
    console.log(
      `Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Run "npm run seed:demo:verify" to check consistency.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
