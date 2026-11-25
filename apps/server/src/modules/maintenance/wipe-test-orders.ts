/**
 * Pre-handover cleanup: removes test orders and everything that only exists
 * because of them (payments, invoices, refunds, shifts, Z-reports, driver
 * settlements), and puts back the stock those orders consumed.
 *
 * Kept untouched: users, branches, settings (tax rate), menu, recipes,
 * toppings, delivery zones, printers, ingredients and their stock levels
 * (other than reversing test-order movements), purchasing, HR, expenses and
 * the audit log. Customers are kept unless `includeCustomers` is set.
 *
 * Everything runs in one transaction: either all of it happens or none.
 * In dry-run mode the counts are read and nothing is written.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export interface WipeOptions {
  apply: boolean;
  includeCustomers: boolean;
  log: (line: string) => void;
}

/** Tables this cleanup empties, in foreign-key-safe order. */
export const WIPE_ORDER = [
  // RESTRICT on orders / shifts, so these go first.
  { table: 'credit_notes', label: 'Credit notes' },
  { table: 'refunds', label: 'Refunds' },
  { table: 'z_reports', label: 'Z-reports' },
  // Cascades to order_items, order_item_toppings, payments, invoices, online_payments.
  { table: 'orders', label: 'Orders' },
  { table: 'cash_movements', label: 'Cash drawer movements' },
  { table: 'shifts', label: 'Shifts' },
  { table: 'driver_settlements', label: 'Driver settlements' },
  // Derived from stock levels; rebuilt on the next stock change.
  { table: 'stock_alerts', label: 'Stock alerts' },
] as const;

/** Removed by cascade when orders are deleted; counted for the report. */
const CASCADED = [
  { table: 'order_items', label: 'Order lines' },
  { table: 'order_item_toppings', label: 'Order line toppings' },
  { table: 'payments', label: 'Payments' },
  { table: 'invoices', label: 'Invoices' },
  { table: 'online_payments', label: 'Online payments' },
] as const;

/** Shown so the operator can see what is deliberately kept. */
const KEPT = [
  'users',
  'branches',
  'restaurant_settings',
  'categories',
  'menu_items',
  'menu_item_sizes',
  'recipes',
  'toppings',
  'delivery_zones',
  'printers',
  'ingredients',
  'ingredient_stocks',
  'dining_tables',
  'purchase_orders',
  'expenses',
  'employees',
  'audit_logs',
] as const;

type Tx = Prisma.TransactionClient;

async function count(tx: Tx, table: string, where = ''): Promise<number> {
  // Table names come from the constant lists above, never from input.
  const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM "${table}" ${where}`,
  );
  return Number(rows[0]?.n ?? 0);
}

export interface WipeSummary {
  deleted: Record<string, number>;
  orderStockMovements: number;
  stockRowsRestored: number;
  tablesFreed: number;
  customers: number;
}

export async function wipeTestOrders(prisma: PrismaClient, options: WipeOptions): Promise<WipeSummary> {
  const { apply, includeCustomers, log } = options;
  return prisma.$transaction(
    async (tx) => {
      const deleted: Record<string, number> = {};
      log('Will delete (foreign-key-safe order):');
      for (const { table, label } of WIPE_ORDER) {
        deleted[table] = await count(tx, table);
        log(`  ${label.padEnd(26)} ${String(deleted[table]).padStart(7)}  (${table})`);
      }
      log('Removed with orders (cascade):');
      for (const { table, label } of CASCADED) {
        deleted[table] = await count(tx, table);
        log(`  ${label.padEnd(26)} ${String(deleted[table]).padStart(7)}  (${table})`);
      }

      const orderStockMovements = await count(tx, 'inventory_movements', 'WHERE "orderId" IS NOT NULL');
      const otherMovements = await count(tx, 'inventory_movements', 'WHERE "orderId" IS NULL');
      const restore = await tx.$queryRawUnsafe<
        Array<{ ingredient: string; branch: string; current: string; restored: string }>
      >(`
        SELECT i.name AS ingredient, b.code AS branch,
               s."currentStock"::text AS current,
               (s."currentStock" - m.net)::text AS restored
        FROM (
          SELECT "ingredientId", "branchId", SUM(quantity) AS net
          FROM inventory_movements
          WHERE "orderId" IS NOT NULL AND "branchId" IS NOT NULL
          GROUP BY 1, 2
        ) m
        JOIN ingredient_stocks s ON s."ingredientId" = m."ingredientId" AND s."branchId" = m."branchId"
        JOIN ingredients i ON i.id = m."ingredientId"
        JOIN branches b ON b.id = m."branchId"
        WHERE m.net <> 0
        ORDER BY i.name`);
      log(`Stock: ${orderStockMovements} order stock movements will be reversed and removed;`);
      log(`       ${otherMovements} other movements (purchases, adjustments, stocktakes) are kept.`);
      for (const row of restore.slice(0, 15)) {
        log(`  ${row.ingredient} @${row.branch}: ${row.current} → ${row.restored}`);
      }
      if (restore.length > 15) log(`  … and ${restore.length - 15} more ingredient rows`);

      const tablesFreed = await count(tx, 'dining_tables', `WHERE status <> 'AVAILABLE'`);
      log(`Dining tables set back to AVAILABLE: ${tablesFreed}`);

      const customers = await count(tx, 'customers');
      log(
        includeCustomers
          ? `Customers (and their addresses/sessions) deleted: ${customers}`
          : `Customers kept: ${customers} (add --include-customers to remove test customers too)`,
      );

      log('Kept untouched:');
      const kept: string[] = [];
      for (const table of KEPT) kept.push(`${table}=${await count(tx, table)}`);
      log(`  ${kept.join(', ')}`);

      if (!apply) {
        log('\nDRY RUN — nothing was deleted.');
        return { deleted, orderStockMovements, stockRowsRestored: restore.length, tablesFreed, customers };
      }

      // 1. Put back the stock the test orders consumed, then drop those movements.
      await tx.$executeRawUnsafe(`
        UPDATE ingredient_stocks s
        SET "currentStock" = s."currentStock" - m.net, "updatedAt" = NOW()
        FROM (
          SELECT "ingredientId", "branchId", SUM(quantity) AS net
          FROM inventory_movements
          WHERE "orderId" IS NOT NULL AND "branchId" IS NOT NULL
          GROUP BY 1, 2
        ) m
        WHERE s."ingredientId" = m."ingredientId" AND s."branchId" = m."branchId" AND m.net <> 0`);
      await tx.$executeRawUnsafe(`DELETE FROM inventory_movements WHERE "orderId" IS NOT NULL`);

      // 2. Transactional data, children before parents.
      for (const { table } of WIPE_ORDER) await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);

      // 3. Free tables that were held by test tabs.
      await tx.$executeRawUnsafe(
        `UPDATE dining_tables SET status = 'AVAILABLE', "updatedAt" = NOW() WHERE status <> 'AVAILABLE'`,
      );

      if (includeCustomers) await tx.$executeRawUnsafe('DELETE FROM customers');

      await tx.auditLog.create({
        data: {
          action: 'maintenance.testOrdersWiped',
          entityType: 'System',
          after: { deleted, orderStockMovements, tablesFreed, includeCustomers, customers },
        },
      });

      const left = await count(tx, 'orders');
      if (left !== 0) throw new Error(`Cleanup incomplete: ${left} orders remain`);
      log('\nAPPLIED — test orders removed and stock restored.');
      return { deleted, orderStockMovements, stockRowsRestored: restore.length, tablesFreed, customers };
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
}
