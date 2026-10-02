import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Prisma, Role } from '@prisma/client';
import request from 'supertest';
import type { Response } from 'supertest';

import { AppModule } from 'src/app.module';
import { configureApplication, generateRequestId } from 'src/app.setup';
import { PasswordService } from 'src/modules/auth/password.service';
import { PrismaService } from 'src/prisma/prisma.service';

/** Success envelopes carry the payload in `data`; error envelopes are returned as they are. */
export function unwrap(body: Response['body']): Response['body'] {
  return body?.success === true ? body.data : body;
}

export const TEST_PASSWORD = 'Passw0rd-for-tests';

export interface TestUsers {
  admin: { id: number; username: string };
  cashier: { id: number; username: string };
  stockkeeper: { id: number; username: string };
}

export interface TestContext {
  app: NestFastifyApplication;
  prisma: PrismaService;
  users: TestUsers;
  http: () => ReturnType<typeof request>;
  tokenFor: (username: string) => Promise<string>;
}

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ genReqId: generateRequestId }),
  );
  await configureApplication(app);
  // Listen on an ephemeral port: supertest then talks to a stable URL (no per-request listen races).
  await app.listen(0, '127.0.0.1');
  return app;
}

/** Child tables first so foreign keys never block the cleanup. */
const TABLES_IN_DELETE_ORDER = [
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

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  for (const table of TABLES_IN_DELETE_ORDER) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`\`${table}\``)}`);
  }
}

async function seedUsers(prisma: PrismaService, passwords: PasswordService): Promise<TestUsers> {
  const passwordHash = await passwords.hash(TEST_PASSWORD);
  const create = async (
    username: string,
    role: Role,
  ): Promise<{ id: number; username: string }> => {
    const user = await prisma.user.create({
      data: { username, fullName: `Test ${username}`, role, passwordHash },
    });
    return { id: user.id, username };
  };
  return {
    admin: await create('admin', Role.ADMIN),
    cashier: await create('cashier', Role.CASHIER),
    stockkeeper: await create('stockkeeper', Role.STOCKKEEPER),
  };
}

/** Boots the real app on the e2e database with a clean slate and the three staff roles. */
export async function bootTestContext(): Promise<TestContext> {
  const app = await createTestApp();
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService, { strict: false });
  await resetDatabase(prisma);
  const users = await seedUsers(prisma, passwords);
  const baseUrl = await app.getUrl();
  const http = (): ReturnType<typeof request> => request(baseUrl);
  const tokens = new Map<string, string>();
  const tokenFor = async (username: string): Promise<string> => {
    const cached = tokens.get(username);
    if (cached) {
      return cached;
    }
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ username, password: TEST_PASSWORD })
      .expect(200);
    const token = (response.body as { data: { accessToken: string } }).data.accessToken;
    tokens.set(username, token);
    return token;
  };
  return { app, prisma, users, http, tokenFor };
}

export async function bearer(context: TestContext, username: string): Promise<string> {
  return `Bearer ${await context.tokenFor(username)}`;
}

let skuCounter = 0;

export async function createProduct(
  prisma: PrismaService,
  overrides: Partial<{
    sku: string;
    name: string;
    salePrice: number;
    costPrice: number;
    stockQty: number;
    reorderLevel: number;
    isActive: boolean;
    barcode: string | null;
  }> = {},
): Promise<{ id: number; sku: string }> {
  const category =
    (await prisma.category.findFirst({ where: { name: 'Test category' } })) ??
    (await prisma.category.create({ data: { name: 'Test category' } }));
  skuCounter += 1;
  const sku = overrides.sku ?? `SKU-${Date.now()}-${skuCounter}`;
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      sku,
      barcode: overrides.barcode ?? null,
      name: overrides.name ?? `Product ${sku}`,
      unit: 'cái',
      salePrice: overrides.salePrice ?? 10000,
      costPrice: overrides.costPrice ?? 6000,
      stockQty: overrides.stockQty ?? 0,
      reorderLevel: overrides.reorderLevel ?? 0,
      isActive: overrides.isActive ?? true,
    },
  });
  return { id: product.id, sku };
}

export async function createSupplier(
  prisma: PrismaService,
  isActive = true,
): Promise<{ id: number }> {
  const supplier = await prisma.supplier.create({ data: { name: 'Test supplier', isActive } });
  return { id: supplier.id };
}

export async function stockOf(prisma: PrismaService, productId: number): Promise<number> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return product.stockQty.toNumber();
}
