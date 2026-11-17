import type { PublicOrderDto } from '@posshope/shared';
import { Check, CircleX } from 'lucide-react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';
import {
  formatDateTime,
  formatMoney,
  isActiveOrder,
  orderProgress,
  paymentText,
} from '../lib/format';
import { Notice, cx } from './ui';

/** The stages of an order, drawn from what the restaurant has actually recorded. */
function Progress({ order }: { order: PublicOrderDto }): ReactElement {
  const { t } = useI18n();
  if (order.status === 'cancelled') {
    return (
      <div className="flex items-start gap-3 rounded-card border border-tomato/50 bg-tomato/10 p-5">
        <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-tomato" />
        <div>
          <p className="font-semibold">{t('order.cancelledTitle')}</p>
          <p className="mt-1 text-sm text-cream-dim">
            {order.paymentStatus === 'PAYMENT_FAILED'
              ? t('order.cancelledBodyFailed')
              : t('order.cancelledBody')}
          </p>
        </div>
      </div>
    );
  }

  const steps = orderProgress(order, t);
  return (
    <ol className="relative" aria-label={t('order.progressAria')}>
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0">
          {index < steps.length - 1 ? (
            <span
              className={cx(
                'absolute start-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5',
                step.done ? 'bg-brick' : 'bg-line',
              )}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cx(
              'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
              step.done
                ? 'border-brick bg-brick text-onmedia'
                : step.current
                  ? 'border-brick bg-forest'
                  : 'border-line bg-forest',
            )}
            aria-hidden="true"
          >
            {step.done ? (
              <Check className="h-4 w-4" strokeWidth={3} />
            ) : step.current ? (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brick" />
            ) : null}
          </span>
          <span
            className={cx(
              'pt-0.5',
              step.current ? 'font-semibold text-cream' : step.done ? 'text-cream' : 'text-cream-faint',
            )}
            aria-current={step.current ? 'step' : undefined}
          >
            {step.label}
            {step.current ? <span className="sr-only"> {t('order.currentStage')}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OrderView({
  order,
  justPlaced,
}: {
  order: PublicOrderDto;
  justPlaced?: boolean;
}): ReactElement {
  const { t } = useI18n();
  const money = (value: string): string => formatMoney(value, order.currency);
  const awaitingCard = order.paymentStatus === 'PENDING_PAYMENT';

  return (
    <div>
      <header className="pb-8 pt-10 sm:pt-14">
        <h1 className="display text-4xl sm:text-5xl">
          {justPlaced && order.status !== 'cancelled' ? t('order.placedTitle') : t('order.yourOrder')}
        </h1>
        <p className="mt-3 text-cream-dim">
          <span className="price font-medium text-cream">{order.orderNumber}</span> ·{' '}
          {t('order.placedLabel')} {formatDateTime(order.createdAt)}
          {isActiveOrder(order) ? (
            <>{t('order.prepEstimate', { minutes: order.estimatedPrepMinutes })}</>
          ) : null}
        </p>
      </header>

      {awaitingCard && order.status !== 'cancelled' ? (
        <div className="mb-8">
          <Notice tone="info">
            {order.payment?.checkoutUrl && !order.payment.simulated ? (
              <>
                {t('order.waitingPayment')}{' '}
                <a href={order.payment.checkoutUrl} className="link">
                  {t('order.continuePayment')}
                </a>
              </>
            ) : (
              <>{t('order.paymentOff')}</>
            )}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div>
          <h2 className="mb-5 text-xl font-semibold">
            {isActiveOrder(order) ? t('order.whereNow') : t('order.status')}
          </h2>
          <Progress order={order} />
          {isActiveOrder(order) ? (
            <p className="mt-6 text-sm text-cream-faint" aria-live="polite">
              {t('order.polling')}
            </p>
          ) : null}
        </div>

        <aside className="panel h-fit p-5">
          <h2 className="text-lg font-semibold">{t('order.summary')}</h2>
          <ul className="mt-4 space-y-2.5 border-b border-line pb-4 text-sm">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>
                  <span className="price font-medium">{item.quantity} × </span>
                  {item.name}
                  {item.sizeName ? <span className="text-cream-faint"> · {item.sizeName}</span> : null}
                </span>
                <span className="price shrink-0 text-cream-dim">{money(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-cream-dim">
            <div className="flex justify-between gap-4">
              <dt>{t('order.subtotal')}</dt>
              <dd className="price">{money(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('order.tax')}</dt>
              <dd className="price">{money(order.tax)}</dd>
            </div>
            {order.type === 'DELIVERY' ? (
              <div className="flex justify-between gap-4">
                <dt>{t('order.delivery')}</dt>
                <dd className="price">{money(order.deliveryFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-line pt-3 text-lg font-semibold text-cream">
              <dt>{t('order.total')}</dt>
              <dd className="price">{money(order.total)}</dd>
            </div>
          </dl>
          <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-cream-faint">{t('order.payment')}</dt>
              <dd>{paymentText(order.paymentStatus, order.paymentMethod, t)}</dd>
            </div>
            <div>
              <dt className="text-cream-faint">
                {order.type === 'DELIVERY' ? t('order.deliveringTo') : t('order.pickupFor')}
              </dt>
              <dd>
                {order.customerName}
                {order.type === 'DELIVERY' && order.customerAddress ? (
                  <span className="block text-cream-dim">{order.customerAddress}</span>
                ) : null}
              </dd>
            </div>
            {order.notes ? (
              <div>
                <dt className="text-cream-faint">{t('order.notes')}</dt>
                <dd className="text-cream-dim">{order.notes}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}
