import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { prisma } from '../src/prisma.js';

/**
 * Removes integration fixtures that were written to the development database
 * before tests/setup.ts loaded TEST_DATABASE_URL. Every fixture carries a
 * random per-run tag in its branch/user/item name, so selection is exact.
 * Audit log entries are kept; a JSON backup is written before any deletion.
 *
 * Run manually from apps/server: node --import tsx scripts/cleanup-test-fixtures.ts
 */
const TEST_BRANCH_PREFIXES = ['TST-', 'KQA-', 'KQB-'];
const TEST_USER_PREFIXES = ['regression_', 'kqa_', 'kqb_'];

async function main() {
  const branches = await prisma.branch.findMany({
    where: { OR: TEST_BRANCH_PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) },
    select: { id: true, code: true, name: true },
  });
  const users = await prisma.user.findMany({
    where: { OR: TEST_USER_PREFIXES.map((prefix) => ({ username: { startsWith: prefix } })) },
    select: { id: true, username: true },
  });
  const categories = await prisma.category.findMany({
    where: { name: { startsWith: 'Regression ' } },
    select: { id: true, name: true },
  });
  const ingredients = await prisma.ingredient.findMany({
    where: { name: { startsWith: 'Regression ' } },
    select: { id: true, sku: true, name: true },
  });
  const menuItems = await prisma.menuItem.findMany({
    where: { name: { startsWith: 'Regression ' } },
    select: { id: true, name: true },
  });

  const branchIds = branches.map((row) => row.id);
  const userIds = users.map((row) => row.id);
  const categoryIds = categories.map((row) => row.id);
  const ingredientIds = ingredients.map((row) => row.id);
  const menuItemIds = menuItems.map((row) => row.id);

  const orders = branchIds.length
    ? await prisma.order.findMany({
        where: { branchId: { in: branchIds } },
        select: { id: true, orderNumber: true, branchId: true },
      })
    : [];
  const orderIds = orders.map((row) => row.id);

  const foreignMenuUsage = menuItemIds.length
    ? await prisma.orderItem.count({
        where: { menuItemId: { in: menuItemIds }, orderId: { notIn: orderIds } },
      })
    : 0;
  const foreignCategoryUsage = categoryIds.length
    ? await prisma.menuItem.count({
        where: { categoryId: { in: categoryIds }, id: { notIn: menuItemIds } },
      })
    : 0;
  const foreignCashierUsage = userIds.length
    ? await prisma.order.count({
        where: { cashierId: { in: userIds }, id: { notIn: orderIds } },
      })
    : 0;
  if (foreignMenuUsage || foreignCategoryUsage || foreignCashierUsage) {
    throw new Error(
      `Refusing to delete: foreign references (menu ${foreignMenuUsage}, category ${foreignCategoryUsage}, cashier ${foreignCashierUsage})`,
    );
  }

  const backupPath = resolve(
    process.cwd(),
    `../../docs/dev-test-data-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        branches,
        users,
        categories,
        ingredients,
        menuItems,
        orders,
      },
      null,
      2,
    ),
  );
  console.log('backup written:', backupPath);

  const counts = await prisma.$transaction(async (tx) => {
    return {
      refunds: (await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } })).count,
      orders: (await tx.order.deleteMany({ where: { id: { in: orderIds } } })).count,
      stockMovements: (
        await tx.inventoryMovement.deleteMany({
          where: {
            OR: [
              ...(branchIds.length ? [{ branchId: { in: branchIds } }] : []),
              ...(ingredientIds.length ? [{ ingredientId: { in: ingredientIds } }] : []),
            ],
          },
        })
      ).count,
      menuItems: (await tx.menuItem.deleteMany({ where: { id: { in: menuItemIds } } })).count,
      tables: (await tx.diningTable.deleteMany({ where: { branchId: { in: branchIds } } })).count,
      users: (await tx.user.deleteMany({ where: { id: { in: userIds } } })).count,
      categories: (await tx.category.deleteMany({ where: { id: { in: categoryIds } } })).count,
      ingredients: (await tx.ingredient.deleteMany({ where: { id: { in: ingredientIds } } })).count,
      branches: (await tx.branch.deleteMany({ where: { id: { in: branchIds } } })).count,
    };
  });

  console.log('deleted:', counts);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  console.log('orders today:', await prisma.order.count({ where: { createdAt: { gte: dayStart } } }));
  console.log('remaining branches:', await prisma.branch.count());
  console.log('remaining menu items:', await prisma.menuItem.count());
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('cleanup failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
