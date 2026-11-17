import { Prisma } from '@prisma/client';
import { toMinorUnits, type PublicOrderCreateInput, type PublicOrderDto } from '@posshope/shared';
import { recordAuditSafe } from '../../lib/audit.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { getSettings } from '../../lib/settings.js';
import { prisma } from '../../prisma.js';
import { cancelOrder, createOrder } from '../orders/orders.service.js';
import { createBasataIntent } from '../online-store/basata.service.js';
import { evaluateOnlineStatus } from '../online-store/online-store.service.js';
import {
  getOnlineStoreActor,
  publicOrderInclude,
  toPublicOrderDto,
} from '../online-store/online-payments.service.js';

async function loadPublicOrder(orderId: string): Promise<PublicOrderDto> {
  const row = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: publicOrderInclude,
  });
  return toPublicOrderDto(row);
}

/**
 * Storefront checkout. The order itself is created through the same service
 * as the POS so stock, pricing and delivery-zone rules are re-verified and
 * never trusted from the client. Card orders reserve stock immediately and
 * wait for the gateway; cash-on-delivery orders open as unpaid.
 */
export async function placePublicOrder(
  input: PublicOrderCreateInput,
  /** Signed-in website customer, resolved from the token and never from the body. */
  customerId: string | null = null,
): Promise<PublicOrderDto> {
  if (input.idempotencyKey) {
    const replay = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: publicOrderInclude,
    });
    if (replay) {
      if (
        replay.channel !== 'ONLINE' ||
        replay.customerPhone?.trim() !== input.customerPhone.trim()
      ) {
        throw new ConflictError('This idempotency key has already been used');
      }
      return toPublicOrderDto(replay);
    }
  }

  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new NotFoundError('Branch not found');
  const status = evaluateOnlineStatus(branch);
  if (!status.acceptingOrders) {
    throw new ConflictError('Online ordering is currently closed', {
      reason: status.closedReason,
    });
  }

  const settings = await getSettings();
  const actor = await getOnlineStoreActor();
  const onlineCard = input.paymentMethod === 'CARD';

  const order = await createOrder(
    {
      idempotencyKey: input.idempotencyKey,
      type: input.fulfillment,
      customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      customerLat: input.customerLat,
      customerLng: input.customerLng,
      items: input.items,
      notes: input.notes,
      payLater: false,
      isCod: input.paymentMethod === 'CASH',
      payments: [],
    },
    actor,
    {
      branchId: input.branchId,
      terminalId: 'ONLINE',
      channel: 'ONLINE',
      onlineCard,
      expectedZoneId: input.deliveryZoneId ?? null,
      expectedDeliveryFeeMinor:
        input.expectedDeliveryFee !== undefined
          ? toMinorUnits(input.expectedDeliveryFee)
          : undefined,
    },
  );

  if (!onlineCard) return loadPublicOrder(order.id);

  const reference = `PAY-${order.orderNumber}`;
  const alreadyRegistered = await prisma.onlinePayment.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  });
  if (alreadyRegistered) return loadPublicOrder(order.id);

  let paymentId: string;
  try {
    const payment = await prisma.onlinePayment.create({
      data: {
        orderId: order.id,
        reference,
        amount: order.total,
        currency: settings.currency,
      },
      select: { id: true },
    });
    paymentId = payment.id;
  } catch (error) {
    // A concurrent retry of the same checkout may have registered first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return loadPublicOrder(order.id);
    }
    throw error;
  }

  try {
    const intent = await createBasataIntent({
      reference,
      amount: order.total,
      currency: settings.currency,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    });
    await prisma.onlinePayment.update({
      where: { id: paymentId },
      data: {
        providerRef: intent.providerRef,
        checkoutUrl: intent.checkoutUrl,
        rawPayload: intent.rawPayload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // The order holds reserved stock, so an unreachable provider must release
    // it immediately and surface the failure on the payment record.
    const message = error instanceof Error ? error.message : 'The payment provider is unavailable';
    await prisma.onlinePayment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', failureReason: message },
    });
    try {
      await cancelOrder(order.id, 'Payment could not be started', actor, {
        branchId: input.branchId,
        terminalId: 'ONLINE',
      });
    } catch (cancelError) {
      if (!(cancelError instanceof ConflictError)) throw cancelError;
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAYMENT_FAILED' },
    });
    await recordAuditSafe({
      action: 'onlinePayment.intent_failed',
      entityType: 'OnlinePayment',
      entityId: paymentId,
      after: {
        reference,
        orderNumber: order.orderNumber,
        error: message,
      },
    });
  }

  return loadPublicOrder(order.id);
}
