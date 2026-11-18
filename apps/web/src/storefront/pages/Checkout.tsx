import { normalizePhone } from '@posshope/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LocationPicker } from '../components/LocationPicker';
import { FulfillmentToggle, Totals, useQuote } from '../components/OrderSummary';
import { Notice, PageHeading, Spinner, TextField, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { ApiError, api, errorMessage } from '../lib/api';
import { formatMoney } from '../lib/format';
import { rememberGuestOrder } from '../lib/guest-orders';
import { useMenu, usePublicSettings } from '../lib/menu';
import { toOrderItems, useCart } from '../store/cart';
import { useCartDrawer } from '../store/cart-drawer';
import { useSession } from '../store/session';

type Payment = 'CASH' | 'CARD';
type Errors = Partial<Record<'name' | 'phone' | 'address' | 'point', string>>;

function Section({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section className="border-t border-line py-8 first:border-t-0 first:pt-0" aria-label={title}>
      <h2 className="text-xl font-semibold">
        <span className="sr-only">{step}. </span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CheckoutPage(): ReactElement {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { menu, branch } = useMenu();
  const { settings } = usePublicSettings();
  // Dashboard Settings hold the restaurant's contact details; branches only
  // fill in when Settings leave them empty.
  const pickupAddress = settings?.address ?? branch?.address ?? null;
  const openDrawer = useCartDrawer((state) => state.openDrawer);
  const status = useSession((state) => state.status);
  const customer = useSession((state) => state.customer);
  const signedIn = status === 'signed-in';

  const lines = useCart((state) => state.lines);
  const fulfillment = useCart((state) => state.fulfillment);
  const setFulfillment = useCart((state) => state.setFulfillment);
  const point = useCart((state) => state.point);
  const setPoint = useCart((state) => state.setPoint);
  const attemptKey = useCart((state) => state.attemptKey);
  const clear = useCart((state) => state.clear);

  const quote = useQuote(branch?.id);
  const delivery = fulfillment === 'DELIVERY';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [payment, setPayment] = useState<Payment>('CASH');
  const [addressId, setAddressId] = useState<string | 'new'>('new');
  const [saveAddress, setSaveAddress] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  /** A message disappears as soon as the customer starts fixing that field. */
  const clearError = (field: keyof Errors): void =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const zones = useQuery({
    queryKey: ['zones', branch?.id],
    queryFn: () =>
      api.checkZone({ branchId: branch!.id, lat: branch!.latitude!, lng: branch!.longitude! }),
    enabled: Boolean(branch?.latitude != null && branch.longitude != null),
    staleTime: 5 * 60_000,
  });

  const saved = useQuery({
    queryKey: ['addresses'],
    queryFn: api.account.addresses,
    enabled: signedIn,
  });

  // Cash is only offered on delivery (the restaurant's rule); pickup pays by card.
  useEffect(() => {
    if (!delivery && payment === 'CASH') setPayment('CARD');
  }, [delivery, payment]);

  // Preselect the default saved address once it loads.
  useEffect(() => {
    const first = saved.data?.find((entry) => entry.isDefault) ?? saved.data?.[0];
    if (first && addressId === 'new' && !address) pickSaved(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.data]);

  const pickSaved = (id: string | 'new'): void => {
    setAddressId(id);
    const entry = saved.data?.find((candidate) => candidate.id === id);
    if (!entry) {
      setAddress('');
      return;
    }
    setAddress(entry.address);
    setDeliveryNote(entry.notes ?? '');
    setPoint(
      entry.latitude != null && entry.longitude != null
        ? { lat: entry.latitude, lng: entry.longitude }
        : null,
    );
  };

  const place = useMutation({
    mutationFn: async () => {
      const contactPhone = signedIn ? customer!.phone : normalizePhone(phone);
      const notes = [
        delivery && deliveryNote.trim() ? `Delivery: ${deliveryNote.trim()}` : '',
        orderNote.trim(),
      ]
        .filter(Boolean)
        .join(' | ');
      const order = await api.placeOrder({
        branchId: branch!.id,
        idempotencyKey: attemptKey,
        customerName: signedIn ? customer!.name : name.trim(),
        customerPhone: contactPhone,
        fulfillment,
        items: toOrderItems(lines),
        paymentMethod: payment,
        ...(delivery
          ? {
              customerAddress: address.trim(),
              customerLat: point?.lat ?? null,
              customerLng: point?.lng ?? null,
              deliveryZoneId: quote.data?.deliveryZoneId ?? null,
              ...(quote.data?.deliveryFee != null
                ? { expectedDeliveryFee: quote.data.deliveryFee }
                : {}),
            }
          : {}),
        ...(notes ? { notes } : {}),
      });
      if (signedIn && delivery && addressId === 'new' && saveAddress) {
        // Saving the address is a convenience; the order already succeeded.
        await api.account
          .createAddress({
            label: t('checkout.savedAddressLabel'),
            address: address.trim(),
            latitude: point?.lat ?? null,
            longitude: point?.lng ?? null,
            ...(deliveryNote.trim() ? { notes: deliveryNote.trim() } : {}),
          })
          .catch(() => undefined);
      }
      return { order, contactPhone };
    },
    onSuccess: ({ order, contactPhone }) => {
      if (!signedIn) rememberGuestOrder(order.orderNumber, contactPhone);
      void queryClient.invalidateQueries({ queryKey: ['account-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      const target = signedIn
        ? `/account/orders/${order.orderNumber}`
        : `/orders/${order.orderNumber}`;
      // Navigate first so the empty-cart redirect below never fires.
      navigate(`${target}?placed=1`, { replace: true });
      clear();
      // A live gateway hands the customer to its hosted payment page.
      if (order.payment?.checkoutUrl && !order.payment.simulated) {
        window.location.assign(order.payment.checkoutUrl);
      }
    },
    onError: (error) => {
      // Prices, stock or the delivery fee moved: show the new figures.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['quote'] });
        void queryClient.invalidateQueries({ queryKey: ['menu'] });
      }
    },
  });

  if (lines.length === 0 && !place.isSuccess && !place.isPending) {
    return <Navigate to="/cart" replace />;
  }

  const validate = (): Errors => {
    const next: Errors = {};
    if (!signedIn) {
      if (name.trim().length < 2) next.name = t('checkout.errorName');
      if (!/^\+?\d{8,15}$/.test(normalizePhone(phone))) {
        next.phone = t('checkout.errorPhone');
      }
    }
    if (delivery) {
      if (address.trim().length < 5) next.address = t('checkout.errorAddress');
      if (quote.data?.deliveryFee == null) {
        next.point = quote.data?.deliveryIssue ?? t('checkout.errorPoint');
      }
    }
    return next;
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    place.mutate();
  };

  const currency = quote.data?.currency ?? menu?.currency ?? 'EGP';
  const closed = menu ? !menu.acceptingOrders : false;
  const deliveryBlocked = delivery && quote.data != null && quote.data.deliveryFee == null;
  const showPinIssue = deliveryBlocked && (point !== null || errors.point);

  const paymentOption = (
    value: Payment,
    title: string,
    body: string,
    icon: ReactElement,
    disabled = false,
  ): ReactElement => (
    <label
      className={cx(
        'flex items-start gap-3 rounded-xl border px-4 py-3.5 transition duration-200 ease-out focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
        disabled
          ? 'cursor-not-allowed border-line opacity-50'
          : payment === value
            ? 'cursor-pointer border-brick bg-brick/10'
            : 'cursor-pointer border-line hover:border-cream-faint',
      )}
    >
      <input
        type="radio"
        name="payment"
        className="sr-only"
        checked={payment === value}
        disabled={disabled}
        onChange={() => setPayment(value)}
      />
      <span className="mt-0.5 text-gold">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-cream-dim">{body}</span>
      </span>
    </label>
  );

  return (
    <div className="page">
      <PageHeading title={t('checkout.title')} />
      <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_24rem]">
        <div>
          <Section step="1" title={t('checkout.step1')}>
            <div className="max-w-sm">
              <FulfillmentToggle />
            </div>
            {!delivery && branch ? (
              <p className="mt-4 text-cream-dim">
                {pickupAddress
                  ? t('checkout.collectFromAddress', {
                      branch: branch.name,
                      address: pickupAddress,
                    })
                  : t('checkout.collectFrom', { branch: branch.name })}
              </p>
            ) : null}
          </Section>

          <Section step="2" title={t('checkout.step2')}>
            {signedIn && customer ? (
              <p className="text-cream-dim">
                {t('checkout.orderingAs')}{' '}
                <span className="font-medium text-cream">{customer.name}</span>,{' '}
                <span className="price text-cream">{customer.phone}</span>.{' '}
                <Link to="/account" className="link">
                  {t('checkout.change')}
                </Link>
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('checkout.fullName')}
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      clearError('name');
                    }}
                    error={errors.name}
                  />
                  <TextField
                    label={t('checkout.phone')}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      clearError('phone');
                    }}
                    error={errors.phone}
                    hint={t('checkout.phoneHint')}
                  />
                </div>
                <p className="mt-4 text-sm text-cream-dim">
                  {t('checkout.haveAccount')}{' '}
                  <Link to="/login?next=/checkout" className="link">
                    {t('checkout.signIn')}
                  </Link>{' '}
                  {t('checkout.haveAccountSuffix')}
                </p>
              </>
            )}
          </Section>

          {delivery ? (
            <Section step="3" title={t('checkout.step3')}>
              {signedIn && saved.data && saved.data.length > 0 ? (
                <div className="mb-5 grid gap-2 sm:grid-cols-2">
                  {[...saved.data.map((entry) => ({ id: entry.id, title: entry.label, body: entry.address })),
                    {
                      id: 'new' as const,
                      title: t('checkout.newAddressTitle'),
                      body: t('checkout.newAddressBody'),
                    }].map(
                    (option) => (
                      <label
                        key={option.id}
                        className={cx(
                          'cursor-pointer rounded-xl border px-4 py-3 transition duration-200 ease-out focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
                          addressId === option.id
                            ? 'border-brick bg-brick/10'
                            : 'border-line hover:border-cream-faint',
                        )}
                      >
                        <input
                          type="radio"
                          name="saved-address"
                          className="sr-only"
                          checked={addressId === option.id}
                          onChange={() => pickSaved(option.id)}
                        />
                        <span className="block font-semibold">{option.title}</span>
                        <span className="line-clamp-2 block text-sm text-cream-dim">
                          {option.body}
                        </span>
                      </label>
                    ),
                  )}
                </div>
              ) : null}

              <label htmlFor="address" className="label">
                {t('checkout.address')}
              </label>
              <textarea
                id="address"
                rows={2}
                autoComplete="street-address"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  clearError('address');
                  if (addressId !== 'new') setAddressId('new');
                }}
                placeholder={t('checkout.addressPlaceholder')}
                className="field resize-none"
                aria-invalid={errors.address ? 'true' : undefined}
              />
              {errors.address ? (
                <p className="mt-1.5 text-sm text-tomato" role="alert">
                  {errors.address}
                </p>
              ) : null}

              {branch?.latitude != null && branch.longitude != null ? (
                <div className="mt-5" data-error={errors.point ? '' : undefined}>
                  <p className="label">{t('checkout.pinLabel')}</p>
                  <LocationPicker
                    center={{ lat: branch.latitude, lng: branch.longitude }}
                    zones={zones.data?.zones ?? []}
                    value={point}
                    onChange={(next) => {
                      setPoint(next);
                      clearError('point');
                    }}
                  />
                  {showPinIssue ? (
                    <div className="mt-3">
                      <Notice>{errors.point ?? quote.data?.deliveryIssue}</Notice>
                    </div>
                  ) : quote.data?.deliveryFee != null && point ? (
                    <p className="mt-3 text-sm text-basil" role="status">
                      {t('checkout.deliverHere', {
                        fee: formatMoney(quote.data.deliveryFee, currency),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <TextField
                className="mt-5"
                label={t('checkout.instructions')}
                name="delivery-note"
                value={deliveryNote}
                onChange={(event) => setDeliveryNote(event.target.value.slice(0, 200))}
                placeholder={t('checkout.instructionsPlaceholder')}
              />

              {signedIn && addressId === 'new' ? (
                <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-cream-dim">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(event) => setSaveAddress(event.target.checked)}
                    className="h-4 w-4 accent-brick"
                  />
                  {t('checkout.saveAddress')}
                </label>
              ) : null}
            </Section>
          ) : null}

          <Section step={delivery ? '4' : '3'} title={t('checkout.step4')}>
            <div
              className="grid gap-2.5 sm:grid-cols-2"
              role="radiogroup"
              aria-label={t('checkout.paymentAria')}
            >
              {paymentOption(
                'CASH',
                t('checkout.cashTitle'),
                delivery ? t('checkout.cashBody') : t('checkout.cashBodyDisabled'),
                <Banknote className="h-5 w-5" />,
                !delivery,
              )}
              {paymentOption(
                'CARD',
                t('checkout.cardTitle'),
                t('checkout.cardBody'),
                <CreditCard className="h-5 w-5" />,
              )}
            </div>
            {payment === 'CARD' ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-cream-faint">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                {t('checkout.cardNote')}
              </p>
            ) : null}

            <label htmlFor="order-note" className="label mt-6">
              {t('checkout.kitchenNote')}
            </label>
            <textarea
              id="order-note"
              rows={2}
              value={orderNote}
              onChange={(event) => setOrderNote(event.target.value.slice(0, 300))}
              className="field resize-none"
            />
          </Section>
        </div>

        <aside className="panel h-fit p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">{t('checkout.yourOrder')}</h2>
          <ul className="mt-4 space-y-3 border-b border-line pb-4">
            {lines.map((line, index) => {
              const priced = quote.data?.lines[index];
              return (
                <li key={line.key} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="price font-medium text-cream">
                      {t('checkout.quantityTimes', { count: line.quantity })}{' '}
                    </span>
                    {line.name}
                    <span className="block text-cream-faint">
                      {[line.sizeName, ...line.toppingNames].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="price shrink-0 text-cream-dim">
                    {priced?.menuItemId === line.menuItemId
                      ? formatMoney(priced.lineTotal, currency)
                      : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <Totals quote={quote.data} loading={quote.isFetching} fulfillment={fulfillment} />
          </div>

          {quote.error ? (
            <div className="mt-4">
              <Notice>{errorMessage(quote.error)}</Notice>
            </div>
          ) : null}
          {place.error ? (
            <div className="mt-4">
              <Notice>
                {errorMessage(place.error)}
                {place.error instanceof ApiError && place.error.status === 409
                  ? t('checkout.refreshSuffix')
                  : ''}
              </Notice>
            </div>
          ) : null}
          {closed ? (
            <div className="mt-4">
              <Notice tone="info">{t('checkout.closed')}</Notice>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={place.isPending || closed || !quote.data || Boolean(quote.error)}
            className="btn-primary mt-5 h-12 w-full text-base"
          >
            {place.isPending ? <Spinner /> : null}
            {place.isPending
              ? t('checkout.placing')
              : quote.data && !deliveryBlocked
                ? t('checkout.placeOrderTotal', {
                    total: formatMoney(quote.data.total, currency),
                  })
                : t('checkout.placeOrder')}
          </button>
          <button
            type="button"
            onClick={() => {
              setFulfillment(fulfillment);
              openDrawer();
            }}
            className="btn-quiet mt-2 w-full"
          >
            {t('checkout.editCart')}
          </button>
        </aside>
      </form>
    </div>
  );
}
