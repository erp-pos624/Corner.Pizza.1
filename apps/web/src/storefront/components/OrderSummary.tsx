import type { PublicQuoteDto } from '@posshope/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { toOrderItems, useCart } from '../store/cart';
import { cx } from './ui';

/**
 * Asks the server to price the current cart. Nothing on screen is calculated
 * from prices held in the browser.
 */
export function useQuote(branchId: string | undefined) {
  const lines = useCart((state) => state.lines);
  const fulfillment = useCart((state) => state.fulfillment);
  const point = useCart((state) => state.point);
  const items = toOrderItems(lines);

  return useQuery({
    queryKey: ['quote', branchId, fulfillment, point, items],
    queryFn: () =>
      api.quote({
        branchId: branchId!,
        fulfillment,
        items,
        customerLat: fulfillment === 'DELIVERY' ? (point?.lat ?? null) : null,
        customerLng: fulfillment === 'DELIVERY' ? (point?.lng ?? null) : null,
      }),
    enabled: Boolean(branchId) && items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

export function FulfillmentToggle(): ReactElement {
  const { t } = useI18n();
  const fulfillment = useCart((state) => state.fulfillment);
  const setFulfillment = useCart((state) => state.setFulfillment);
  const option = (value: 'DELIVERY' | 'TAKEAWAY', label: string): ReactElement => (
    <button
      type="button"
      role="radio"
      aria-checked={fulfillment === value}
      onClick={() => setFulfillment(value)}
      className={cx(
        'flex-1 rounded-full px-4 py-2.5 text-[15px] font-semibold transition duration-200 ease-out',
        fulfillment === value ? 'bg-brick text-onmedia' : 'text-cream-dim hover:text-cream',
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      className="flex rounded-full border border-line bg-forest-2 p-1"
      role="radiogroup"
      aria-label={t('cart.fulfillmentAria')}
    >
      {option('DELIVERY', t('cart.delivery'))}
      {option('TAKEAWAY', t('cart.pickup'))}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactElement | string;
  strong?: boolean;
}): ReactElement {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        strong ? 'text-lg font-semibold text-cream' : 'text-cream-dim'
      }`}
    >
      <dt>{label}</dt>
      <dd className="price text-end">{value}</dd>
    </div>
  );
}

export function Totals({
  quote,
  loading,
  fulfillment,
}: {
  quote: PublicQuoteDto | undefined;
  loading: boolean;
  fulfillment: 'DELIVERY' | 'TAKEAWAY';
}): ReactElement {
  const { t } = useI18n();
  if (!quote) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton h-5 w-full" />
        <div className="skeleton h-5 w-full" />
        <div className="skeleton h-7 w-full" />
      </div>
    );
  }
  const money = (value: string): string => formatMoney(value, quote.currency);
  return (
    <dl className={`space-y-2.5 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
      <Row label={t('totals.subtotal')} value={money(quote.subtotal)} />
      <Row
        label={t('totals.tax', { rate: Number(quote.taxRate) })}
        value={money(quote.tax)}
      />
      {fulfillment === 'DELIVERY' ? (
        <Row
          label={t('totals.delivery')}
          value={quote.deliveryFee === null ? t('totals.setAtCheckout') : money(quote.deliveryFee)}
        />
      ) : (
        <Row label={t('totals.pickup')} value={t('totals.free')} />
      )}
      <div className="border-t border-line pt-3">
        <Row
          label={quote.deliveryFee === null ? t('totals.totalBeforeDelivery') : t('totals.total')}
          value={money(quote.total)}
          strong
        />
      </div>
    </dl>
  );
}
