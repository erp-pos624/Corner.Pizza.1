import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { OrderAddItemsInput, OrderCreateInput, OrderRefundInput } from '@posshope/shared';
import { prisma } from '../src/prisma.js';
import * as orders from '../src/modules/orders/orders.service.js';

/**
 * Regression coverage for the two order-flow races found in the audit:
 * parallel refunds of one order, and parallel item additions to one open tab.
 * These run against the real test database because only real transactions can
 * reproduce the interleaving.
 */
describe('orders concurrency regression', () => {
  const tag = randomUUID().slice(0, 8);
  let branchId: string;
  let menuItemId: string;
  let multiItemId: string;
  let ingredientId: string;
  let secondIngredientId: string;
  let thirdIngredientId: string;
  let tableId: string;
  let actor: { id: string; role: 'ADMIN'; branchId: null };
  const recipeUnits = 0.1;

  beforeAll(async () => {
    const branch = await prisma.branch.create({
      data: { code: `TST-${tag}`, name: `Regression Branch ${tag}` },
    });
    branchId = branch.id;

    const category = await prisma.category.create({ data: { name: `Regression ${tag}` } });
    const ingredient = await prisma.ingredient.create({
      data: {
        sku: `ING-${tag}`,
        name: `Regression Dough ${tag}`,
        unit: 'KG',
        costPerUnit: '2.00',
        averageCost: '2.00',
      },
    });
    ingredientId = ingredient.id;
    const secondIngredient = await prisma.ingredient.create({
      data: { sku: `ING2-${tag}`, name: `Regression Cheese ${tag}`, unit: 'KG', costPerUnit: '3.00' },
    });
    secondIngredientId = secondIngredient.id;
    const thirdIngredient = await prisma.ingredient.create({
      data: { sku: `ING3-${tag}`, name: `Regression Sauce ${tag}`, unit: 'KG', costPerUnit: '1.50' },
    });
    thirdIngredientId = thirdIngredient.id;
    await prisma.ingredientStock.createMany({
      data: [ingredientId, secondIngredientId, thirdIngredientId].map((id) => ({
        ingredientId: id,
        branchId,
        currentStock: 50,
      })),
    });

    const menuItem = await prisma.menuItem.create({
      data: {
        sku: `TST-${tag}`,
        name: `Regression Pizza ${tag}`,
        categoryId: category.id,
        basePrice: '100.00',
        costPrice: '30.00',
      },
    });
    menuItemId = menuItem.id;
    await prisma.recipe.create({
      data: {
        menuItemId,
        isActive: true,
        items: { create: [{ ingredientId, quantity: recipeUnits }] },
      },
    });

    const multiItem = await prisma.menuItem.create({
      data: {
        sku: `TST2-${tag}`,
        name: `Regression Combo ${tag}`,
        categoryId: category.id,
        basePrice: '80.00',
        costPrice: '20.00',
      },
    });
    multiItemId = multiItem.id;
    await prisma.recipe.create({
      data: {
        menuItemId: multiItemId,
        isActive: true,
        // Deliberately unsorted relative to ingredient ids so lock-order bugs show.
        items: {
          create: [
            { ingredientId: thirdIngredientId, quantity: 0.1 },
            { ingredientId, quantity: 0.1 },
            { ingredientId: secondIngredientId, quantity: 0.1 },
          ],
        },
      },
    });

    const table = await prisma.diningTable.create({
      data: { branchId, name: `T-${tag}` },
    });
    tableId = table.id;

    const cashier = await prisma.user.create({
      data: {
        username: `regression_${tag}`,
        fullName: 'Regression Cashier',
        passwordHash: 'not-used',
        role: 'CASHIER',
        branchId,
      },
    });
    actor = { id: cashier.id, role: 'ADMIN', branchId: null };
  });

  function paidOrderInput(): OrderCreateInput {
    return {
      type: 'TAKEAWAY',
      payLater: false,
      isCod: false,
      items: [{ menuItemId, quantity: 1, toppingIds: [] }],
      payments: [{ method: 'CASH', amount: '1000.00' }],
    };
  }

  async function stockLevel(): Promise<number> {
    const row = await prisma.ingredientStock.findUniqueOrThrow({
      where: { ingredientId_branchId: { ingredientId, branchId } },
      select: { currentStock: true },
    });
    return Number(row.currentStock);
  }

  it('serializes concurrent refunds and restores inventory exactly once', async () => {
    const order = await orders.createOrder(paidOrderInput(), actor, { branchId, terminalId: 'TST-TERM' });
    const afterSale = await stockLevel();
    expect(afterSale).toBeCloseTo(50 - recipeUnits, 3);

    const refund: OrderRefundInput = {
      amount: order.total,
      method: 'CASH',
      reason: 'Concurrent refund regression test',
    };
    const results = await Promise.allSettled([
      orders.refundOrder(order.id, refund, actor),
      orders.refundOrder(order.id, refund, actor),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

    const [refundCount, stored, afterRefund] = await Promise.all([
      prisma.refund.count({ where: { orderId: order.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      stockLevel(),
    ]);
    expect(refundCount).toBe(1);
    expect(stored.paymentStatus).toBe('REFUNDED');
    expect(stored.inventoryRestored).toBe(true);
    expect(afterRefund).toBeCloseTo(50, 3);
  });

  it('cancels multi-ingredient orders concurrently without deadlocks', async () => {
    const cart = [
      { menuItemId: multiItemId, quantity: 1, toppingIds: [] },
      { menuItemId, quantity: 1, toppingIds: [] },
    ];
    const created = [];
    for (let index = 0; index < 8; index += 1) {
      created.push(
        await orders.createOrder(
          {
            type: 'TAKEAWAY',
            payLater: false,
            isCod: false,
            items: cart,
            payments: [{ method: 'CASH', amount: '1000.00' }],
          },
          actor,
          { branchId, terminalId: 'TST-TERM' },
        ),
      );
    }

    const results = await Promise.allSettled(
      created.map((order) =>
        orders.cancelOrder(order.id, 'Concurrent cancellation regression', actor, {
          branchId,
          terminalId: 'TST-TERM',
        }),
      ),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected.map((result) => String((result as PromiseRejectedResult).reason))).toEqual([]);

    const stocks = await prisma.ingredientStock.findMany({
      where: { branchId, ingredientId: { in: [ingredientId, secondIngredientId, thirdIngredientId] } },
      select: { ingredientId: true, currentStock: true },
    });
    for (const row of stocks) expect(Number(row.currentStock)).toBeCloseTo(50, 3);
  });

  it('keeps every parallel tab addition in the totals and stock plan', async () => {
    const tab = await orders.createOrder(
      {
        type: 'DINE_IN',
        tableId,
        payLater: true,
        isCod: false,
        items: [{ menuItemId, quantity: 1, toppingIds: [] }],
        payments: [],
      },
      actor,
      { branchId, terminalId: 'TST-TERM' },
    );
    const addition: OrderAddItemsInput = {
      items: [{ menuItemId, quantity: 1, toppingIds: [] }],
    };

    const results = await Promise.all([
      orders.addOrderItems(tab.id, addition, actor),
      orders.addOrderItems(tab.id, addition, actor),
      orders.addOrderItems(tab.id, addition, actor),
    ]);
    expect(results).toHaveLength(3);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: tab.id },
      include: { items: true },
    });
    expect(stored.items).toHaveLength(4);
    expect(Number(stored.subtotal)).toBe(400);
    expect(Number(stored.tax)).toBe(56);
    expect(Number(stored.total)).toBe(456);

    const plan = stored.stockPlan as Array<{ ingredientId: string; quantity: number }> | null;
    const planned = (plan ?? [])
      .filter((entry) => entry.ingredientId === ingredientId)
      .reduce((sum, entry) => sum + Number(entry.quantity), 0);
    expect(planned).toBeCloseTo(4 * recipeUnits, 6);
  });
});
