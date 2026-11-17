import { zodResolver } from '@hookform/resolvers/zod';
import type { CustomerAddressDto } from '@posshope/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MapPin, Pencil, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Link, NavLink, Navigate, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { LocationPicker } from '../components/LocationPicker';
import { OrderView } from '../components/OrderView';
import { EmptyState, Notice, Spinner, TextField, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { ApiError, api, errorMessage } from '../lib/api';
import { formatDateTime, formatMoney, isActiveOrder, orderStatusText } from '../lib/format';
import { useActiveBranch } from '../lib/menu';
import { useCustomerSchemas } from '../lib/validation';
import type { DeliveryPoint } from '../store/cart';
import { useSession } from '../store/session';
import { OrderSkeleton, POLL_MS } from './Orders';

/**
 * Keeps signed-out visitors away from account pages. This is a convenience
 * only: every account endpoint checks the customer's token on the server.
 */
export function RequireAccount(): ReactElement {
  const status = useSession((state) => state.status);
  const location = useLocation();
  if (status === 'loading') return <OrderSkeleton />;
  if (status === 'guest') {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <Outlet />;
}

const TABS = [
  { to: '/account', labelKey: 'account.tabProfile', end: true },
  { to: '/account/orders', labelKey: 'account.tabOrders', end: false },
  { to: '/account/addresses', labelKey: 'account.tabAddresses', end: false },
] as const;

export function AccountLayout(): ReactElement {
  const { t } = useI18n();
  const customer = useSession((state) => state.customer);
  const signOut = useSession((state) => state.signOut);
  const queryClient = useQueryClient();

  return (
    <div className="page">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-10 sm:pt-14">
        <div>
          <h1 className="display text-4xl sm:text-5xl">{t('account.title')}</h1>
          <p className="mt-3 text-cream-dim">
            {t('account.signedInAs', { name: customer?.name ?? '' })}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            void signOut().then(() => queryClient.clear());
          }}
        >
          <LogOut className="h-4 w-4" />
          {t('account.signOut')}
        </button>
      </header>
      <nav className="flex gap-1 border-b border-line" aria-label={t('account.aria')}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx(
                '-mb-px border-b-2 px-4 py-3 text-[15px] font-medium transition duration-200 ease-out',
                isActive
                  ? 'border-brick text-cream'
                  : 'border-transparent text-cream-dim hover:text-cream',
              )
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
      <div className="pt-8">
        <Outlet />
      </div>
    </div>
  );
}

// --- Profile -----------------------------------------------------------------

type ProfileValues = z.input<ReturnType<typeof useCustomerSchemas>['profile']>;
type PasswordValues = z.input<ReturnType<typeof useCustomerSchemas>['changePasswordForm']>;

export function ProfilePage(): ReactElement {
  const { t } = useI18n();
  const schemas = useCustomerSchemas();
  const customer = useSession((state) => state.customer)!;
  const setCustomer = useSession((state) => state.setCustomer);

  const profile = useForm<ProfileValues>({
    resolver: zodResolver(schemas.profile),
    defaultValues: { name: customer.name, email: customer.email ?? '' },
  });
  const saveProfile = useMutation({
    mutationFn: (values: ProfileValues) =>
      api.account.updateProfile({ name: values.name, email: (values.email as string) || null }),
    onSuccess: (updated) => {
      setCustomer(updated);
      profile.reset({ name: updated.name, email: updated.email ?? '' });
    },
  });

  const password = useForm<PasswordValues>({ resolver: zodResolver(schemas.changePasswordForm) });
  const savePassword = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.account.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => password.reset(),
  });

  return (
    <div className="grid gap-12 lg:grid-cols-2">
      <section>
        <h2 className="text-xl font-semibold">{t('profile.personal')}</h2>
        <form
          onSubmit={profile.handleSubmit((values) => saveProfile.mutate(values))}
          noValidate
          className="mt-5 space-y-4"
        >
          <TextField
            label={t('checkout.fullName')}
            autoComplete="name"
            {...profile.register('name')}
            error={profile.formState.errors.name?.message}
          />
          <TextField
            label={t('checkout.phone')}
            name="phone"
            value={customer.phone}
            readOnly
            disabled
            hint={t('profile.phoneHint')}
          />
          <TextField
            label={t('profile.email')}
            type="email"
            autoComplete="email"
            {...profile.register('email')}
            error={profile.formState.errors.email?.message as string | undefined}
          />
          {saveProfile.error ? <Notice>{errorMessage(saveProfile.error)}</Notice> : null}
          {saveProfile.isSuccess ? <Notice tone="success">{t('profile.saved')}</Notice> : null}
          <button type="submit" disabled={saveProfile.isPending} className="btn-primary">
            {saveProfile.isPending ? <Spinner /> : null}
            {t('profile.save')}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{t('password.title')}</h2>
        <form
          onSubmit={password.handleSubmit((values) => savePassword.mutate(values))}
          noValidate
          className="mt-5 space-y-4"
        >
          <TextField
            label={t('password.current')}
            type="password"
            autoComplete="current-password"
            {...password.register('currentPassword')}
            error={password.formState.errors.currentPassword?.message}
          />
          <TextField
            label={t('password.new')}
            type="password"
            autoComplete="new-password"
            {...password.register('newPassword')}
            error={password.formState.errors.newPassword?.message}
            hint={t('password.hint')}
          />
          <TextField
            label={t('password.confirm')}
            type="password"
            autoComplete="new-password"
            {...password.register('confirmPassword')}
            error={password.formState.errors.confirmPassword?.message}
          />
          {savePassword.error ? <Notice>{errorMessage(savePassword.error)}</Notice> : null}
          {savePassword.isSuccess ? (
            <Notice tone="success">{t('password.changed')}</Notice>
          ) : null}
          <button type="submit" disabled={savePassword.isPending} className="btn-ghost">
            {savePassword.isPending ? <Spinner /> : null}
            {t('password.submit')}
          </button>
        </form>
      </section>
    </div>
  );
}

// --- Orders ------------------------------------------------------------------

export function AccountOrdersPage(): ReactElement {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['account-orders', page],
    queryFn: () => api.account.orders(page),
    refetchInterval: (state) =>
      state.state.data?.items.some(isActiveOrder) ? POLL_MS * 2 : false,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="skeleton h-24 w-full rounded-card" />
        ))}
      </div>
    );
  }
  if (query.error) return <Notice>{errorMessage(query.error)}</Notice>;
  if (!query.data || query.data.total === 0) {
    return (
      <EmptyState
        title={t('accountOrders.emptyTitle')}
        body={t('accountOrders.emptyBody')}
        action={
          <Link to="/meals" className="btn-primary">
            {t('cart.browse')}
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {query.data.items.map((order) => (
          <li key={order.orderNumber}>
            <Link
              to={`/account/orders/${order.orderNumber}`}
              className="group grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="price font-semibold group-hover:text-gold-soft">
                    {order.orderNumber}
                  </span>
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      order.status === 'cancelled'
                        ? 'bg-tomato/15 text-tomato'
                        : isActiveOrder(order)
                          ? 'bg-gold/15 text-gold-soft'
                          : 'bg-forest-3 text-cream-dim',
                    )}
                  >
                    {orderStatusText(order.status, t)}
                  </span>
                </p>
                <p className="mt-1 truncate text-sm text-cream-dim">
                  {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
                </p>
                <p className="mt-0.5 text-sm text-cream-faint">
                  {formatDateTime(order.createdAt)} ·{' '}
                  {order.type === 'DELIVERY' ? t('cart.delivery') : t('cart.pickup')}
                </p>
              </div>
              <p className="price self-center text-lg font-semibold">
                {formatMoney(order.total, order.currency)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {query.data.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between" aria-label={t('accountOrders.pagesAria')}>
          <button
            type="button"
            className="btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('accountOrders.newer')}
          </button>
          <span className="text-sm text-cream-faint">
            {t('accountOrders.pageOf', { page, pages: query.data.totalPages })}
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={page >= query.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t('accountOrders.older')}
          </button>
        </nav>
      ) : null}
    </>
  );
}

export function AccountOrderPage(): ReactElement {
  const { t } = useI18n();
  const { orderNumber = '' } = useParams();
  const [params] = useSearchParams();
  const query = useQuery({
    queryKey: ['account-order', orderNumber],
    queryFn: () => api.account.order(orderNumber),
    retry: false,
    refetchInterval: (state) =>
      state.state.data && isActiveOrder(state.state.data) ? POLL_MS : false,
  });

  if (query.isLoading) return <OrderSkeleton />;
  if (query.error || !query.data) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="page">
        <EmptyState
          title={missing ? t('orders.notFound') : t('orders.loadFailed')}
          body={missing ? t('accountOrder.notFoundBody') : errorMessage(query.error)}
          action={
            <Link to="/account/orders" className="btn-primary">
              {t('accountOrder.back')}
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
        <Link to="/account/orders" className="btn-ghost">
          {t('accountOrder.all')}
        </Link>
        <Link to="/meals" className="btn-quiet">
          {t('orders.orderSomethingElse')}
        </Link>
      </div>
    </div>
  );
}

// --- Addresses ---------------------------------------------------------------

function AddressForm({
  initial,
  onDone,
}: {
  initial: CustomerAddressDto | null;
  onDone: () => void;
}): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { branch } = useActiveBranch();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [point, setPoint] = useState<DeliveryPoint | null>(
    initial?.latitude != null && initial.longitude != null
      ? { lat: initial.latitude, lng: initial.longitude }
      : null,
  );
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);

  const zones = useQuery({
    queryKey: ['zones', branch?.id],
    queryFn: () =>
      api.checkZone({ branchId: branch!.id, lat: branch!.latitude!, lng: branch!.longitude! }),
    enabled: Boolean(branch?.latitude != null && branch.longitude != null),
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label: label.trim(),
        address: address.trim(),
        latitude: point?.lat ?? null,
        longitude: point?.lng ?? null,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(isDefault ? { isDefault: true } : {}),
      };
      return initial
        ? api.account.updateAddress(initial.id, body)
        : api.account.createAddress(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onDone();
    },
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="panel space-y-4 p-5">
      <h2 className="text-lg font-semibold">
        {initial ? t('addresses.editTitle') : t('addresses.newTitle')}
      </h2>
      <TextField
        label={t('addresses.label')}
        name="label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t('addresses.labelPlaceholder')}
      />
      <div>
        <label htmlFor="account-address" className="label">
          {t('addresses.address')}
        </label>
        <textarea
          id="account-address"
          rows={2}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder={t('addresses.addressPlaceholder')}
          className="field resize-none"
        />
      </div>
      {branch?.latitude != null && branch.longitude != null ? (
        <div>
          <p className="label">{t('addresses.pinMap')}</p>
          <LocationPicker
            center={{ lat: branch.latitude, lng: branch.longitude }}
            zones={zones.data?.zones ?? []}
            value={point}
            onChange={setPoint}
          />
        </div>
      ) : null}
      <TextField
        label={t('addresses.notes')}
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value.slice(0, 200))}
      />
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-cream-dim">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
          className="h-4 w-4 accent-brick"
        />
        {t('addresses.default')}
      </label>
      {save.error ? <Notice>{errorMessage(save.error)}</Notice> : null}
      <div className="flex gap-3">
        <button type="submit" disabled={save.isPending} className="btn-primary">
          {save.isPending ? <Spinner /> : null}
          {t('addresses.save')}
        </button>
        <button type="button" onClick={onDone} className="btn-quiet">
          {t('addresses.cancel')}
        </button>
      </div>
    </form>
  );
}

export function AddressesPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CustomerAddressDto | 'new' | null>(null);
  const query = useQuery({ queryKey: ['addresses'], queryFn: api.account.addresses });

  const remove = useMutation({
    mutationFn: (id: string) => api.account.deleteAddress(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  if (editing) {
    return (
      <div className="max-w-2xl">
        <AddressForm initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      </div>
    );
  }
  if (query.isLoading) return <div className="skeleton h-32 w-full rounded-card" aria-busy="true" />;
  if (query.error) return <Notice>{errorMessage(query.error)}</Notice>;

  const addresses = query.data ?? [];
  if (addresses.length === 0) {
    return (
      <EmptyState
        title={t('addresses.emptyTitle')}
        body={t('addresses.emptyBody')}
        action={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            {t('addresses.add')}
          </button>
        }
      />
    );
  }

  return (
    <>
      {remove.error ? (
        <div className="mb-4">
          <Notice>{errorMessage(remove.error)}</Notice>
        </div>
      ) : null}
      <ul className="divide-y divide-line border-y border-line">
        {addresses.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-start justify-between gap-4 py-5">
            <div className="flex min-w-0 gap-3">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-gold" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {entry.label}
                  {entry.isDefault ? (
                    <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold-soft">
                      <Star className="h-3 w-3" />
                      {t('addresses.defaultBadge')}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-cream-dim">{entry.address}</p>
                {entry.notes ? <p className="text-sm text-cream-faint">{entry.notes}</p> : null}
                {entry.latitude == null ? (
                  <p className="text-sm text-cream-faint">{t('addresses.noPin')}</p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-quiet min-h-9 text-sm"
                onClick={() => setEditing(entry)}
                aria-label={t('addresses.editAria', { label: entry.label })}
              >
                <Pencil className="h-4 w-4" />
                {t('addresses.edit')}
              </button>
              <button
                type="button"
                className="btn-quiet min-h-9 text-sm"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('addresses.removeConfirm', { label: entry.label }))) {
                    remove.mutate(entry.id);
                  }
                }}
                aria-label={t('addresses.removeAria', { label: entry.label })}
              >
                <Trash2 className="h-4 w-4" />
                {t('addresses.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost mt-6" onClick={() => setEditing('new')}>
        {t('addresses.addAnother')}
      </button>
    </>
  );
}
