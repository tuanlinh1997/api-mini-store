/**
 * Chronological in-memory simulation of ~90 days of store activity. It reuses the real domain
 * rules (sale calculator, payments, loyalty points, weighted-average cost, document numbers) so
 * the generated rows are exactly what the business flows would have produced. Nothing here
 * touches the database; seed-demo.ts persists the result.
 */
import { createHash } from 'node:crypto';

import {
  MovementType,
  PaymentMethod,
  Prisma,
  PurchaseStatus,
  ReferenceType,
  Role,
  SaleStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';

import { Decimal, toDecimal } from 'src/common/money/decimal';
import { formatDocumentNumber } from 'src/common/sequences/document-numbers.service';
import { storeDateStamp, STORE_TIME_ZONE } from 'src/common/time/vn-time';
import {
  buildPurchaseLines,
  weightedAverageCost,
} from 'src/modules/purchases/domain/purchase-rules';
import {
  calculateLoyaltyPoints,
  calculateSale,
  PaymentInput,
  resolvePayments,
  SaleLineInput,
} from 'src/modules/sales/domain/sale-calculator';

import {
  CATEGORIES,
  DEACTIVATED_SUPPLIER_KEY,
  DemoProductSpec,
  FIRST_NAMES_FEMALE,
  FIRST_NAMES_MALE,
  LAST_NAMES,
  MIDDLE_NAMES_FEMALE,
  MIDDLE_NAMES_MALE,
  PHONE_PREFIXES,
  PRODUCTS,
  REASONS_NEGATIVE,
  REASONS_POSITIVE,
  REASONS_ZERO,
  REPLACEMENT_SUPPLIER_KEY,
  SUPPLIERS,
  USER_AGENTS,
} from './catalog';
import { createRandom, Random } from './random';

export const SIMULATION_DAYS = 90;
const TARGET_SALES = 1200;
const POINTS_PER_VND = 10000;
const DAILY_DAYS_FOR_AVERAGE = 14;
const SUPPLIER_SWITCH_DAY = 45;
const LOW_STOCK_FREEZE_DAY = 45;
const DISCONTINUE_DAY = 50;
const CASHIER_DISCOUNT_PERCENT = 10;
const ADMIN_DISCOUNT_PERCENT = 20;
const HOUR_WEIGHTS: Record<number, number> = {
  7: 1,
  8: 2,
  9: 2,
  10: 3,
  11: 4,
  12: 5,
  13: 3,
  14: 2,
  15: 2,
  16: 3,
  17: 6,
  18: 8,
  19: 8,
  20: 6,
  21: 3,
};
const ITEM_COUNT_WEIGHTS = [18, 22, 20, 14, 10, 7, 5, 4];
const QUANTITY_WEIGHTS = [45, 28, 14, 8, 5];
const CASH_BILLS = [10000, 50000, 100000, 500000];
const PURCHASE_NOTES = [
  'Nhập hàng định kỳ',
  'Đơn bổ sung theo tồn kho',
  'Nhập theo chương trình của nhà cung cấp',
];

export interface SimUser {
  id: number;
  role: Role;
  createdAt: Date;
  lockedAt: Date | null;
}

export interface FirstIds {
  category: number;
  supplier: number;
  product: number;
  customer: number;
  purchase: number;
  purchaseItem: number;
  sale: number;
  saleItem: number;
  payment: number;
  movement: number;
  stockCount: number;
}

export interface SimulationInput {
  seed: number;
  now: Date;
  users: SimUser[];
  firstIds: FirstIds;
}

export interface SessionSeed {
  userId: number;
  createdAt: Date;
  revokedAt: Date | null;
  ageHoursBeforeNow: number;
}

export interface SimulationResult {
  categories: Prisma.CategoryCreateManyInput[];
  suppliers: Prisma.SupplierCreateManyInput[];
  products: Prisma.ProductCreateManyInput[];
  customers: Prisma.CustomerCreateManyInput[];
  purchases: Prisma.PurchaseCreateManyInput[];
  purchaseItems: Prisma.PurchaseItemCreateManyInput[];
  sales: Prisma.SaleCreateManyInput[];
  saleItems: Prisma.SaleItemCreateManyInput[];
  payments: Prisma.PaymentCreateManyInput[];
  movements: Prisma.InventoryMovementCreateManyInput[];
  stockCounts: Prisma.StockCountCreateManyInput[];
  sessions: Prisma.UserSessionCreateManyInput[];
  sequences: Prisma.DocumentSequenceCreateManyInput[];
  lowStockProducts: number;
  baseUsersCreatedAt: Date;
}

interface SimProduct {
  id: number;
  categoryKey: string;
  categoryId: number;
  supplierKey: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  price: Decimal;
  cost: Decimal;
  initialCost: number;
  stock: number;
  incoming: number;
  reorder: number;
  weight: number;
  expectedDaily: number;
  packSize: number;
  startsInactive: boolean;
  deactivateDay: number | null;
  lowTarget: boolean;
  soldByDay: number[];
  createdAt: Date;
}

interface SimCustomer {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  points: number;
}

interface SimPurchase {
  id: number;
  purchaseNo: string;
  supplierId: number;
  createdBy: number;
  status: PurchaseStatus;
  createdAt: Date;
  updatedAt: Date;
  receivedAt: Date | null;
  note: string;
  lines: { product: SimProduct; quantity: Decimal; unitCost: Decimal; lineTotal: Decimal }[];
}

interface SimEvent {
  time: Date;
  run: () => void;
}

function ean13(twelveDigits: string): string {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(twelveDigits[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${twelveDigits}${(10 - (sum % 10)) % 10}`;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export class DemoSimulation {
  private readonly random: Random;
  private readonly todayStart: DateTime;
  private readonly users: SimUser[];
  private readonly firstIds: FirstIds;
  private readonly now: Date;

  private readonly result: SimulationResult = {
    categories: [],
    suppliers: [],
    products: [],
    customers: [],
    purchases: [],
    purchaseItems: [],
    sales: [],
    saleItems: [],
    payments: [],
    movements: [],
    stockCounts: [],
    sessions: [],
    sequences: [],
    lowStockProducts: 0,
    baseUsersCreatedAt: new Date(0),
  };

  private products: SimProduct[] = [];
  private customers: SimCustomer[] = [];
  private readonly supplierIds = new Map<string, number>();
  private readonly categoryIds = new Map<string, number>();
  private readonly sequences = new Map<string, number>();
  private readonly pendingReceives: { time: Date; purchase: SimPurchase }[] = [];
  private readonly purchaseRecords: SimPurchase[] = [];
  private readonly next = {
    purchase: 0,
    purchaseItem: 0,
    sale: 0,
    saleItem: 0,
    payment: 0,
    movement: 0,
    stockCount: 0,
  };
  private priceChanges = new Map<number, { product: SimProduct; delta: number }[]>();

  constructor(input: SimulationInput) {
    this.random = createRandom(input.seed);
    this.now = input.now;
    this.users = input.users;
    this.firstIds = input.firstIds;
    this.todayStart = DateTime.fromJSDate(input.now, { zone: STORE_TIME_ZONE }).startOf('day');
    this.next.purchase = input.firstIds.purchase;
    this.next.purchaseItem = input.firstIds.purchaseItem;
    this.next.sale = input.firstIds.sale;
    this.next.saleItem = input.firstIds.saleItem;
    this.next.payment = input.firstIds.payment;
    this.next.movement = input.firstIds.movement;
    this.next.stockCount = input.firstIds.stockCount;
  }

  run(): SimulationResult {
    this.result.baseUsersCreatedAt = this.at(0, 6, 0);
    this.buildCategoriesAndSuppliers();
    this.buildProducts();
    this.buildCustomers();
    this.planPriceChanges();
    const salesPerDay = this.planSalesPerDay();
    const countDays = new Set(
      this.random.shuffle(Array.from({ length: 80 }, (_, i) => i + 8)).slice(0, 15),
    );
    const draftDays = new Set([80, 83, 85, 88]);
    const cancelDays = new Set([38, 66]);
    for (let day = 0; day < SIMULATION_DAYS; day += 1) {
      this.runDay(
        day,
        salesPerDay[day] ?? 0,
        countDays.has(day),
        draftDays.has(day),
        cancelDays.has(day),
      );
    }
    this.finalize();
    return this.result;
  }

  // ---------------------------------------------------------------- time helpers

  private dayStart(day: number): DateTime {
    return this.todayStart.minus({ days: SIMULATION_DAYS - 1 - day });
  }

  private at(day: number, hour: number, minute: number, second = 0, millisecond = 0): Date {
    return this.dayStart(day).set({ hour, minute, second, millisecond }).toJSDate();
  }

  private addMinutes(time: Date, minutes: number): Date {
    return new Date(time.getTime() + minutes * 60_000);
  }

  private isFuture(time: Date): boolean {
    return time.getTime() > this.now.getTime() - 60_000;
  }

  private nextSequence(prefix: string, time: Date): number {
    const key = `${prefix}${storeDateStamp(time)}`;
    const value = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, value);
    return value;
  }

  private documentNo(prefix: string, time: Date): string {
    return formatDocumentNumber(prefix, storeDateStamp(time), this.nextSequence(prefix, time), 4);
  }

  // ---------------------------------------------------------------- master data

  private buildCategoriesAndSuppliers(): void {
    const created = this.at(0, 6, 30);
    CATEGORIES.forEach((category, index) => {
      const id = this.firstIds.category + index;
      this.categoryIds.set(category.key, id);
      this.result.categories.push({
        id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        createdAt: created,
        updatedAt: created,
      });
    });
    SUPPLIERS.forEach((supplier, index) => {
      const id = this.firstIds.supplier + index;
      this.supplierIds.set(supplier.key, id);
      this.result.suppliers.push({
        id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        note: supplier.note,
        isActive: supplier.isActive,
        createdAt: created,
        updatedAt: supplier.isActive ? created : this.at(SUPPLIER_SWITCH_DAY, 9, 0),
      });
    });
  }

  private buildProducts(): void {
    const created = this.at(0, 7, 0);
    const totalUnitsPerDay = (TARGET_SALES / SIMULATION_DAYS) * 3.2 * 1.9;
    const barcodeSequence = new Map<string, number>();
    const specs = PRODUCTS.map((spec, index) => ({ spec, index }));
    const weights = specs.map(({ spec }) => this.baseWeight(spec));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const skuCounters = new Map<string, number>();

    this.products = specs.map(({ spec, index }) => {
      const category = CATEGORIES.find((c) => c.key === spec.categoryKey);
      const code = category?.code ?? 'XX';
      const counter = (skuCounters.get(code) ?? 0) + 1;
      skuCounters.set(code, counter);
      const weight = weights[index] ?? 1;
      const expectedDaily = (totalUnitsPerDay * weight) / totalWeight;
      const initialCost = roundTo(spec.price * (0.72 + this.random.next() * 0.16), 500);
      const sequence = (barcodeSequence.get(code) ?? 0) + 1;
      barcodeSequence.set(code, sequence);
      const barcodeBody = `893${String(1000 + (category ? CATEGORIES.indexOf(category) : 0) * 37).padStart(4, '0')}${String(sequence * 7 + index).padStart(5, '0')}`;
      return {
        id: this.firstIds.product + index,
        categoryKey: spec.categoryKey,
        categoryId: this.categoryIds.get(spec.categoryKey) ?? 0,
        supplierKey: category?.supplierKey ?? 'hoabinh',
        sku: `${code}-${String(counter).padStart(3, '0')}`,
        barcode: this.random.chance(0.88) ? ean13(barcodeBody) : null,
        name: spec.name,
        unit: spec.unit,
        price: toDecimal(spec.price),
        cost: toDecimal(Math.min(initialCost, spec.price - 500)),
        initialCost: Math.min(initialCost, spec.price - 500),
        stock: 0,
        incoming: 0,
        reorder: Math.max(4, Math.round(expectedDaily * 6)),
        weight,
        expectedDaily,
        packSize: spec.price < 30000 ? 6 : 2,
        startsInactive: !(category?.isActive ?? true),
        deactivateDay: null,
        lowTarget: false,
        soldByDay: new Array<number>(SIMULATION_DAYS).fill(0),
        createdAt: created,
      };
    });
    this.markSpecialProducts();
  }

  private baseWeight(spec: DemoProductSpec): number {
    const category = CATEGORIES.find((c) => c.key === spec.categoryKey);
    const priceFactor = 1 / (1 + spec.price / 40000);
    return (category?.weight ?? 1) * priceFactor * (0.25 + this.random.next() ** 2 * 2.2);
  }

  private markSpecialProducts(): void {
    const eligible = this.products.filter((p) => !p.startsInactive);
    const byWeight = [...eligible].sort((a, b) => b.weight - a.weight);
    const popular = new Set(byWeight.slice(0, 15).map((p) => p.id));
    const candidates = this.random.shuffle(eligible.filter((p) => !popular.has(p.id)));
    candidates.slice(0, 10).forEach((p) => {
      p.lowTarget = true;
    });
    candidates.slice(10, 12).forEach((p) => {
      p.deactivateDay = DISCONTINUE_DAY;
    });
  }

  private buildCustomers(): void {
    const used = new Set<string>();
    const raw: Omit<SimCustomer, 'id' | 'code'>[] = [];
    for (let index = 0; index < 60; index += 1) {
      const female = this.random.chance(0.55);
      const fullName = [
        this.random.pick(LAST_NAMES),
        this.random.pick(female ? MIDDLE_NAMES_FEMALE : MIDDLE_NAMES_MALE),
        this.random.pick(female ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE),
      ].join(' ');
      const createdDay = Math.floor(this.random.next() ** 1.6 * (SIMULATION_DAYS - 1));
      const createdAt = this.at(
        createdDay,
        this.random.int(8, 20),
        this.random.int(0, 59),
        this.random.int(0, 59),
      );
      raw.push({
        fullName,
        phone: index < 9 ? null : this.uniquePhone(used),
        email: this.random.chance(0.2)
          ? `${this.slug(fullName)}${this.random.int(1, 99)}@example.vn`
          : null,
        createdAt,
        updatedAt: createdAt,
        points: 0,
      });
    }
    raw.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    this.customers = raw.map((customer, index) => ({
      ...customer,
      id: this.firstIds.customer + index,
      code: `KH${String(index + 1).padStart(6, '0')}`,
    }));
  }

  private uniquePhone(used: Set<string>): string {
    for (;;) {
      const phone = `${this.random.pick(PHONE_PREFIXES)}${String(this.random.int(0, 9999999)).padStart(7, '0')}`;
      if (!used.has(phone)) {
        used.add(phone);
        return phone;
      }
    }
  }

  private slug(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z]+/g, '.');
  }

  private planPriceChanges(): void {
    const candidates = this.random
      .shuffle(this.products.filter((p) => !p.startsInactive))
      .slice(0, 10);
    for (const product of candidates) {
      const day = this.random.int(20, 80);
      const delta = this.random.pick([500, 1000, 1000, 2000]);
      const list = this.priceChanges.get(day) ?? [];
      list.push({ product, delta });
      this.priceChanges.set(day, list);
    }
  }

  private planSalesPerDay(): number[] {
    const weights = Array.from({ length: SIMULATION_DAYS }, (_, day) => {
      const weekday = this.dayStart(day).weekday;
      const weekend = weekday >= 6 ? 1.6 : 1;
      return (
        weekend * (1 + (0.15 * day) / (SIMULATION_DAYS - 1)) * (0.85 + this.random.next() * 0.3)
      );
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    return weights.map((w) => Math.round((TARGET_SALES * w) / total));
  }

  // ---------------------------------------------------------------- day loop

  private runDay(
    day: number,
    saleCount: number,
    hasCount: boolean,
    hasDraft: boolean,
    hasCancel: boolean,
  ): void {
    const events: SimEvent[] = [];
    for (const change of this.priceChanges.get(day) ?? []) {
      change.product.price = change.product.price.plus(change.delta);
    }
    if (day === 0) {
      events.push({ time: this.at(0, 7, 30), run: () => this.initialStockIn(0) });
    } else {
      events.push({ time: this.at(day, 7, 30), run: () => this.restockCheck(day) });
    }
    this.collectPendingReceives(day, events);
    this.scheduleSales(day, saleCount, events);
    if (hasCount) {
      events.push({
        time: this.at(day, 21, 30 + this.random.int(0, 20)),
        run: () => this.stockCount(day),
      });
    }
    if (hasDraft) {
      events.push({
        time: this.at(day, 15, this.random.int(0, 50)),
        run: () => this.standalonePurchase(day, PurchaseStatus.DRAFT),
      });
    }
    if (hasCancel) {
      events.push({
        time: this.at(day, 14, this.random.int(0, 50)),
        run: () => this.standalonePurchase(day, PurchaseStatus.CANCELLED),
      });
    }
    this.processEvents(events);
  }

  private processEvents(events: SimEvent[]): void {
    while (events.length > 0) {
      events.sort((a, b) => a.time.getTime() - b.time.getTime());
      const event = events.shift();
      if (event && !this.isFuture(event.time)) {
        this.currentEvents = events;
        event.run();
      }
    }
  }

  private currentEvents: SimEvent[] = [];

  private collectPendingReceives(day: number, events: SimEvent[]): void {
    const dayEnd = this.dayStart(day).plus({ days: 1 }).toMillis();
    for (let index = this.pendingReceives.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingReceives[index];
      if (pending && pending.time.getTime() < dayEnd) {
        this.pendingReceives.splice(index, 1);
        events.push({
          time: pending.time,
          run: () => this.receive(pending.purchase, pending.time),
        });
      }
    }
  }

  private scheduleSales(day: number, count: number, events: SimEvent[]): void {
    const hours = Object.keys(HOUR_WEIGHTS)
      .map(Number)
      .filter((h) => day > 0 || h >= 10);
    const times = Array.from({ length: count }, () => {
      const hour = this.random.weightedPick(hours, (h) => HOUR_WEIGHTS[h] ?? 1);
      return this.at(
        day,
        hour,
        this.random.int(0, 59),
        this.random.int(0, 59),
        this.random.int(0, 999),
      );
    });
    for (const time of times) {
      events.push({ time, run: () => this.sale(time, day) });
    }
  }

  // ---------------------------------------------------------------- products helpers

  private isActiveOn(product: SimProduct, day: number): boolean {
    return (
      !product.startsInactive && (product.deactivateDay === null || day < product.deactivateDay)
    );
  }

  private averageDaily(product: SimProduct, day: number): number {
    const from = Math.max(0, day - DAILY_DAYS_FOR_AVERAGE);
    const span = Math.max(1, day - from);
    let sold = 0;
    for (let d = from; d < day; d += 1) {
      sold += product.soldByDay[d] ?? 0;
    }
    return day === 0 ? product.expectedDaily : Math.max(0.25, sold / span);
  }

  private supplierKeyFor(product: SimProduct, day: number): string {
    return product.supplierKey === DEACTIVATED_SUPPLIER_KEY && day >= SUPPLIER_SWITCH_DAY
      ? REPLACEMENT_SUPPLIER_KEY
      : product.supplierKey;
  }

  private unitCostFor(product: SimProduct, day: number): number {
    const drift = 1 + (this.random.next() - 0.5) * 0.08 + (0.03 * day) / SIMULATION_DAYS;
    return Math.min(
      product.price.toNumber() - 500,
      Math.max(500, roundTo(product.initialCost * drift, 100)),
    );
  }

  private roundUpToPack(quantity: number, pack: number): number {
    return Math.max(pack, Math.ceil(quantity / pack) * pack);
  }

  // ---------------------------------------------------------------- purchasing

  private initialStockIn(day: number): void {
    const wanted = this.products
      .filter((p) => this.isActiveOn(p, day))
      .map((product) => ({
        product,
        quantity: this.roundUpToPack(Math.ceil(product.expectedDaily * 40), product.packSize),
      }));
    this.createPurchasesBySupplier(day, wanted, true);
  }

  private restockCheck(day: number): void {
    const isPlannedDay = day % 21 === 10;
    const wanted: { product: SimProduct; quantity: number }[] = [];
    for (const product of this.products) {
      if (!this.isActiveOn(product, day) || (product.lowTarget && day >= LOW_STOCK_FREEZE_DAY)) {
        continue;
      }
      const average = this.averageDaily(product, day);
      const position = product.stock + product.incoming;
      const urgent = position <= Math.ceil(average * 1.5);
      const planned =
        isPlannedDay && position <= Math.max(product.reorder, Math.ceil(average * 45));
      if (urgent || planned) {
        const quantity = this.roundUpToPack(Math.ceil(average * 60) - position, product.packSize);
        wanted.push({ product, quantity });
      }
    }
    this.createPurchasesBySupplier(day, wanted, false);
  }

  private createPurchasesBySupplier(
    day: number,
    wanted: { product: SimProduct; quantity: number }[],
    isInitial: boolean,
  ): void {
    const groups = new Map<string, { product: SimProduct; quantity: number }[]>();
    for (const entry of wanted) {
      const key = this.supplierKeyFor(entry.product, day);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    let offset = 0;
    for (const [supplierKey, entries] of groups) {
      const createdAt = this.at(
        day,
        7,
        40 + offset,
        this.random.int(0, 59),
        this.random.int(0, 999),
      );
      offset += 1;
      this.createPurchase(day, supplierKey, entries, createdAt, isInitial);
    }
  }

  private pickStockkeeper(time: Date): SimUser {
    const keepers = this.users.filter((u) => u.role === Role.STOCKKEEPER && u.createdAt <= time);
    const admins = this.users.filter((u) => u.role === Role.ADMIN);
    const pool =
      this.random.chance(0.1) && admins.length > 0 ? admins : keepers.length > 0 ? keepers : admins;
    return this.random.pick(pool);
  }

  private createPurchase(
    day: number,
    supplierKey: string,
    entries: { product: SimProduct; quantity: number }[],
    createdAt: Date,
    isInitial: boolean,
  ): SimPurchase {
    const lines = buildPurchaseLines(
      entries.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
        unitCost: this.unitCostFor(product, day),
      })),
    ).map((line, index) => ({
      ...line,
      product: (entries[index] as { product: SimProduct }).product,
    }));
    const purchase: SimPurchase = {
      id: this.next.purchase++,
      purchaseNo: this.documentNo('PN', createdAt),
      supplierId: this.supplierIds.get(supplierKey) ?? 0,
      createdBy: this.pickStockkeeper(createdAt).id,
      status: PurchaseStatus.DRAFT,
      createdAt,
      updatedAt: createdAt,
      receivedAt: null,
      note: isInitial ? 'Nhập tồn đầu kỳ' : this.random.pick(PURCHASE_NOTES),
      lines,
    };
    this.purchaseRecords.push(purchase);
    this.scheduleReceive(purchase, day, isInitial);
    return purchase;
  }

  private scheduleReceive(purchase: SimPurchase, day: number, isInitial: boolean): void {
    const sameDay = isInitial || this.random.chance(0.75);
    const receiveAt = sameDay
      ? this.addMinutes(purchase.createdAt, this.random.int(45, isInitial ? 110 : 240))
      : this.at(day + 1, 8, this.random.int(15, 59), this.random.int(0, 59));
    if (this.isFuture(receiveAt)) {
      return;
    }
    for (const line of purchase.lines) {
      line.product.incoming += line.quantity.toNumber();
    }
    if (sameDay) {
      this.currentEvents.push({ time: receiveAt, run: () => this.receive(purchase, receiveAt) });
    } else {
      this.pendingReceives.push({ time: receiveAt, purchase });
    }
  }

  private receive(purchase: SimPurchase, time: Date): void {
    for (const line of purchase.lines) {
      const product = line.product;
      product.cost = weightedAverageCost(
        toDecimal(product.stock),
        product.cost,
        line.quantity,
        line.unitCost,
      );
      product.stock += line.quantity.toNumber();
      product.incoming -= line.quantity.toNumber();
      this.result.movements.push({
        id: this.next.movement++,
        productId: product.id,
        movementType: MovementType.PURCHASE,
        quantityChange: line.quantity,
        referenceType: ReferenceType.PURCHASE,
        referenceId: purchase.id,
        createdBy: purchase.createdBy,
        note: null,
        createdAt: time,
      });
    }
    purchase.status = PurchaseStatus.RECEIVED;
    purchase.receivedAt = time;
    purchase.updatedAt = time;
  }

  private standalonePurchase(day: number, status: PurchaseStatus): void {
    const createdAt = this.at(
      day,
      status === PurchaseStatus.DRAFT ? 15 : 14,
      5,
      this.random.int(0, 59),
    );
    const supplierKey = this.random.pick(SUPPLIERS.filter((s) => s.isActive)).key;
    const pool = this.products.filter(
      (p) => this.isActiveOn(p, day) && this.supplierKeyFor(p, day) === supplierKey,
    );
    const chosen = this.random.shuffle(pool).slice(0, this.random.int(3, 7));
    if (chosen.length === 0) {
      return;
    }
    const entries = chosen.map((product) => ({
      product,
      quantity: this.roundUpToPack(Math.ceil(product.expectedDaily * 20), product.packSize),
    }));
    const lines = buildPurchaseLines(
      entries.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
        unitCost: this.unitCostFor(product, day),
      })),
    ).map((line, index) => ({
      ...line,
      product: (entries[index] as { product: SimProduct }).product,
    }));
    this.purchaseRecords.push({
      id: this.next.purchase++,
      purchaseNo: this.documentNo('PN', createdAt),
      supplierId: this.supplierIds.get(supplierKey) ?? 0,
      createdBy: this.pickStockkeeper(createdAt).id,
      status,
      createdAt,
      updatedAt: status === PurchaseStatus.CANCELLED ? this.addMinutes(createdAt, 70) : createdAt,
      receivedAt: null,
      note:
        status === PurchaseStatus.CANCELLED
          ? 'Hủy đơn: nhà cung cấp báo hết hàng'
          : 'Đơn nháp, chờ xác nhận giá',
      lines,
    });
  }

  // ---------------------------------------------------------------- sales

  private pickCashier(time: Date): SimUser {
    const staff = this.users.filter(
      (u) =>
        (u.role === Role.CASHIER || u.role === Role.ADMIN) &&
        u.createdAt <= time &&
        (u.lockedAt === null || time < u.lockedAt),
    );
    return this.random.weightedPick(staff, (u) => (u.role === Role.ADMIN ? 0.4 : 3));
  }

  private chooseLines(day: number): { product: SimProduct; quantity: number }[] {
    let pool = this.products.filter((p) => this.isActiveOn(p, day) && p.stock > 0);
    const target = this.random.weightedPick(
      [1, 2, 3, 4, 5, 6, 7, 8],
      (n) => ITEM_COUNT_WEIGHTS[n - 1] ?? 1,
    );
    const lines: { product: SimProduct; quantity: number }[] = [];
    while (lines.length < target && pool.length > 0) {
      const product = this.random.weightedPick(pool, (p) => p.weight);
      pool = pool.filter((p) => p.id !== product.id);
      const maxQuantity = product.price.gt(100000) ? 2 : 5;
      const wanted = this.random.weightedPick([1, 2, 3, 4, 5], (q) => QUANTITY_WEIGHTS[q - 1] ?? 1);
      const quantity = Math.min(wanted, maxQuantity, product.stock);
      if (quantity > 0) {
        lines.push({ product, quantity });
      }
    }
    return lines.sort((a, b) => a.product.id - b.product.id);
  }

  private pickCustomer(time: Date): SimCustomer | null {
    if (!this.random.chance(0.4)) {
      return null;
    }
    const eligible = this.customers.filter((c) => c.createdAt <= time);
    return eligible.length > 0 ? this.random.pick(eligible) : null;
  }

  private sale(time: Date, day: number): void {
    const chosen = this.chooseLines(day);
    if (chosen.length === 0) {
      return;
    }
    const cashier = this.pickCashier(time);
    const customer = this.pickCustomer(time);
    const inputs: SaleLineInput[] = chosen.map(({ product, quantity }) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: toDecimal(quantity),
      unitPrice: product.price,
      unitCost: product.cost,
    }));
    const calculated = this.priceCart(inputs, cashier.role);
    const payments = resolvePayments(
      calculated.total,
      this.buildPayments(calculated.total.toNumber()),
    );
    const points = customer ? calculateLoyaltyPoints(calculated.total, POINTS_PER_VND) : 0;
    const saleId = this.next.sale++;
    this.result.sales.push({
      id: saleId,
      invoiceNo: this.documentNo('HD', time),
      customerId: customer?.id ?? null,
      cashierId: cashier.id,
      status: SaleStatus.PAID,
      subtotal: calculated.subtotal,
      discountAmount: calculated.discountAmount,
      total: calculated.total,
      pointsEarned: points,
      note: null,
      soldAt: time,
      createdAt: time,
      updatedAt: time,
    });
    for (const line of calculated.lines) {
      this.result.saleItems.push({
        id: this.next.saleItem++,
        saleId,
        productId: line.productId,
        skuSnapshot: line.sku,
        nameSnapshot: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCostSnapshot: line.unitCost,
        discountAmount: line.discountAmount,
        lineTotal: line.lineTotal,
      });
    }
    for (const payment of payments) {
      this.result.payments.push({
        id: this.next.payment++,
        saleId,
        method: payment.method,
        amount: payment.amount,
        tenderedAmount: payment.tenderedAmount,
        changeAmount: payment.changeAmount,
        paidAt: time,
        reference: payment.reference ?? null,
      });
    }
    this.applySaleStock(chosen, saleId, cashier.id, time, day);
    if (customer) {
      customer.points += points;
      customer.updatedAt = time;
    }
  }

  private priceCart(inputs: SaleLineInput[], role: Role): ReturnType<typeof calculateSale> {
    const maxPercent = role === Role.ADMIN ? ADMIN_DISCOUNT_PERCENT : CASHIER_DISCOUNT_PERCENT;
    if (this.random.chance(0.12)) {
      const subtotal = inputs.reduce((sum, l) => sum + l.unitPrice.times(l.quantity).toNumber(), 0);
      const percent = this.random.int(2, maxPercent);
      const discount = Math.floor((subtotal * percent) / 100 / 1000) * 1000;
      if (discount >= 1000 && discount < subtotal) {
        return calculateSale(inputs, toDecimal(discount), maxPercent);
      }
    }
    return calculateSale(inputs, toDecimal(0), maxPercent);
  }

  private buildPayments(total: number): PaymentInput[] {
    const roll = this.random.next();
    if (roll < 0.65) {
      return [this.cashPayment(total)];
    }
    if (roll < 0.78) {
      return [
        {
          method: PaymentMethod.CARD,
          amount: toDecimal(total),
          reference: `POS${this.random.int(100000, 999999)}`,
        },
      ];
    }
    if (roll < 0.96) {
      return [
        {
          method: PaymentMethod.TRANSFER,
          amount: toDecimal(total),
          reference: `FT${this.random.int(10 ** 9, 10 ** 10 - 1)}`,
        },
      ];
    }
    const cashPart = Math.floor((total * (0.3 + this.random.next() * 0.4)) / 1000) * 1000;
    if (cashPart < 1000 || cashPart >= total) {
      return [this.cashPayment(total)];
    }
    const other = this.random.chance(0.5) ? PaymentMethod.TRANSFER : PaymentMethod.CARD;
    return [
      this.cashPayment(cashPart),
      {
        method: other,
        amount: toDecimal(total - cashPart),
        reference: `${other === PaymentMethod.CARD ? 'POS' : 'FT'}${this.random.int(100000, 999999)}`,
      },
    ];
  }

  private cashPayment(amount: number): PaymentInput {
    if (this.random.chance(0.35)) {
      return {
        method: PaymentMethod.CASH,
        amount: toDecimal(amount),
        tenderedAmount: toDecimal(amount),
      };
    }
    const bills = CASH_BILLS.filter((bill) => bill <= Math.max(10000, amount * 2));
    const bill = this.random.pick(bills);
    return {
      method: PaymentMethod.CASH,
      amount: toDecimal(amount),
      tenderedAmount: toDecimal(Math.ceil(amount / bill) * bill),
    };
  }

  private applySaleStock(
    chosen: { product: SimProduct; quantity: number }[],
    saleId: number,
    cashierId: number,
    time: Date,
    day: number,
  ): void {
    for (const { product, quantity } of chosen) {
      product.stock -= quantity;
      product.soldByDay[day] = (product.soldByDay[day] ?? 0) + quantity;
      this.result.movements.push({
        id: this.next.movement++,
        productId: product.id,
        movementType: MovementType.SALE,
        quantityChange: toDecimal(-quantity),
        referenceType: ReferenceType.SALE,
        referenceId: saleId,
        createdBy: cashierId,
        note: null,
        createdAt: time,
      });
    }
  }

  // ---------------------------------------------------------------- stock counts

  private stockCount(day: number): void {
    const time = this.addMinutes(this.at(day, 21, 30), this.random.int(0, 30));
    const stocked = this.products.filter((p) => p.stock > 0);
    if (stocked.length === 0) {
      return;
    }
    const product = this.random.pick(stocked);
    const roll = this.random.next();
    let difference = 0;
    let reason = this.random.pick(REASONS_ZERO);
    if (roll >= 0.35 && roll < 0.75) {
      difference = -Math.min(product.stock, this.random.int(1, 5));
      reason = this.random.pick(REASONS_NEGATIVE);
    } else if (roll >= 0.75) {
      difference = this.random.int(1, 4);
      reason = this.random.pick(REASONS_POSITIVE);
    }
    const counter = this.pickStockkeeper(time);
    const id = this.next.stockCount++;
    const systemQty = product.stock;
    product.stock += difference;
    this.result.stockCounts.push({
      id,
      countNo: this.documentNo('KK', time),
      productId: product.id,
      systemQty: toDecimal(systemQty),
      countedQty: toDecimal(product.stock),
      difference: toDecimal(difference),
      reason,
      createdBy: counter.id,
      createdAt: time,
    });
    if (difference !== 0) {
      this.result.movements.push({
        id: this.next.movement++,
        productId: product.id,
        movementType: MovementType.ADJUSTMENT,
        quantityChange: toDecimal(difference),
        referenceType: ReferenceType.STOCK_COUNT,
        referenceId: id,
        createdBy: counter.id,
        note: reason,
        createdAt: time,
      });
    }
  }

  // ---------------------------------------------------------------- output

  private finalize(): void {
    this.finalizeProducts();
    this.finalizePurchases();
    this.result.customers = this.customers.map((c) => ({
      id: c.id,
      customerCode: c.code,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      loyaltyPoints: c.points,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    this.result.sequences = [
      ...[...this.sequences].map(([key, lastValue]) => ({ key, lastValue })),
      { key: 'KH', lastValue: this.customers.length },
    ];
    this.buildSessions();
  }

  private finalizeProducts(): void {
    let lowCount = 0;
    for (const product of this.products) {
      if (product.lowTarget && product.stock > product.reorder) {
        product.reorder = product.stock + this.random.int(2, 6);
      }
      if (product.stock <= product.reorder) {
        lowCount += 1;
      }
      const isActive = !product.startsInactive && product.deactivateDay === null;
      this.result.products.push({
        id: product.id,
        categoryId: product.categoryId,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        unit: product.unit,
        salePrice: product.price,
        costPrice: product.cost,
        stockQty: toDecimal(product.stock),
        reorderLevel: toDecimal(product.reorder),
        isActive,
        createdAt: product.createdAt,
        updatedAt: this.now,
      });
    }
    this.result.lowStockProducts = lowCount;
  }

  private finalizePurchases(): void {
    for (const purchase of this.purchaseRecords) {
      const total = purchase.lines.reduce((sum, l) => sum.plus(l.lineTotal), toDecimal(0));
      this.result.purchases.push({
        id: purchase.id,
        purchaseNo: purchase.purchaseNo,
        supplierId: purchase.supplierId,
        createdBy: purchase.createdBy,
        status: purchase.status,
        subtotal: total,
        total,
        note: purchase.note,
        receivedAt: purchase.receivedAt,
        receivedBy: purchase.receivedAt ? purchase.createdBy : null,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt,
      });
      for (const line of purchase.lines) {
        this.result.purchaseItems.push({
          id: this.next.purchaseItem++,
          purchaseId: purchase.id,
          productId: line.product.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        });
      }
    }
  }

  private buildSessions(): void {
    const byRole = (role: Role): SimUser[] => this.users.filter((u) => u.role === role);
    const [admin] = byRole(Role.ADMIN);
    const cashiers = byRole(Role.CASHIER);
    const keepers = byRole(Role.STOCKKEEPER);
    const locked = this.users.find((u) => u.lockedAt !== null);
    const plan: { user: SimUser | undefined; hoursAgo: number; revoked: boolean }[] = [
      { user: admin, hoursAgo: 30, revoked: false },
      { user: admin, hoursAgo: 120, revoked: true },
      { user: cashiers[0], hoursAgo: 5, revoked: false },
      { user: cashiers[0], hoursAgo: 52, revoked: true },
      { user: cashiers[1], hoursAgo: 9, revoked: false },
      { user: cashiers[2], hoursAgo: 75, revoked: true },
      { user: keepers[0], hoursAgo: 20, revoked: false },
    ];
    for (const entry of plan) {
      if (entry.user) {
        this.pushSession(
          entry.user.id,
          this.addMinutes(this.now, -entry.hoursAgo * 60),
          entry.revoked ? this.addMinutes(this.now, -(entry.hoursAgo - 8) * 60) : null,
        );
      }
    }
    if (locked?.lockedAt) {
      this.pushSession(locked.id, this.addMinutes(locked.lockedAt, -3 * 24 * 60), locked.lockedAt);
    }
  }

  private pushSession(userId: number, createdAt: Date, revokedAt: Date | null): void {
    const token = `demo-${this.random.int(0, 2 ** 30)}-${this.random.int(0, 2 ** 30)}`;
    const hex = (length: number): string =>
      Array.from({ length }, () => this.random.int(0, 15).toString(16)).join('');
    this.result.sessions.push({
      id: `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`,
      userId,
      refreshTokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: this.addMinutes(createdAt, 7 * 24 * 60),
      revokedAt,
      userAgent: this.random.pick(USER_AGENTS).slice(0, 255),
      ip: `192.168.1.${this.random.int(10, 90)}`,
      createdAt,
    });
  }
}

/** VN calendar window covered by the simulation (inclusive dates). */
export function describeSimulationWindow(now: Date): { from: string; to: string } {
  const today = DateTime.fromJSDate(now, { zone: STORE_TIME_ZONE }).startOf('day');
  return {
    from: today.minus({ days: SIMULATION_DAYS - 1 }).toFormat('yyyy-LL-dd'),
    to: today.toFormat('yyyy-LL-dd'),
  };
}

/** Instant of `hour:minute` (store time) on simulated day `day` (0 = first day, last = today). */
export function simulationInstant(now: Date, day: number, hour: number, minute: number): Date {
  return DateTime.fromJSDate(now, { zone: STORE_TIME_ZONE })
    .startOf('day')
    .minus({ days: SIMULATION_DAYS - 1 - day })
    .set({ hour, minute })
    .toJSDate();
}
