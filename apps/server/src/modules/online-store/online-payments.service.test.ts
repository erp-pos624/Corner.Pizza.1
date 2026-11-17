import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  orderFindUniqueOrThrow: vi.fn(),
  orderUpdate: vi.fn(),
  invoiceUpsert: vi.fn(),
  capturedPaymentFindFirst: vi.fn(),
  capturedPaymentCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
  userCreate: vi.fn(),
  transaction: vi.fn(),
  recordAudit: vi.fn(),
  cancelOrder: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  prisma: {
    onlinePayment: {
      findUnique: mocks.paymentFindUnique,
      findUniqueOrThrow: mocks.paymentFindUniqueOrThrow,
      update: mocks.paymentUpdate,
    },
    order: {
      findUniqueOrThrow: mocks.orderFindUniqueOrThrow,
      update: mocks.orderUpdate,
    },
    payment: {
      findFirst: mocks.capturedPaymentFindFirst,
      create: mocks.capturedPaymentCreate,
    },
    invoice: { upsert: mocks.invoiceUpsert },
    user: {
      findUnique: mocks.userFindUnique,
      findUniqueOrThrow: mocks.userFindUniqueOrThrow,
      create: mocks.userCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../../lib/audit.js', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('../../lib/password.js', () => ({ hashPassword: mocks.hashPassword }));
vi.mock('../orders/orders.service.js', () => ({
  cancelOrder: mocks.cancelOrder,
  commitOrderStock: vi.fn(),
}));
vi.mock('./basata.service.js', () => ({ isBasataConfigured: () => false }));

import { ConflictError, NotFoundError } from '../../lib/errors.js';
import {
  applyOnlinePaymentStatus,
  getOnlineStoreActor,
  toOnlinePaymentDto,
} from './online-payments.service.js';

const now = new Date('2026-11-13T10:00:00Z');

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    provider: 'BASATA',
    providerRef: null,
    reference: 'ONL-REF-0001',
    status: 'PENDING',
    amount: new Prisma.Decimal('139.00'),
    currency: 'EGP',
    checkoutUrl: 'https://pay.basata.test/c/1',
    failureReason: null,
    rawPayload: null,
    paidAt: null,
    createdAt: now,
    ...overrides,
  };
}

function publicOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-0042',
    type: 'DELIVERY',
    channel: 'ONLINE',
    status: 'PENDING',
    paymentStatus: 'PENDING_PAYMENT',
    paymentMethod: 'CARD',
    subtotal: new Prisma.Decimal('100.00'),
    tax: new Prisma.Decimal('14.00'),
    deliveryFee: new Prisma.Decimal('25.00'),
    total: new Prisma.Decimal('139.00'),
    customerName: 'Mona Ali',
    customerPhone: '01012345678',
    customerAddress: '12 Nile Street',
    notes: null,
    createdAt: now,
    items: [
      {
        menuItemName: 'Margherita',
        menuItemNameAr: null,
        sizeName: null,
        sizeNameAr: null,
        quantity: 2,
        lineTotal: new Prisma.Decimal('200.00'),
        menuItem: { prepMinutes: 12 },
      },
    ],
    onlinePayment: paymentRow(),
    ...overrides,
  };
}

const paymentWithOrder = (overrides: Record<string, unknown> = {}, orderOverrides = {}) => ({
  ...paymentRow(overrides),
  order: {
    id: 'order-1',
    orderNumber: 'ORD-0042',
    branchId: 'branch-1',
    status: 'PENDING',
    ...orderOverrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hashPassword.mockResolvedValue('hashed-password');
  mocks.userFindUnique.mockResolvedValue({ id: 'system-user' });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      onlinePayment: { updateMany: mocks.paymentUpdateMany },
      order: { update: mocks.orderUpdate },
      payment: {
        findFirst: mocks.capturedPaymentFindFirst,
        create: mocks.capturedPaymentCreate,
      },
      invoice: { upsert: mocks.invoiceUpsert },
    }),
  );
  mocks.paymentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.capturedPaymentFindFirst.mockResolvedValue({ id: 'ledger-payment-1' });
  mocks.paymentUpdate.mockResolvedValue({});
  mocks.orderUpdate.mockResolvedValue({});
  mocks.orderFindUniqueOrThrow.mockResolvedValue(publicOrderRow());
});

describe('toOnlinePaymentDto', () => {
  it('formats amounts and flags simulated intents', () => {
    const dto = toOnlinePaymentDto(paymentRow() as never);
    expect(dto.amount).toBe('139.00');
    expect(dto.simulated).toBe(true);
    expect(dto.paidAt).toBeNull();
    expect(dto.createdAt).toBe(now.toISOString());
  });
});

describe('getOnlineStoreActor', () => {
  it('reuses the existing system cashier', async () => {
    await expect(getOnlineStoreActor()).resolves.toEqual({
      id: 'system-user',
      role: 'CASHIER',
      branchId: null,
      terminalId: 'ONLINE',
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('creates a disabled system cashier on first use', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: 'system-user' });

    await expect(getOnlineStoreActor()).resolves.toMatchObject({ id: 'system-user' });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        username: 'online-store',
        fullName: 'Online Store',
        role: 'CASHIER',
        isActive: false,
        passwordHash: 'hashed-password',
      },
      select: { id: true },
    });
  });

  it('adopts the winner when two first orders race on creation', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on (username)', {
        code: 'P2002',
        clientVersion: '6.2.1',
      }),
    );
    mocks.userFindUniqueOrThrow.mockResolvedValue({ id: 'race-winner' });

    await expect(getOnlineStoreActor()).resolves.toMatchObject({ id: 'race-winner' });
  });

  it('rethrows unrelated creation failures', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockRejectedValue(new Error('connection lost'));

    await expect(getOnlineStoreActor()).rejects.toThrow('connection lost');
  });
});

describe('applyOnlinePaymentStatus', () => {
  it('rejects unknown references', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null);

    await expect(
      applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', { source: 'webhook' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is idempotent when the gateway repeats its last status', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder({ status: 'PAID', paidAt: now }));

    const result = await applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', {
      source: 'webhook',
    });

    expect(result.payment.status).toBe('PAID');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it('never downgrades a captured payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder({ status: 'PAID', paidAt: now }));

    const result = await applyOnlinePaymentStatus('ONL-REF-0001', 'FAILED', {
      source: 'webhook',
    });

    expect(result.payment.status).toBe('PAID');
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
    expect(mocks.cancelOrder).not.toHaveBeenCalled();
  });

  it('rejects gateway amounts that do not match the order total', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder());

    await expect(
      applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', {
        source: 'webhook',
        amount: '135.00',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('refuses to capture payments for cancelled orders', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder({}, { status: 'CANCELLED' }));

    await expect(
      applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', { source: 'webhook' }),
    ).rejects.toMatchObject({ statusCode: 409, details: { orderNumber: 'ORD-0042' } });
  });

  it('captures payment, records the ledger row and issues the invoice once', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder());
    mocks.paymentFindUniqueOrThrow.mockResolvedValue(
      paymentRow({ status: 'PAID', paidAt: now, providerRef: 'pi_1' }),
    );
    mocks.orderFindUniqueOrThrow.mockResolvedValue(
      publicOrderRow({ paymentStatus: 'PAID_ONLINE' }),
    );

    const result = await applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', {
      source: 'webhook',
      providerRef: 'pi_1',
      amount: '139.00',
      rawPayload: { event: 'paid' },
    });

    expect(mocks.paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'PAID',
        paidAt: expect.any(Date),
        failureReason: null,
        providerRef: 'pi_1',
        rawPayload: { event: 'paid' },
      },
    });
    expect(mocks.orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        paymentStatus: 'PAID_ONLINE',
        paidOnlineAt: expect.any(Date),
        amountPaid: expect.anything(),
      },
    });
    expect(mocks.capturedPaymentCreate).not.toHaveBeenCalled();
    expect(mocks.invoiceUpsert).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      update: {},
      create: {
        orderId: 'order-1',
        invoiceNumber: 'INV-0042',
        issuedAt: expect.any(Date),
      },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'onlinePayment.paid', entityId: 'payment-1' }),
      expect.anything(),
    );
    expect(result.payment.status).toBe('PAID');
  });

  it('adds a POS card ledger row when the capture has none', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder());
    mocks.capturedPaymentFindFirst.mockResolvedValue(null);
    mocks.paymentFindUniqueOrThrow.mockResolvedValue(paymentRow({ status: 'PAID', paidAt: now }));

    await applyOnlinePaymentStatus('ONL-REF-0001', 'PAID', { source: 'webhook' });

    expect(mocks.capturedPaymentCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        method: 'CARD',
        amount: expect.anything(),
        reference: 'ONL-REF-0001',
      },
    });
  });

  it('fails the payment and cancels the order so stock is released', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder());
    mocks.paymentFindUniqueOrThrow.mockResolvedValue(
      paymentRow({ status: 'FAILED', failureReason: 'The payment was declined' }),
    );
    mocks.orderFindUniqueOrThrow.mockResolvedValue(
      publicOrderRow({ status: 'CANCELLED', paymentStatus: 'PAYMENT_FAILED' }),
    );

    const result = await applyOnlinePaymentStatus('ONL-REF-0001', 'FAILED', {
      source: 'webhook',
    });

    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'FAILED',
        failureReason: 'The payment was declined',
      },
    });
    expect(mocks.cancelOrder).toHaveBeenCalledWith(
      'order-1',
      'The payment was declined',
      expect.objectContaining({ id: 'system-user', terminalId: 'ONLINE' }),
      { branchId: 'branch-1', terminalId: 'ONLINE' },
    );
    expect(mocks.orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAYMENT_FAILED' },
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'onlinePayment.failed' }),
    );
    expect(result.order.paymentStatus).toBe('PAYMENT_FAILED');
  });

  it('tolerates an order cancelled by a concurrent worker', async () => {
    mocks.paymentFindUnique.mockResolvedValue(paymentWithOrder());
    mocks.paymentFindUniqueOrThrow.mockResolvedValue(paymentRow({ status: 'EXPIRED' }));
    mocks.cancelOrder.mockRejectedValue(new ConflictError('Order is already cancelled'));

    await expect(
      applyOnlinePaymentStatus('ONL-REF-0001', 'EXPIRED', { source: 'webhook' }),
    ).resolves.toMatchObject({ payment: { status: 'EXPIRED' } });
    expect(mocks.orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAYMENT_FAILED' },
    });
  });
});
