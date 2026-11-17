import type { Language, OrderStatus, PaymentStatus, PublicMenuItemDto, PublicOrderDto } from '@posshope/shared';
import type { Translate } from '../i18n/messages';

const number = new Intl.NumberFormat('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let activeLanguage: Language = 'en';

export function setFormatLanguage(language: Language): void {
  activeLanguage = language;
}

const CURRENCY_LABELS: Record<string, string> = { EGP: 'ج.م' };

export function formatMoney(value: string | number, currency = 'EGP'): string {
  const amount = number.format(Number(value));
  if (activeLanguage === 'ar') {
    return `${amount} ${CURRENCY_LABELS[currency] ?? currency}`;
  }
  return `${currency} ${amount}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The price a card shows: the cheapest size, or the base price. */
export function startingPrice(item: PublicMenuItemDto): { amount: string; from: boolean } {
  if (item.hasSizes && item.sizes.length > 0) {
    const cheapest = item.sizes.reduce((min, size) =>
      Number(size.price) < Number(min.price) ? size : min,
    );
    return { amount: cheapest.price, from: item.sizes.length > 1 };
  }
  return { amount: item.basePrice, from: false };
}

const dateFormats: Record<Language, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  // Latin digits keep order times readable inside the Arabic UI.
  ar: new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
};

export function formatDateTime(iso: string): string {
  return dateFormats[activeLanguage].format(new Date(iso));
}

export function formatOpeningHours(
  open: string | null,
  close: string | null,
  t: Translate,
): string {
  if (!open || !close) return t('common.openAllDay');
  // LRM isolates keep "10:00 – 23:30" reading start-to-end inside Arabic (RTL) text.
  return `\u2066${open} – ${close}\u2069`;
}

export function orderStatusText(status: OrderStatus, t: Translate): string {
  switch (status) {
    case 'pending':
      return t('status.pending');
    case 'confirmed':
      return t('status.confirmed');
    case 'preparing':
      return t('status.preparing');
    case 'ready':
      return t('status.ready');
    case 'completed':
      return t('status.completed');
    case 'cancelled':
      return t('status.cancelled');
  }
}

export function paymentText(status: PaymentStatus, method: 'CASH' | 'CARD', t: Translate): string {
  switch (status) {
    case 'PAID':
    case 'PAID_ONLINE':
      return t('payment.paid');
    case 'PENDING_PAYMENT':
      return t('payment.awaitingCard');
    case 'PAYMENT_FAILED':
      return t('payment.failed');
    case 'REFUNDED':
      return t('payment.refunded');
    case 'PARTIALLY_REFUNDED':
      return t('payment.partlyRefunded');
    default:
      return method === 'CASH' ? t('payment.cashOnDelivery') : t('payment.unpaid');
  }
}

export interface ProgressStep {
  label: string;
  done: boolean;
  current: boolean;
}

/**
 * The real stages of an order, built only from fields the restaurant sets:
 * the kitchen status and, for delivery, the dispatch status.
 */
export function orderProgress(order: PublicOrderDto, t: Translate): ProgressStep[] {
  const delivery = order.type === 'DELIVERY';
  const outForDelivery = order.deliveryStatus === 'PICKED_UP';
  const delivered = order.deliveryStatus === 'DELIVERED' || order.status === 'completed';

  const labels = delivery
    ? [
        t('progress.received'),
        t('progress.confirmed'),
        t('progress.inOven'),
        t('progress.ready'),
        t('progress.outForDelivery'),
        t('progress.delivered'),
      ]
    : [
        t('progress.received'),
        t('progress.confirmed'),
        t('progress.inOven'),
        t('progress.readyForPickup'),
        t('progress.collected'),
      ];

  const kitchen = ['pending', 'confirmed', 'preparing', 'ready'].indexOf(order.status);
  let reached = kitchen >= 0 ? kitchen : 0;
  if (delivery) {
    if (outForDelivery) reached = 4;
    if (delivered) reached = 5;
  } else if (order.status === 'completed') {
    reached = 4;
  }

  return labels.map((label, index) => ({
    label,
    done: index < reached || (index === reached && index === labels.length - 1),
    current: index === reached && index !== labels.length - 1,
  }));
}

export function isActiveOrder(order: PublicOrderDto): boolean {
  return order.status !== 'completed' && order.status !== 'cancelled';
}
