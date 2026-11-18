import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma.js';
import { listKitchenOrders } from '../src/modules/kitchen/kitchen.service.js';

/**
 * Regression coverage for the audit finding that the kitchen board returned
 * every historical open ticket across every branch. The queue is now scoped to
 * the actor's branch, to tickets created today, and to completions today.
 */
describe('kitchen queue scoping', () => {
  const tag = randomUUID().slice(0, 8);
  let branchAId: string;
  let branchBId: string;
  let cashierAId: string;
  let cashierBId: string;
  let todayAId: string;
  let yesterdayAId: string;
  let completedTodayAId: string;
  let otherBranchId: string;
  let unpaidOnlineId: string;

  const DAY = 86_400_000;

  async function createOrder(
    branchId: string,
    cashierId: string,
    suffix: string,
    data: {
      status: 'PENDING' | 'COMPLETED';
      createdAt: Date;
      completedAt?: Date;
      channel?: 'POS' | 'ONLINE';
      paymentStatus?: 'PAID' | 'PENDING_PAYMENT';
    },
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `TST-${tag}-${suffix}`,
        type: 'TAKEAWAY',
        channel: data.channel ?? 'POS',
        status: data.status,
        branchId,
        cashierId,
        subtotal: '100.00',
        total: '100.00',
        paymentMethod: 'CASH',
        paymentStatus: data.paymentStatus ?? 'PAID',
        createdAt: data.createdAt,
        ...(data.completedAt ? { completedAt: data.completedAt } : {}),
      },
    });
    return order.id;
  }

  beforeAll(async () => {
    const branchA = await prisma.branch.create({
      data: { code: `KQA-${tag}`, name: `Kitchen A ${tag}` },
    });
    const branchB = await prisma.branch.create({
      data: { code: `KQB-${tag}`, name: `Kitchen B ${tag}` },
    });
    branchAId = branchA.id;
    branchBId = branchB.id;
    const cashierA = await prisma.user.create({
      data: {
        username: `kqa_${tag}`,
        fullName: 'Kitchen Cashier A',
        passwordHash: 'not-used',
        role: 'CASHIER',
        branchId: branchAId,
      },
    });
    const cashierB = await prisma.user.create({
      data: {
        username: `kqb_${tag}`,
        fullName: 'Kitchen Cashier B',
        passwordHash: 'not-used',
        role: 'CASHIER',
        branchId: branchBId,
      },
    });
    cashierAId = cashierA.id;
    cashierBId = cashierB.id;

    const now = new Date();
    todayAId = await createOrder(branchAId, cashierAId, 'today', {
      status: 'PENDING',
      createdAt: now,
    });
    yesterdayAId = await createOrder(branchAId, cashierAId, 'yesterday', {
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 2 * DAY),
    });
    completedTodayAId = await createOrder(branchAId, cashierAId, 'completed', {
      status: 'COMPLETED',
      createdAt: new Date(now.getTime() - 2 * DAY),
      completedAt: now,
    });
    otherBranchId = await createOrder(branchBId, cashierBId, 'other', {
      status: 'PENDING',
      createdAt: now,
    });
    unpaidOnlineId = await createOrder(branchAId, cashierAId, 'unpaid', {
      status: 'PENDING',
      createdAt: now,
      channel: 'ONLINE',
      paymentStatus: 'PENDING_PAYMENT',
    });
  });

  it('shows branch staff only today’s tickets for their branch', async () => {
    const queue = await listKitchenOrders({ id: cashierAId, branchId: branchAId });
    const ids = queue.orders.map((order) => order.id);
    expect(ids).toContain(todayAId);
    expect(ids).toContain(completedTodayAId);
    expect(ids).not.toContain(yesterdayAId);
    expect(ids).not.toContain(otherBranchId);
    expect(ids).not.toContain(unpaidOnlineId);
  });

  it('does not leak another branch’s queue to a second branch', async () => {
    const queue = await listKitchenOrders({ id: cashierBId, branchId: branchBId });
    const ids = queue.orders.map((order) => order.id);
    expect(ids).toContain(otherBranchId);
    expect(ids).not.toContain(todayAId);
  });

  it('keeps the unscoped admin view, still bounded to today', async () => {
    const queue = await listKitchenOrders({ id: cashierAId, branchId: null });
    const ids = queue.orders.map((order) => order.id);
    expect(ids).toContain(todayAId);
    expect(ids).toContain(otherBranchId);
    expect(ids).not.toContain(yesterdayAId);
  });
});
