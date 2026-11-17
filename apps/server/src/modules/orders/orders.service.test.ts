import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCreateInput } from '@posshope/shared';

const mocks = vi.hoisted(() => ({
  menuItemFindMany: vi.fn(),
  toppingFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
  invoiceFindUnique: vi.fn(),
  branchFindUnique: vi.fn(),
  transaction: vi.fn(),
  getSettings: vi.fn(),
  recordAudit: vi.fn(),
  findOpenShift: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    menuItem: { findMany: mocks.menuItemFindMany },
    topping: { findMany: mocks.toppingFindMany },
    branch: { findUnique: mocks.branchFindUnique },
    customer: { findUnique: vi.fn() },
    discount: { findUnique: vi.fn() },
    diningTable: { findUnique: vi.fn() },
    order: { findUnique: mocks.orderFindUnique },
    invoice: { findUnique: mocks.invoiceFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../../lib/branches.js', () => ({ findOpenShift: mocks.findOpenShift }));
vi.mock('../../lib/settings.js', () => ({ getSettings: mocks.getSettings }));
vi.mock('../../lib/audit.js', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('../../lib/mappers.js', () => ({
  toOrderDto: (order: { id: string }) => ({ id: order.id }),
  orderInclude: {},
  toDbStatus: (status: string) => status,
  toApiStatus: (status: string) => status,
}));

import { createOrder } from './orders.service.js';

const input: OrderCreateInput = {
  type: 'TAKEAWAY',
  payLater: false,
  isCod: false,
  items: [{ menuItemId: 'menu-1', quantity: 2, toppingIds: [] }],
  payments: [{ method: 'CASH', amount: '100.00' }],
};

const actor = { id: 'cashier-1', role: 'CASHIER' as const };

function menuItem() {
  return {
    id: 'menu-1',
    name: 'Margherita',
    nameAr: null,
    imageUrl: null,
    isAvailable: true,
    hasSizes: false,
    basePrice: '50.00',
    sizes: [],
    recipes: [
      {
        id: 'recipe-1',
        menuItemId: 'menu-1',
        sizeId: null,
        isActive: true,
        items: [
          {
            ingredientId: 'ing-1',
            quantity: 0.5,
            ingredient: { averageCost: '2.00', costPerUnit: '2.00' },
          },
        ],
      },
    ],
  };
}

function successfulTx() {
  const created = {
    id: 'order-1',
    orderNumber: 'ORD-1',
    createdAt: new Date('2026-11-12T12:00:00Z'),
    total: { toString: () => '100.00' },
    type: 'TAKEAWAY',
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
  };
  return {
    ingredientStock: {
      findMany: vi.fn().mockResolvedValue([{ ingredientId: 'ing-1', currentStock: '5.000' }]),
      findUnique: vi.fn().mockResolvedValue({ currentStock: '4.000', minStock: '1.000' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ingredient: {
      findMany: vi.fn().mockResolvedValue([{ id: 'ing-1', name: 'Flour', unit: 'KG' }]),
    },
    stockAlert: {
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    order: {
      create: vi.fn().mockResolvedValue(created),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'order-1' }),
    },
    payment: { createMany: vi.fn() },
    invoice: { create: vi.fn() },
    inventoryMovement: { createMany: vi.fn() },
  };
}

describe('createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.branchFindUnique.mockResolvedValue({ id: 'branch-main', isActive: true });
    mocks.findOpenShift.mockResolvedValue(null);
    mocks.getSettings.mockResolvedValue({
      taxRate: '0.00',
      deliveryFee: '25.00',
      maxCashierDiscountPct: '20.00',
      stockPolicy: 'BLOCK',
    } as never);
    mocks.toppingFindMany.mockResolvedValue([]);
    mocks.orderFindUnique.mockResolvedValue(null);
    mocks.invoiceFindUnique.mockResolvedValue(null);
  });

  it('rejects the sale without touching stock when an ingredient is short', async () => {
    mocks.menuItemFindMany.mockResolvedValue([menuItem()] as never);

    const tx = {
      ingredientStock: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ ingredientId: 'ing-1', currentStock: '0.500' }]),
        updateMany: vi.fn(),
      },
      ingredient: {
        findMany: vi.fn().mockResolvedValue([{ id: 'ing-1', name: 'Flour', unit: 'KG' }]),
      },
      order: { create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-1' }) },
      payment: { createMany: vi.fn() },
      invoice: { create: vi.fn() },
      inventoryMovement: { createMany: vi.fn() },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(createOrder(input, actor)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      statusCode: 409,
      details: {
        shortages: [
          {
            ingredientId: 'ing-1',
            ingredientName: 'Flour',
            unit: 'KG',
            required: '1.000',
            available: '0.500',
          },
        ],
      },
    });
    expect(tx.ingredientStock.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });

  it('returns the original order when the same key is replayed by the same cashier', async () => {
    mocks.orderFindUnique.mockResolvedValue({ id: 'order-existing', cashierId: actor.id });

    const result = await createOrder({ ...input, idempotencyKey: 'checkout-key-0001' }, actor);

    expect(result).toEqual({ id: 'order-existing' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.menuItemFindMany).not.toHaveBeenCalled();
  });

  it('rejects a key already used by a different cashier', async () => {
    mocks.orderFindUnique.mockResolvedValue({ id: 'order-existing', cashierId: 'cashier-2' });

    await expect(
      createOrder({ ...input, idempotencyKey: 'checkout-key-0001' }, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects a deactivated branch before writing anything', async () => {
    mocks.branchFindUnique.mockResolvedValue({ id: 'branch-main', isActive: false });

    await expect(createOrder(input, actor)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(mocks.menuItemFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns the winner when a concurrent retry loses the unique race', async () => {
    mocks.menuItemFindMany.mockResolvedValue([menuItem()] as never);
    mocks.orderFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'order-raced', cashierId: actor.id });
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['idempotencyKey'] },
      }),
    );

    const result = await createOrder({ ...input, idempotencyKey: 'checkout-key-0002' }, actor);

    expect(result).toEqual({ id: 'order-raced' });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('persists the idempotency key and decrements branch stock on the new order', async () => {
    mocks.menuItemFindMany.mockResolvedValue([menuItem()] as never);
    const tx = successfulTx();
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    const result = await createOrder({ ...input, idempotencyKey: 'checkout-key-0003' }, actor);

    expect(result).toEqual({ id: 'order-1' });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'checkout-key-0003',
          branch: { connect: { id: 'branch-main' } },
        }),
      }),
    );
    expect(tx.ingredientStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ingredientId: 'ing-1', branchId: 'branch-main' }),
      }),
    );
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            ingredientId: 'ing-1',
            branchId: 'branch-main',
            type: 'SALE_DEDUCTION',
            quantity: '-1.000',
          }),
        ]),
      }),
    );
  });
});
