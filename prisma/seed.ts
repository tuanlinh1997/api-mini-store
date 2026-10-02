/* Seed script (`npm run prisma:seed`). Idempotent: safe to run repeatedly.
 * Boots the Nest application context so seeded data goes through the real services
 * (stock arrives through a received purchase, so movements and costs stay consistent). */
import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Role } from '@prisma/client';

import { AppModule } from 'src/app.module';
import { AuthenticatedUser } from 'src/common/decorators/auth.decorators';
import { CustomersService } from 'src/modules/customers/customers.service';
import { PasswordService } from 'src/modules/auth/password.service';
import { PurchasesService } from 'src/modules/purchases/purchases.service';
import { PrismaService } from 'src/prisma/prisma.service';

const MIN_PASSWORD_LENGTH = 8;

interface SeedProduct {
  sku: string;
  barcode: string;
  name: string;
  unit: string;
  category: string;
  salePrice: number;
  costPrice: number;
  reorderLevel: number;
  openingStock: number;
}

const CATEGORIES = ['Đồ uống', 'Bánh kẹo', 'Thực phẩm khô', 'Gia vị', 'Hóa mỹ phẩm', 'Sữa'];

const SUPPLIERS = [
  {
    name: 'Công ty TNHH Phân phối Nước giải khát An Phát',
    phone: '0281234567',
    email: 'anphat@example.com',
    address: 'Quận 7, TP. Hồ Chí Minh',
  },
  {
    name: 'Đại lý Thực phẩm Hòa Bình',
    phone: '0287654321',
    email: 'hoabinh@example.com',
    address: 'Quận Bình Tân, TP. Hồ Chí Minh',
  },
];

const PRODUCTS: SeedProduct[] = [
  {
    sku: 'NUOC-LAVIE-500',
    barcode: '8934588012013',
    name: 'Nước suối Lavie 500ml',
    unit: 'chai',
    category: 'Đồ uống',
    salePrice: 5000,
    costPrice: 3500,
    reorderLevel: 24,
    openingStock: 120,
  },
  {
    sku: 'COCA-330',
    barcode: '8934588063017',
    name: 'Coca-Cola lon 330ml',
    unit: 'lon',
    category: 'Đồ uống',
    salePrice: 10000,
    costPrice: 7500,
    reorderLevel: 24,
    openingStock: 96,
  },
  {
    sku: 'TRA-O-DO-455',
    barcode: '8934588233083',
    name: 'Trà xanh Không Độ 455ml',
    unit: 'chai',
    category: 'Đồ uống',
    salePrice: 10000,
    costPrice: 7000,
    reorderLevel: 24,
    openingStock: 60,
  },
  {
    sku: 'BANH-OREO',
    barcode: '7622210100238',
    name: 'Bánh quy Oreo 137g',
    unit: 'gói',
    category: 'Bánh kẹo',
    salePrice: 17000,
    costPrice: 13000,
    reorderLevel: 10,
    openingStock: 40,
  },
  {
    sku: 'KEO-ALPEN',
    barcode: '8935001710217',
    name: 'Kẹo Alpenliebe 120g',
    unit: 'gói',
    category: 'Bánh kẹo',
    salePrice: 22000,
    costPrice: 17000,
    reorderLevel: 10,
    openingStock: 8,
  },
  {
    sku: 'MI-HAOHAO',
    barcode: '8934563138165',
    name: 'Mì Hảo Hảo tôm chua cay',
    unit: 'gói',
    category: 'Thực phẩm khô',
    salePrice: 4500,
    costPrice: 3300,
    reorderLevel: 50,
    openingStock: 200,
  },
  {
    sku: 'GAO-ST25-5KG',
    barcode: '8936000000012',
    name: 'Gạo ST25 túi 5kg',
    unit: 'túi',
    category: 'Thực phẩm khô',
    salePrice: 135000,
    costPrice: 115000,
    reorderLevel: 5,
    openingStock: 20,
  },
  {
    sku: 'NUOCMAM-CHINSU',
    barcode: '8934804020012',
    name: 'Nước mắm Chin-su 500ml',
    unit: 'chai',
    category: 'Gia vị',
    salePrice: 38000,
    costPrice: 30000,
    reorderLevel: 10,
    openingStock: 30,
  },
  {
    sku: 'DUONG-BH-1KG',
    barcode: '8934588890012',
    name: 'Đường tinh luyện 1kg',
    unit: 'túi',
    category: 'Gia vị',
    salePrice: 27000,
    costPrice: 22000,
    reorderLevel: 10,
    openingStock: 25,
  },
  {
    sku: 'NUOCRUA-SUNLIGHT',
    barcode: '8934868010016',
    name: 'Nước rửa chén Sunlight 750g',
    unit: 'chai',
    category: 'Hóa mỹ phẩm',
    salePrice: 32000,
    costPrice: 25000,
    reorderLevel: 6,
    openingStock: 15,
  },
  {
    sku: 'SUA-VINAMILK-1L',
    barcode: '8934673100012',
    name: 'Sữa tươi Vinamilk 1L',
    unit: 'hộp',
    category: 'Sữa',
    salePrice: 33000,
    costPrice: 27000,
    reorderLevel: 12,
    openingStock: 48,
  },
  {
    sku: 'SUA-TH-180',
    barcode: '8935217600018',
    name: 'Sữa TH True Milk 180ml',
    unit: 'hộp',
    category: 'Sữa',
    salePrice: 9000,
    costPrice: 6800,
    reorderLevel: 24,
    openingStock: 0,
  },
];

const CUSTOMERS = [
  { fullName: 'Nguyễn Văn An', phone: '0901234567' },
  { fullName: 'Trần Thị Bình', phone: '0912345678' },
  { fullName: 'Lê Hoàng Cường', phone: '0987654321' },
];

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be set to at least ${minLength} character(s) (see .env.example)`);
  }
  return value;
}

async function seedUsers(
  prisma: PrismaService,
  passwords: PasswordService,
): Promise<AuthenticatedUser> {
  const adminUsername = requireEnv('SEED_ADMIN_USERNAME').toLowerCase();
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD', MIN_PASSWORD_LENGTH);
  const demoPassword = requireEnv('SEED_DEMO_PASSWORD', MIN_PASSWORD_LENGTH);
  const accounts = [
    {
      username: adminUsername,
      fullName: 'Quản trị viên',
      role: Role.ADMIN,
      password: adminPassword,
    },
    {
      username: 'cashier',
      fullName: 'Nhân viên bán hàng (demo)',
      role: Role.CASHIER,
      password: demoPassword,
    },
    {
      username: 'stockkeeper',
      fullName: 'Nhân viên kho (demo)',
      role: Role.STOCKKEEPER,
      password: demoPassword,
    },
  ];
  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { username: account.username } });
    if (!existing) {
      await prisma.user.create({
        data: {
          username: account.username,
          fullName: account.fullName,
          role: account.role,
          passwordHash: await passwords.hash(account.password),
        },
      });
    }
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: adminUsername } });
  return {
    id: admin.id,
    username: admin.username,
    fullName: admin.fullName,
    role: admin.role,
    sessionId: 'seed',
  };
}

async function seedCatalog(prisma: PrismaService): Promise<SeedProduct[]> {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  const created: SeedProduct[] = [];
  for (const product of PRODUCTS) {
    if (await prisma.product.findUnique({ where: { sku: product.sku } })) {
      continue;
    }
    const category = await prisma.category.findUniqueOrThrow({ where: { name: product.category } });
    await prisma.product.create({
      data: {
        categoryId: category.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        unit: product.unit,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        reorderLevel: product.reorderLevel,
      },
    });
    created.push(product);
  }
  return created;
}

async function seedSuppliers(prisma: PrismaService): Promise<number> {
  for (const supplier of SUPPLIERS) {
    if (!(await prisma.supplier.findFirst({ where: { name: supplier.name } }))) {
      await prisma.supplier.create({ data: supplier });
    }
  }
  const first = await prisma.supplier.findFirstOrThrow({ where: { name: SUPPLIERS[0]?.name } });
  return first.id;
}

async function seedOpeningStock(
  prisma: PrismaService,
  purchases: PurchasesService,
  admin: AuthenticatedUser,
  supplierId: number,
  newProducts: readonly SeedProduct[],
): Promise<void> {
  const stocked = newProducts.filter((product) => product.openingStock > 0);
  if (stocked.length === 0) {
    return;
  }
  const rows = await prisma.product.findMany({ where: { sku: { in: stocked.map((p) => p.sku) } } });
  await purchases.create(
    {
      supplierId,
      note: 'Nhập tồn đầu kỳ (dữ liệu mẫu)',
      receiveNow: true,
      items: stocked.flatMap((product) => {
        const row = rows.find((candidate) => candidate.sku === product.sku);
        return row
          ? [{ productId: row.id, quantity: product.openingStock, unitCost: product.costPrice }]
          : [];
      }),
    },
    admin,
  );
}

async function seedCustomers(prisma: PrismaService, customers: CustomersService): Promise<void> {
  for (const customer of CUSTOMERS) {
    if (!(await prisma.customer.findUnique({ where: { phone: customer.phone } }))) {
      await customers.create(customer);
    }
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const admin = await seedUsers(prisma, app.get(PasswordService, { strict: false }));
    const newProducts = await seedCatalog(prisma);
    const supplierId = await seedSuppliers(prisma);
    await seedOpeningStock(
      prisma,
      app.get(PurchasesService, { strict: false }),
      admin,
      supplierId,
      newProducts,
    );
    await seedCustomers(prisma, app.get(CustomersService, { strict: false }));
    console.log('Seed completed.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
