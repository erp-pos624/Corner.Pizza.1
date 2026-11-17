import { normalizePhone } from '@posshope/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { OrderView } from '../components/OrderView';
import { EmptyState, Notice, PageHeading, TextField } from '../components/ui';
import { useI18n } from '../i18n';
import { ApiError, api, errorMessage } from '../lib/api';
import { formatDateTime, isActiveOrder } from '../lib/format';
import { guestPhoneFor, listGuestOrders } from '../lib/guest-orders';

const POLL_MS = 10_000;

function OrderSkeleton(): ReactElement {
  return (
    <div className="page py-14" aria-busy="true">
      <div className="skeleton h-12 w-64" />
      <div className="skeleton mt-4 h-5 w-80" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="skeleton h-72 w-full" />
        <div className="skeleton h-72 w-full" />
      </div>
    </div>
  );
}

/** `/orders/:orderNumber` — tracking for an order placed without an account. */
export function GuestOrderPage(): ReactElement {
  const { t } = useI18n();
  const { orderNumber = '' } = useParams();
  const [params] = useSearchParams();
  const phone = params.get('phone') ?? guestPhoneFor(orderNumber);

  const query = useQuery({
    queryKey: ['guest-order', orderNumber, phone],
    queryFn: () => api.trackOrder(orderNumber, phone!),
    enabled: Boolean(phone),
    retry: false,
    refetchInterval: (state) =>
      state.state.data && isActiveOrder(state.state.data) ? POLL_MS : false,
  });

  if (!phone) {
    return (
      <div className="page">
        <EmptyState
          title={t('orders.confirmTitle')}
          body={t('orders.confirmBody')}
          action={
            <Link to={`/track?order=${encodeURIComponent(orderNumber)}`} className="btn-primary">
              {t('orders.enterPhone')}
            </Link>
          }
        />
      </div>
    );
  }
  if (query.isLoading) return <OrderSkeleton />;
  if (query.error || !query.data) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="page">
        <EmptyState
          title={missing ? t('orders.notFound') : t('orders.loadFailed')}
          body={missing ? t('orders.notFoundBody') : errorMessage(query.error)}
          action={
            <Link to="/track" className="btn-primary">
              {t('orders.tryAgain')}
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="page">
      <OrderView order={query.data} justPlaced={params.get('placed') === '1'} />
      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/meals" className="btn-ghost">
          {t('orders.orderSomethingElse')}
        </Link>
        <Link to="/register" className="btn-quiet">
          {t('orders.createAccount')}
        </Link>
      </div>
    </div>
  );
}

/** `/track` — look an order up by its number and phone. */
export function TrackOrderPage(): ReactElement {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recent = listGuestOrders();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const number = orderNumber.trim().toUpperCase();
    const normalized = normalizePhone(phone);
    if (number.length < 4 || !/^\+?\d{8,15}$/.test(normalized)) {
      setError(t('orders.validation'));
      return;
    }
    navigate(`/orders/${encodeURIComponent(number)}?phone=${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="page max-w-2xl">
      <PageHeading
        title={t('orders.trackTitle')}
        lead={t('orders.trackLead')}
      />
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label={t('orders.orderNumber')}
          name="order"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="ORD-20261115-A1B2C3"
          autoCapitalize="characters"
        />
        <TextField
          label={t('orders.phoneNumber')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        {error ? <Notice>{error}</Notice> : null}
        <button type="submit" className="btn-primary h-12 px-7">
          {t('orders.find')}
        </button>
      </form>

      {recent.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-xl font-semibold">{t('orders.recentTitle')}</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {recent.map((order) => (
              <li key={order.orderNumber}>
                <Link
                  to={`/orders/${order.orderNumber}`}
                  className="flex items-center justify-between gap-4 py-4 hover:text-gold-soft"
                >
                  <span className="price font-medium">{order.orderNumber}</span>
                  <span className="text-sm text-cream-faint">{formatDateTime(order.placedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-cream-dim">
        {t('orders.haveAccount')}{' '}
        <Link to="/account/orders" className="link">
          {t('orders.seeAll')}
        </Link>
        .
      </p>
    </div>
  );
}

export { OrderSkeleton, POLL_MS };
