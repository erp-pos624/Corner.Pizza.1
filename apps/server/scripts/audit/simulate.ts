/**
 * Phase 3/4: historical workload simulation against the isolated audit DB.
 *
 * Orders are produced by the real order services (not hand-written rows), then
 * backdated into the five-year window. A second pass reconciles money, stock
 * and ledger invariants with SQL.
 *
 * Usage (audit DB only):
 *   node --import tsx apps/server/scripts/audit/simulate.ts --days=3 --per-day=500
 */
import { statfsSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import type { OrderCreateInput, PublicQuoteInput } from '@posshope/shared';
import { prisma } from '../../src/prisma.js';
import { ValidationError } from '../../src/lib/errors.js';
import * as orders from '../../src/modules/orders/orders.service.js';
import * as delivery from '../../src/modules/delivery/delivery.service.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = resolve(ROOT, 'docs/audit/results');

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
}

const DAYS = arg('days', 3);
const PER_DAY = arg('per-day', 500);
const CONCURRENCY = arg('concurrency', 8);
const TOTAL_ORDERS = DAYS * PER_DAY;
const RUN_TAG = `sim-${Date.now()}`;
const HORIZON_DAYS = 1825; // five years of daily service
// Even spread across the horizon samples five years of history; recent mode
// packs the sampled days into the last DAYS days for month-scale reports.
const RECENT = arg('recent', 0) === 1;

let seed = 20261118;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(rows: readonly T[]): T {
  return rows[Math.floor(rand() * rows.length)]!;
}
function intBetween(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function money(value: number): string {
  return value.toFixed(2);
}

const HOUR_WEIGHTS = [3, 4, 5, 6, 7, 8, 8, 9, 10, 9, 7, 5]; // 12:00 → 23:59 local

function businessTimestamp(dayIndex: number): Date {
  const date = new Date(Date.UTC(2021, 10, 19));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  const total = HOUR_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  let hour = 12;
  for (let index = 0; index < HOUR_WEIGHTS.length; index += 1) {
    roll -= HOUR_WEIGHTS[index]!;
    if (roll <= 0) {
      hour = 12 + index;
      break;
    }
  }
  date.setUTCHours(hour - 2, intBetween(0, 59), intBetween(0, 59), 0); // Cairo ≈ UTC+2
  return date;
}

interface Fixtures {
  branchId: string;
  actor: { id: string; role: 'ADMIN'; branchId: null };
  items: Array<{
    id: string;
    basePrice: string;
    hasSizes: boolean;
    sizes: Array<{ id: string; price: string }>;
  }>;
  toppings: string[];
  discounts: Array<{ id: string; type: 'PERCENT' | 'FIXED'; value: number }>;
  tables: string[];
  drivers: string[];
  zones: Array<{ id: string; centerLat: number; centerLng: number }>;
  maxCashierDiscount: number;
}

async function loadFixtures(): Promise<Fixtures> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: 'branch-main' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
  const items = await prisma.menuItem.findMany({
    where: { isAvailable: true, recipes: { some: { isActive: true } } },
    select: {
      id: true,
      basePrice: true,
      hasSizes: true,
      sizes: { select: { id: true, price: true } },
    },
  });
  const toppings = await prisma.topping.findMany({ where: { isAvailable: true }, select: { id: true } });
  const discounts = await prisma.discount.findMany({
    where: { isActive: true },
    select: { id: true, type: true, value: true },
  });
  const tables = await prisma.diningTable.findMany({
    where: { branchId: branch.id, isActive: true },
    select: { id: true },
  });
  const drivers = await prisma.user.findMany({
    where: { role: 'DRIVER', isActive: true },
    select: { id: true },
  });
  const zones = await prisma.deliveryZone.findMany({
    where: { branchId: branch.id, isActive: true },
    select: { id: true, centerLat: true, centerLng: true },
  });
  const settings = await prisma.restaurantSettings.findUnique({ where: { id: 'default' } });

  await prisma.ingredientStock.updateMany({ data: { currentStock: 500_000 } });
  const ingredients = await prisma.ingredient.findMany({ select: { id: true } });
  await prisma.ingredientStock.createMany({
    data: ingredients.map((row) => ({
      ingredientId: row.id,
      branchId: branch.id,
      currentStock: 500_000,
    })),
    skipDuplicates: true,
  });
  return {
    branchId: branch.id,
    actor: { id: admin.id, role: 'ADMIN', branchId: null },
    items: items.filter((item) => item.sizes.length > 0 || !item.hasSizes),
    toppings: toppings.map((row) => row.id),
    discounts: discounts
      .filter((row) => Number(row.value) <= 20)
      .map((row) => ({ id: row.id, type: row.type, value: Number(row.value) })),
    tables: tables.map((row) => row.id),
    drivers: drivers.map((row) => row.id),
    zones,
    maxCashierDiscount: Number(settings?.maxCashierDiscountPct ?? 20),
  };
}

type EventKind = 'TAKEAWAY' | 'DELIVERY' | 'DINE_IN';

interface EventSpec {
  index: number;
  dayIndex: number;
  timestamp: Date;
  kind: EventKind;
}

function buildEvents(): EventSpec[] {
  const events: EventSpec[] = [];
  const perDay = Math.max(1, Math.floor(TOTAL_ORDERS / DAYS));
  for (let index = 0; index < TOTAL_ORDERS; index += 1) {
    const sampleIndex = Math.min(DAYS - 1, Math.floor(index / perDay));
    const dayIndex = RECENT
      ? HORIZON_DAYS - DAYS + sampleIndex
      : DAYS === 1
        ? HORIZON_DAYS - 1
        : Math.round((sampleIndex * (HORIZON_DAYS - 1)) / (DAYS - 1));
    const roll = rand();
    const kind: EventKind = roll < 0.45 ? 'TAKEAWAY' : roll < 0.85 ? 'DELIVERY' : 'DINE_IN';
    events.push({ index, dayIndex, timestamp: businessTimestamp(dayIndex), kind });
  }
  return events;
}

/** Mirrors createOrder pricing; the public quote deliberately ignores discounts. */
function payableTotal(
  quote: { subtotal: string; taxRate: string; deliveryFee: string | null },
  discount: { type: 'PERCENT' | 'FIXED'; value: number } | null,
): number {
  const subtotalMinor = Math.round(Number(quote.subtotal) * 100);
  const discountMinor = !discount
    ? 0
    : discount.type === 'PERCENT'
      ? Math.round((subtotalMinor * discount.value) / 100)
      : Math.min(Math.round(discount.value * 100), subtotalMinor);
  const taxableMinor = Math.max(subtotalMinor - discountMinor, 0);
  const taxMinor = Math.round((taxableMinor * Number(quote.taxRate)) / 100);
  const feeMinor = Math.round(Number(quote.deliveryFee ?? 0) * 100);
  return (taxableMinor + taxMinor + feeMinor) / 100;
}

function buildItems(fixtures: Fixtures) {
  const lines = [];
  const lineCount = intBetween(1, 3);
  for (let line = 0; line < lineCount; line += 1) {
    const item = pick(fixtures.items);
    const size = item.sizes.length > 0 ? pick(item.sizes) : null;
    const toppingCount = rand() < 0.4 ? intBetween(1, 3) : 0;
    const toppingIds: string[] = [];
    for (let index = 0; index < toppingCount; index += 1) {
      const toppingId = pick(fixtures.toppings);
      if (!toppingIds.includes(toppingId)) toppingIds.push(toppingId);
    }
    lines.push({ menuItemId: item.id, sizeId: size?.id ?? null, quantity: intBetween(1, 2), toppingIds });
  }
  return lines;
}

interface Timings {
  create: number[];
  settle: number[];
  total: number[];
}

const timings: Timings = { create: [], settle: [], total: [] };
const stepErrors: Record<string, number> = {};
const createdIds: Array<{ id: string; dayIndex: number; timestamp: Date }> = [];
const counters = {
  created: 0,
  settled: 0,
  cancelled: 0,
  refunded: 0,
  completed: 0,
  delivered: 0,
  failed: 0,
};

function noteError(step: string, error: unknown): void {
  stepErrors[step] = (stepErrors[step] ?? 0) + 1;
  if ((stepErrors[step] ?? 0) === 1) {
    console.warn(`  first ${step} error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function processEvent(
  event: EventSpec,
  fixtures: Fixtures,
  tableId: string | null,
): Promise<void> {
  const started = process.hrtime.bigint();
  const context = { branchId: fixtures.branchId, terminalId: 'SIM-T1' };
  const discount = rand() < 0.12 && fixtures.discounts.length > 0 ? pick(fixtures.discounts) : null;
  const discountId = discount?.id ?? null;
  let items = buildItems(fixtures);
  const fulfillment = event.kind === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY';
  const coordinates =
    event.kind === 'DELIVERY' && fixtures.zones.length > 0
      ? (() => {
          const zone = pick(fixtures.zones);
          return { lat: zone.centerLat + (rand() - 0.5) * 0.01, lng: zone.centerLng + (rand() - 0.5) * 0.01 };
        })()
      : null;

  try {
    const quoteInput: PublicQuoteInput = {
      branchId: fixtures.branchId,
      fulfillment,
      items,
      ...(coordinates ? { customerLat: coordinates.lat, customerLng: coordinates.lng } : {}),
    };
    let quote = await orders.quoteOrder(quoteInput);
    for (let attempt = 0; attempt < 2 && event.kind === 'DELIVERY' && quote.deliveryIssue; attempt += 1) {
      items = items.map((line) => ({ ...line, quantity: line.quantity + 2 }));
      quoteInput.items = items;
      quote = await orders.quoteOrder(quoteInput);
    }
    if (event.kind === 'DELIVERY' && quote.deliveryIssue) {
      throw new ValidationError(quote.deliveryIssue);
    }
    const payable = payableTotal(quote, discount);

    const methodRoll = rand();
    const method = methodRoll < 0.55 ? 'CASH' : methodRoll < 0.9 ? 'CARD' : 'WALLET';
    const isCod = event.kind === 'DELIVERY' && rand() < 0.2;
    const payments = isCod
      ? []
      : method === 'CASH'
        ? [{ method: 'CASH', amount: money(Math.ceil(payable / 5) * 5) }]
        : [{ method, amount: money(payable) }];

    const base: OrderCreateInput = {
      type: event.kind === 'DINE_IN' ? 'DINE_IN' : event.kind,
      ...(event.kind === 'DINE_IN' && tableId ? { tableId, payLater: true } : { payLater: false }),
      isCod,
      ...(discountId ? { discountId } : {}),
      ...(event.kind === 'DELIVERY'
        ? {
            customerName: `Sim Customer ${event.index}`,
            customerPhone: `0100${String(1000000 + event.index).slice(-7)}`,
            customerAddress: 'Simulated address, Zamalek',
            ...(coordinates
              ? { customerLat: coordinates.lat, customerLng: coordinates.lng }
              : {}),
          }
        : {}),
      items,
      payments,
    };

    const createStart = process.hrtime.bigint();
    const order = await orders.createOrder(base, fixtures.actor, context);
    timings.create.push(Number(process.hrtime.bigint() - createStart) / 1e6);
    createdIds.push({ id: order.id, dayIndex: event.dayIndex, timestamp: event.timestamp });
    counters.created += 1;
    const total = Number(order.total);
    if (Math.abs(total - payable) > 0.005) {
      noteError('pricing', new Error(`Quote ${payable} drifted from order total ${total}`));
    }

    if (event.kind === 'DINE_IN' && tableId) {
      const settleStart = process.hrtime.bigint();
      const half = Math.floor((total / 2) * 100) / 100;
      await orders.settleOrder(
        order.id,
        {
          payments: [
            { method: 'CARD', amount: money(half) },
            { method: 'CASH', amount: money(total - half) },
          ],
        },
        fixtures.actor,
        { ...context, terminalId: 'SIM-T1' },
      );
      timings.settle.push(Number(process.hrtime.bigint() - settleStart) / 1e6);
      counters.settled += 1;
      await prisma.diningTable.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } });
      return;
    }

    if (event.kind === 'DELIVERY' && !isCod && fixtures.drivers.length > 0 && rand() < 0.5) {
      try {
        const driverId = pick(fixtures.drivers);
        const deliveryActor = { id: fixtures.actor.id, role: 'ADMIN' as const, branchId: fixtures.branchId };
        await delivery.assignDriver(order.id, { driverId }, deliveryActor);
        await delivery.updateDeliveryStatus(order.id, { status: 'PICKED_UP' }, deliveryActor);
        await delivery.updateDeliveryStatus(order.id, { status: 'DELIVERED' }, deliveryActor);
        counters.delivered += 1;
      } catch (error) {
        noteError('delivery', error);
      }
    }

    const outcome = rand();
    if (outcome < 0.025 && event.kind === 'TAKEAWAY') {
      try {
        await orders.cancelOrder(order.id, 'Simulated customer cancellation', fixtures.actor, context);
        counters.cancelled += 1;
      } catch (error) {
        noteError('cancel', error);
      }
    } else if (outcome < 0.05 && !isCod) {
      try {
        await orders.refundOrder(
          order.id,
          {
            amount: money(total),
            method: method as 'CASH' | 'CARD' | 'WALLET',
            reason: 'Simulated refund',
          },
          fixtures.actor,
          context,
        );
        counters.refunded += 1;
      } catch (error) {
        noteError('refund', error);
      }
    } else if (outcome < 0.35 && !isCod) {
      try {
        await orders.updateOrderStatus(order.id, 'preparing', fixtures.actor);
        await orders.updateOrderStatus(order.id, 'ready', fixtures.actor);
        await orders.updateOrderStatus(order.id, 'completed', fixtures.actor);
        counters.completed += 1;
      } catch (error) {
        noteError('status', error);
      }
    }
  } catch (error) {
    counters.failed += 1;
    noteError('create', error);
  } finally {
    timings.total.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
}

async function recordMapping(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS audit_sim_orders (order_id text PRIMARY KEY, run_tag text NOT NULL, sim_day int NOT NULL, created_at timestamptz NOT NULL)',
  );
  for (let start = 0; start < createdIds.length; start += 500) {
    const chunk = createdIds.slice(start, start + 500);
    const values = chunk.map(
      (row) =>
        Prisma.sql`(${row.id}::text, ${RUN_TAG}::text, ${row.dayIndex}::int, ${row.timestamp.toISOString()}::timestamptz)`,
    );
    await prisma.$executeRaw`INSERT INTO audit_sim_orders (order_id, run_tag, sim_day, created_at) VALUES ${Prisma.join(values)} ON CONFLICT (order_id) DO NOTHING`;
  }
}

async function backdate(): Promise<void> {
  const byDay = new Map<number, typeof createdIds>();
  for (const row of createdIds) {
    const bucket = byDay.get(row.dayIndex);
    if (bucket) bucket.push(row);
    else byDay.set(row.dayIndex, [row]);
  }
  for (const ids of byDay.values()) {
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const values = chunk.map((row) => Prisma.sql`(${row.id}::text, ${row.timestamp.toISOString()}::timestamptz)`);
      await prisma.$executeRaw`
        UPDATE orders AS o
        SET "createdAt" = v.ts,
            "updatedAt" = v.ts,
            "settledAt" = CASE WHEN o."settledAt" IS NULL THEN NULL ELSE v.ts END,
            "completedAt" = CASE WHEN o."completedAt" IS NULL THEN NULL ELSE v.ts END,
            "dispatchedAt" = CASE WHEN o."dispatchedAt" IS NULL THEN NULL ELSE v.ts END,
            "deliveredAt" = CASE WHEN o."deliveredAt" IS NULL THEN NULL ELSE v.ts END
        FROM (VALUES ${Prisma.join(values)}) AS v(id, ts)
        WHERE o.id = v.id`;
      const idList = Prisma.join(chunk.map((row) => Prisma.sql`${row.id}::text`));
      await prisma.$executeRaw`UPDATE payments SET "createdAt" = o."createdAt" FROM orders o WHERE payments."orderId" = o.id AND o.id IN (${idList})`;
      await prisma.$executeRaw`UPDATE refunds SET "createdAt" = o."createdAt" FROM orders o WHERE refunds."orderId" = o.id AND o.id IN (${idList})`;
      await prisma.$executeRaw`UPDATE invoices SET "issuedAt" = o."createdAt" FROM orders o WHERE invoices."orderId" = o.id AND o.id IN (${idList})`;
      await prisma.$executeRaw`UPDATE credit_notes SET "issuedAt" = o."createdAt" FROM orders o WHERE credit_notes."orderId" = o.id AND o.id IN (${idList})`;
      await prisma.$executeRaw`UPDATE inventory_movements SET "createdAt" = o."createdAt" FROM orders o WHERE inventory_movements."orderId" = o.id AND o.id IN (${idList})`;
      await prisma.$executeRaw`UPDATE audit_logs SET "createdAt" = o."createdAt" FROM orders o WHERE audit_logs."entityId" = o.id AND audit_logs."entityType" = 'Order' AND o.id IN (${idList})`;
    }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function databaseBytes(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ bytes: bigint }>>(
    'SELECT pg_database_size(current_database())::bigint AS bytes',
  );
  return Number(rows[0]!.bytes);
}

async function reconcile(): Promise<Record<string, unknown>> {
  const tag = Prisma.sql`${RUN_TAG}::text`;
  const sim = Prisma.sql`(SELECT order_id FROM audit_sim_orders WHERE run_tag = ${tag})`;
  const rows = async (sql: Prisma.Sql) => prisma.$queryRaw<Array<Record<string, unknown>>>(sql);

  const [totals] = await rows(Prisma.sql`
    SELECT count(*)::int AS orders,
           coalesce(sum(o.total), 0)::text AS revenue,
           coalesce(sum(o.tax), 0)::text AS tax,
           coalesce(sum(o.discount), 0)::text AS discounts,
           coalesce(sum(o."deliveryFee"), 0)::text AS delivery_fees
    FROM orders o WHERE o.id IN ${sim}`);
  const [math] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM orders o
    WHERE o.id IN ${sim}
      AND abs((o.subtotal - o.discount + o.tax + o."deliveryFee") - o.total) > 0.005`);
  const [paymentMismatch] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM orders o
    WHERE o.id IN ${sim}
      AND abs((o."amountPaid" - o."changeDue") - coalesce((SELECT sum(p.amount) FROM payments p WHERE p."orderId" = o.id), 0)) > 0.005`);
  const [refundMismatch] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM orders o
    WHERE o.id IN ${sim} AND o."paymentStatus" IN ('REFUNDED', 'PARTIALLY_REFUNDED')
      AND (SELECT coalesce(sum(r.amount), 0) FROM refunds r WHERE r."orderId" = o.id) < 0.005`);
  const [overRefund] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM orders o
    WHERE o.id IN ${sim}
      AND (SELECT coalesce(sum(r.amount), 0) FROM refunds r WHERE r."orderId" = o.id)
        > (SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p."orderId" = o.id) + 0.005`);
  const [stockMismatch] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM orders o
    WHERE o.id IN ${sim} AND o.status = 'CANCELLED'
      AND EXISTS (
        SELECT 1 FROM (
          SELECT m."ingredientId",
                 sum(CASE WHEN m.type = 'SALE_DEDUCTION' THEN m.quantity ELSE 0 END) AS sold,
                 sum(CASE WHEN m.type = 'CANCELLATION_RETURN' THEN m.quantity ELSE 0 END) AS returned
          FROM inventory_movements m WHERE m."orderId" = o.id GROUP BY m."ingredientId"
        ) x WHERE abs(x.sold + x.returned) > 0.001)`);
  const [doubleRestore] = await rows(Prisma.sql`
    SELECT count(*)::int AS violations FROM (
      SELECT m."orderId", m."ingredientId",
             sum(CASE WHEN m.type = 'SALE_DEDUCTION' THEN m.quantity ELSE 0 END) AS sold,
             sum(CASE WHEN m.type = 'CANCELLATION_RETURN' THEN m.quantity ELSE 0 END) AS returned
      FROM inventory_movements m WHERE m."orderId" IN ${sim} GROUP BY 1, 2
    ) x WHERE x.returned > abs(x.sold) + 0.001`);
  const [orphans] = await rows(Prisma.sql`
    SELECT
      (SELECT count(*) FROM orders o WHERE o.id IN ${sim} AND (NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = o."branchId") OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o."cashierId")))::int AS orders,
      (SELECT count(*) FROM payments p WHERE p."orderId" IN ${sim} AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = p."orderId"))::int AS payments,
      (SELECT count(*) FROM order_items i WHERE i."orderId" IN ${sim} AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = i."orderId"))::int AS items,
      (SELECT count(*) FROM invoices v WHERE v."orderId" IN ${sim} AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = v."orderId"))::int AS invoices`);
  const [duplicates] = await rows(Prisma.sql`
    SELECT
      (SELECT count(*) FROM (SELECT "orderNumber" FROM orders GROUP BY 1 HAVING count(*) > 1) d)::int AS order_numbers,
      (SELECT count(*) FROM (SELECT "invoiceNumber" FROM invoices GROUP BY 1 HAVING count(*) > 1) d)::int AS invoice_numbers`);
  const byStatus = await rows(Prisma.sql`
    SELECT o.status::text AS status, count(*)::int AS count FROM orders o WHERE o.id IN ${sim} GROUP BY 1 ORDER BY 2 DESC`);
  const byMethod = await rows(Prisma.sql`
    SELECT o."paymentMethod"::text AS method, count(*)::int AS count, sum(o.total)::text AS revenue
    FROM orders o WHERE o.id IN ${sim} GROUP BY 1 ORDER BY 3 DESC`);
  const simDays = await rows(Prisma.sql`
    SELECT sim_day, count(*)::int AS orders FROM audit_sim_orders WHERE run_tag = ${tag} GROUP BY 1 ORDER BY 1`);

  return { totals, math, paymentMismatch, refundMismatch, overRefund, stockMismatch, doubleRestore, orphans, duplicates, byStatus, byMethod, simDays };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const wallStart = Date.now();
  console.log(`Simulation ${RUN_TAG}: ${TOTAL_ORDERS} orders on ${DAYS} sampled days of ${PER_DAY} (${HORIZON_DAYS}-day horizon, ${RECENT ? 'recent month' : 'even spread'}), concurrency ${CONCURRENCY}`);

  await prisma.diningTable.updateMany({ data: { status: 'AVAILABLE' } });
  const fixtures = await loadFixtures();
  if (fixtures.items.length === 0) throw new Error('No menu items with recipes found');
  console.log(`Fixtures: ${fixtures.items.length} items, ${fixtures.toppings.length} toppings, ${fixtures.tables.length} tables, ${fixtures.drivers.length} drivers, ${fixtures.zones.length} zones`);

  const beforeBytes = await databaseBytes();
  const disk = statfsSync(ROOT);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);

  const events = buildEvents();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, (_, workerIndex) =>
    (async () => {
      const tableId = fixtures.tables.length > 0 ? fixtures.tables[workerIndex % fixtures.tables.length]! : null;
      while (true) {
        const event = events[cursor];
        cursor += 1;
        if (!event) break;
        await processEvent(event, fixtures, tableId);
        if (counters.created % 250 === 0 && counters.created > 0) {
          process.stdout.write(`  ${counters.created}/${TOTAL_ORDERS} orders\r`);
        }
      }
    })(),
  );
  await Promise.all(workers);
  process.stdout.write('\n');

  console.log('Recording and backdating timestamps…');
  await recordMapping();
  await backdate();

  const afterBytes = await databaseBytes();
  const durationSec = (Date.now() - wallStart) / 1000;
  const bytesPerOrder = counters.created > 0 ? (afterBytes - beforeBytes) / counters.created : 0;
  const projectedBytes = bytesPerOrder * 1_825_000;
  const reconciliation = await reconcile();

  const report = {
    runTag: RUN_TAG,
    startedAt: startedAt.toISOString(),
    durationSeconds: Math.round(durationSec),
    configuration: { days: DAYS, perDay: PER_DAY, concurrency: CONCURRENCY, totalOrders: TOTAL_ORDERS, horizonDays: HORIZON_DAYS, recent: RECENT },
    counters,
    stepErrors,
    latencyMs: {
      create: { p50: percentile(timings.create, 50), p95: percentile(timings.create, 95), p99: percentile(timings.create, 99), avg: timings.create.reduce((a, b) => a + b, 0) / Math.max(1, timings.create.length) },
      settle: { p50: percentile(timings.settle, 50), p95: percentile(timings.settle, 95), count: timings.settle.length },
      event: { p50: percentile(timings.total, 50), p95: percentile(timings.total, 95), p99: percentile(timings.total, 99) },
      throughputOrdersPerSecond: counters.created / durationSec,
    },
    storage: {
      databaseBytesBefore: beforeBytes,
      databaseBytesAfter: afterBytes,
      bytesPerOrder: Math.round(bytesPerOrder),
      freeDiskBytes: freeBytes,
      projectedFiveYearBytes: Math.round(projectedBytes),
      fiveYearTargetOrders: 1_825_000,
      fullTargetFeasible: projectedBytes < freeBytes * 0.6,
      note:
        projectedBytes < freeBytes * 0.6
          ? 'Projection fits in available disk with headroom'
          : 'Projected five-year volume exceeds safe free-disk headroom; full target NOT TESTED',
    },
    reconciliation,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'simulation.json'), JSON.stringify(report, null, 2));
  console.log(`\nCreated ${counters.created}/${TOTAL_ORDERS} orders in ${Math.round(durationSec)}s (${(counters.created / durationSec).toFixed(1)}/s)`);
  console.log(`Errors: ${JSON.stringify(stepErrors)} | cancelled ${counters.cancelled}, refunded ${counters.refunded}, completed ${counters.completed}, delivered ${counters.delivered}`);
  console.log(`DB grew ${((afterBytes - beforeBytes) / 1024 / 1024).toFixed(1)} MB (${Math.round(bytesPerOrder)} B/order); projected 5-year ${(projectedBytes / 1024 / 1024 / 1024).toFixed(1)} GB vs ${(freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free`);
  console.log('Reconciliation:', JSON.stringify({
    totals: reconciliation.totals,
    math: reconciliation.math,
    paymentMismatch: reconciliation.paymentMismatch,
    overRefund: reconciliation.overRefund,
    stockMismatch: reconciliation.stockMismatch,
    doubleRestore: reconciliation.doubleRestore,
    orphans: reconciliation.orphans,
    duplicates: reconciliation.duplicates,
  }));
  console.log('Report written to docs/audit/results/simulation.json');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('SIMULATION FAILED', error);
  process.exitCode = 1;
});
