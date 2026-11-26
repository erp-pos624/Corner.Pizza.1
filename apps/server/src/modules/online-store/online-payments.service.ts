import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { toMinorUnits, type OnlinePaymentDto, type PublicOrderDto } from '@posshope/shared';
import { recordAudit } from '../../lib/audit.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { currentLanguage } from '../../lib/request-language.js';
import { prisma } from '../../prisma.js';
import { cancelOrder, commitOrderStock } from '../orders/orders.service.js';
import { isBasataConfigured, type BasataEventStatus } from './basata.service.js';

export interface OnlineStoreActor {
  id: string;
  role: 'CASHIER';
  branchId: null;
  terminalId: string;
}

const ONLINE_STORE_USERNAME = 'online-store';

/**
 * Every storefront order is attributed to a dedicated, non-loginable system
 * cashier so POS reporting and access rules keep working unchanged.
 */
export async function getOnlineStoreActor(): Promise<OnlineStoreActor> {
  const existing = await prisma.user.findUnique({
    where: { username: ONLINE_STORE_USERNAME },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, role: 'CASHIER', branchId: null, terminalId: 'ONLINE' };
  }

  const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
  try {
    const user = await prisma.user.create({
      data: {
        username: ONLINE_STORE_USERNAME,
        fullName: 'Online Store',
        role: 'CASHIER',
        isActive: false,
        passwordHash,
      },
      select: { id: true },
    });
    return { id: user.id, role: 'CASHIER', branchId: null, terminalId: 'ONLINE' };
  } catch (error) {
    // Two concurrent first orders may race to create the system user.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.user.findUniqueOrThrow({
        where: { username: ONLINE_STORE_USERNAME },
        select: { id: true },
      });
      return { id: winner.id, role: 'CASHIER', branchId: null, terminalId: 'ONLINE' };
    }
    throw error;
  }
}

export const publicOrderInclude = {
  items: {
    include: { menuItem: { select: { prepMinutes: true } } },
    orderBy: { createdAt: 'asc' },
  },
  onlinePayment: true,
} satisfies Prisma.OrderInclude;

type PublicOrderRow = Prisma.OrderGetPayload<{ include: typeof publicOrderInclude }>;

function money(value: Prisma.Decimal | number | string): string {
  return Number(value).toFixed(2);
}

function localized(name: string, nameAr: string | null): string {
  if (currentLanguage() === 'ar' && nameAr) return nameAr;
  return name;
}

export function toOnlinePaymentDto(
  payment: NonNullable<PublicOrderRow['onlinePayment']> | Prisma.OnlinePaymentGetPayload<object>,
): OnlinePaymentDto {
  const raw = payment.rawPayload as Record<string, unknown> | null;
  return {
    id: payment.id,
    provider: payment.provider,
    providerRef: payment.providerRef,
    reference: payment.reference,
    status: payment.status,
    amount: money(payment.amount),
    currency: payment.currency,
    checkoutUrl: payment.checkoutUrl,
    failureReason: payment.failureReason,
    simulated: raw?.simulated === true || !isBasataConfigured(),
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toPublicOrderDto(order: PublicOrderRow): PublicOrderDto {
  const estimatedPrepMinutes = order.items.reduce(
    (longest, item) => Math.max(longest, item.menuItem.prepMinutes),
    0,
  );
  return {
    orderNumber: order.orderNumber,
    type: order.type,
    channel: 'ONLINE',
    status: order.status.toLowerCase() as PublicOrderDto['status'],
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod === 'CASH' ? 'CASH' : 'CARD',
    currency: order.onlinePayment?.currency ?? 'EGP',
    subtotal: money(order.subtotal),
    tax: money(order.tax),
    taxIncluded: money(order.taxIncluded),
    deliveryFee: money(order.deliveryFee),
    total: money(order.total),
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    customerAddress: order.customerAddress,
    notes: order.notes,
    estimatedPrepMinutes: estimatedPrepMinutes > 0 ? estimatedPrepMinutes : 15,
    items: order.items.map((item) => ({
      name: localized(item.menuItemName, item.menuItemNameAr),
      sizeName: localized(item.sizeName ?? '', item.sizeNameAr),
      quantity: item.quantity,
      lineTotal: money(item.lineTotal),
    })),
    payment: order.onlinePayment ? toOnlinePaymentDto(order.onlinePayment) : null,
    deliveryStatus: order.type === 'DELIVERY' ? order.deliveryStatus : null,
    createdAt: order.createdAt.toISOString(),
  };
}

export async function findPublicOrder(
  orderNumber: string,
  customerPhone: string,
): Promise<PublicOrderDto> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: publicOrderInclude,
  });
  if (!order || order.customerPhone?.trim() !== customerPhone.trim()) {
    throw new NotFoundError('Order not found');
  }
  return toPublicOrderDto(order);
}

async function loadPublicOrder(orderId: string): Promise<PublicOrderDto> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: publicOrderInclude,
  });
  return toPublicOrderDto(row);
}

export interface ApplyPaymentOptions {
  source: 'webhook' | 'simulation' | 'callback';
  providerRef?: string | null;
  /** Gateway-reported amount in major units (e.g. "135.00"). */
  amount?: string | null;
  rawPayload?: unknown;
}

export interface AppliedPayment {
  payment: OnlinePaymentDto;
  order: PublicOrderDto;
}

/**
 * Idempotent gateway state machine. The POS payment ledger is only touched when
 * money is actually captured; failures release the reserved stock by cancelling
 * the pending order.
 */
export async function applyOnlinePaymentStatus(
  reference: string,
  status: BasataEventStatus,
  options: ApplyPaymentOptions,
): Promise<AppliedPayment> {
  const payment = await prisma.onlinePayment.findUnique({
    where: { reference },
    include: { order: { select: { id: true, orderNumber: true, branchId: true, status: true } } },
  });
  if (!payment) throw new NotFoundError('Payment intent not found');

  if (options.amount) {
    const expectedMinor = toMinorUnits(money(payment.amount));
    const reportedMinor = toMinorUnits(options.amount);
    if (expectedMinor !== reportedMinor) {
      throw new ConflictError('The gateway amount does not match the order total');
    }
  }

  if (payment.status === status) {
    return {
      payment: toOnlinePaymentDto(payment),
      order: await loadPublicOrder(payment.orderId),
    };
  }

  // A captured payment is never downgraded by a late or duplicated event.
  if (payment.status === 'PAID' && status !== 'PAID') {
    return {
      payment: toOnlinePaymentDto(payment),
      order: await loadPublicOrder(payment.orderId),
    };
  }

  if (status === 'PAID') {
    if (payment.order.status === 'CANCELLED') {
      throw new ConflictError('The order was cancelled before the payment was captured', {
        orderNumber: payment.order.orderNumber,
        action: 'Refund the captured payment from the Basata dashboard',
      });
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.onlinePayment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
        data: {
          status: 'PAID',
          paidAt: now,
          failureReason: null,
          ...(options.providerRef ? { providerRef: options.providerRef } : {}),
          ...(options.rawPayload !== undefined
            ? { rawPayload: options.rawPayload as Prisma.InputJsonValue }
            : {}),
        },
      });
      if (claimed.count === 0) return;

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'PAID_ONLINE', paidOnlineAt: now, amountPaid: payment.amount },
      });
      // Stock is deducted only once money is captured; the snapshot was taken
      // when the checkout was created and is idempotent per order.
      await commitOrderStock(tx, payment.orderId);

      const captured = await tx.payment.findFirst({
        where: { orderId: payment.orderId, method: 'CARD' },
        select: { id: true },
      });
      if (!captured) {
        await tx.payment.create({
          data: {
            orderId: payment.orderId,
            method: 'CARD',
            amount: payment.amount,
            reference,
          },
        });
      }

      await tx.invoice.upsert({
        where: { orderId: payment.orderId },
        update: {},
        create: {
          orderId: payment.orderId,
          invoiceNumber: `INV-${payment.order.orderNumber.slice(4)}`,
          issuedAt: now,
        },
      });

      await recordAudit(
        {
          action: 'onlinePayment.paid',
          entityType: 'OnlinePayment',
          entityId: payment.id,
          after: {
            reference,
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            amount: money(payment.amount),
            source: options.source,
          },
        },
        tx,
      );
    });

    const refreshed = await prisma.onlinePayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    return {
      payment: toOnlinePaymentDto(refreshed),
      order: await loadPublicOrder(payment.orderId),
    };
  }

  const failureReason =
    status === 'EXPIRED'
      ? 'The payment session expired'
      : status === 'CANCELLED'
        ? 'The payment was cancelled'
        : 'The payment was declined';

  await prisma.onlinePayment.update({
    where: { id: payment.id },
    data: {
      status,
      failureReason,
      ...(options.providerRef ? { providerRef: options.providerRef } : {}),
      ...(options.rawPayload !== undefined
        ? { rawPayload: options.rawPayload as Prisma.InputJsonValue }
        : {}),
    },
  });

  if (payment.order.status !== 'CANCELLED' && payment.order.status !== 'COMPLETED') {
    const actor = await getOnlineStoreActor();
    try {
      await cancelOrder(payment.orderId, failureReason, actor, {
        branchId: payment.order.branchId,
        terminalId: 'ONLINE',
      });
    } catch (error) {
      // Another worker may already have cancelled it; the stock is restored once.
      if (!(error instanceof ConflictError)) throw error;
    }
  }
  await prisma.order.update({
    where: { id: payment.orderId },
    data: { paymentStatus: 'PAYMENT_FAILED' },
  });

  await recordAudit({
    action: `onlinePayment.${status.toLowerCase()}`,
    entityType: 'OnlinePayment',
    entityId: payment.id,
    after: {
      reference,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      status,
      source: options.source,
    },
  });

  const refreshed = await prisma.onlinePayment.findUniqueOrThrow({ where: { id: payment.id } });
  return {
    payment: toOnlinePaymentDto(refreshed),
    order: await loadPublicOrder(payment.orderId),
  };
}

/** Read-only lookup used by the hosted-checkout return page. */
export async function getPaymentCallbackState(reference: string): Promise<{
  reference: string;
  status: string;
  orderNumber: string;
  paymentStatus: string;
}> {
  const payment = await prisma.onlinePayment.findUnique({
    where: { reference },
    include: { order: { select: { orderNumber: true, paymentStatus: true } } },
  });
  if (!payment) throw new NotFoundError('Payment intent not found');
  return {
    reference: payment.reference,
    status: payment.status,
    orderNumber: payment.order.orderNumber,
    paymentStatus: payment.order.paymentStatus,
  };
}
