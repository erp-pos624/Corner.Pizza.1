import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Globe, Loader2, ReceiptText, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { PUBLIC_API_PREFIX, type OnlineStoreOverviewDto, type OrderDto } from '@posshope/shared';
import { OrderDetailDialog } from '../components/orders/OrderDetailDialog';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { StatCard } from '../components/ui/stat-card';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { OrderStatusBadge, PaymentBadge, StatusBadge } from '../components/ui/status-badge';
import { Toggle } from '../components/ui/toggle';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { ALL_BRANCHES } from '../lib/branch-scope';
import { formatDateTime, formatMoney, formatNumber, orderTypeLabel } from '../lib/format';
import { cn } from '../lib/utils';
import { useBranchScopeStore } from '../store/branch';

const STATUS_TONES: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = {
  accepting: 'green',
  disabled: 'neutral',
  outsideHours: 'amber',
  inactive: 'red',
};

export function OnlineStorePage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const scope = useBranchScopeStore((state) => state.scope);

  const overview = useQuery({
    queryKey: ['online-store', scope],
    queryFn: () => api.onlineStore.overview(),
    refetchInterval: 30_000,
  });
  const data = overview.data;
  const settings = data?.settings ?? null;

  const [limitHours, setLimitHours] = useState(false);
  const [openTime, setOpenTime] = useState('11:00');
  const [closeTime, setCloseTime] = useState('23:00');
  const [selected, setSelected] = useState<OrderDto | null>(null);

  /* Reset the form only when the saved values change, so a background poll
     never discards hours the operator is still editing. */
  const savedOpenTime = settings?.openTime ?? null;
  const savedCloseTime = settings?.closeTime ?? null;
  const savedUpdatedAt = settings?.updatedAt ?? null;
  useEffect(() => {
    if (!savedUpdatedAt) return;
    setLimitHours(Boolean(savedOpenTime && savedCloseTime));
    setOpenTime(savedOpenTime ?? '11:00');
    setCloseTime(savedCloseTime ?? '23:00');
  }, [savedUpdatedAt, savedOpenTime, savedCloseTime]);

  const applySettings = (updated: OnlineStoreOverviewDto['settings']): void => {
    queryClient.setQueryData<OnlineStoreOverviewDto>(['online-store', scope], (current) =>
      current ? { ...current, settings: updated } : current,
    );
    void queryClient.invalidateQueries({ queryKey: ['online-store'] });
    void queryClient.invalidateQueries({ queryKey: ['branches'] });
  };

  const toggleEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.onlineStore.updateSettings({ enabled }),
    onSuccess: (updated) => {
      applySettings(updated);
      toast.success(
        t(updated.enabled ? 'onlineStore.status.accepting' : 'onlineStore.status.disabled'),
        t('onlineStore.toast.saved'),
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('onlineStore.toast.saveFailed')),
  });

  const hoursDirty =
    settings !== null &&
    (limitHours
      ? openTime !== settings.openTime || closeTime !== settings.closeTime
      : settings.openTime !== null || settings.closeTime !== null);

  const saveHours = useMutation({
    mutationFn: () =>
      api.onlineStore.updateSettings(
        limitHours ? { openTime, closeTime } : { openTime: null, closeTime: null },
      ),
    onSuccess: (updated) => {
      applySettings(updated);
      toast.success(t('onlineStore.toast.savedMessage'), t('onlineStore.toast.saved'));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('onlineStore.toast.saveFailed')),
  });

  const submitHours = (): void => {
    if (limitHours && (!openTime || !closeTime || openTime === closeTime)) {
      toast.error(t('onlineStore.hours.error'), t('onlineStore.hours.title'));
      return;
    }
    saveHours.mutate();
  };

  if (overview.isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2" aria-busy="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (overview.isError || !data || !settings) {
    return (
      <ErrorState
        title={t('onlineStore.error.title')}
        message={
          overview.error instanceof Error ? overview.error.message : t('onlineStore.error.message')
        }
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const statusKey: TranslationKey = settings.acceptingOrders
    ? 'onlineStore.status.accepting'
    : settings.closedReason === 'OUTSIDE_HOURS'
      ? 'onlineStore.status.outsideHours'
      : settings.closedReason === 'BRANCH_INACTIVE'
        ? 'onlineStore.status.inactive'
        : 'onlineStore.status.disabled';
  const statusTone = settings.acceptingOrders
    ? STATUS_TONES.accepting
    : settings.closedReason === 'OUTSIDE_HOURS'
      ? STATUS_TONES.outsideHours
      : settings.closedReason === 'BRANCH_INACTIVE'
        ? STATUS_TONES.inactive
        : STATUS_TONES.disabled;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{settings.branchName}</h2>
            <p className="text-xs text-muted-foreground">{t('onlineStore.subtitle')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void overview.refetch()}
          disabled={overview.isFetching}
          aria-label={t('onlineStore.refresh')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', overview.isFetching && 'animate-spin')} />
          {t('onlineStore.refresh')}
        </Button>
      </div>

      {scope === ALL_BRANCHES ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning-strong">
          {t('onlineStore.selectBranch')}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('onlineStore.switch.title')}</CardTitle>
            <CardDescription>{t('onlineStore.switch.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    settings.acceptingOrders
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <ShoppingBag className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t('onlineStore.switch.label')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {settings.acceptingOrders
                      ? t('onlineStore.switch.on')
                      : t('onlineStore.switch.off')}
                  </p>
                </div>
              </div>
              {toggleEnabled.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Toggle
                  checked={settings.enabled}
                  label={t('onlineStore.switch.label')}
                  onChange={() => toggleEnabled.mutate(!settings.enabled)}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone={statusTone} label={t(statusKey)} />
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {t('onlineStore.status.timezone', { zone: settings.timezone })}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('onlineStore.note')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('onlineStore.hours.title')}</CardTitle>
            <CardDescription>{t('onlineStore.hours.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              checked={limitHours}
              label={t('onlineStore.hours.limit')}
              onChange={() => setLimitHours((current) => !current)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="online-open" className="th-label">
                  {t('onlineStore.hours.open')}
                </Label>
                <Input
                  id="online-open"
                  type="time"
                  value={openTime}
                  disabled={!limitHours}
                  onChange={(event) => setOpenTime(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="online-close" className="th-label">
                  {t('onlineStore.hours.close')}
                </Label>
                <Input
                  id="online-close"
                  type="time"
                  value={closeTime}
                  disabled={!limitHours}
                  onChange={(event) => setCloseTime(event.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('onlineStore.hours.overnight')}</p>
            <div className="flex justify-end">
              <Button size="sm" onClick={submitHours} disabled={!hoursDirty || saveHours.isPending}>
                {saveHours.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saveHours.isPending ? t('actions.saving') : t('actions.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('onlineStore.stats.orders')}
          value={formatNumber(data.today.orders)}
          hint={t('onlineStore.stats.ordersHint')}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('onlineStore.stats.revenue')}
          value={formatMoney(data.today.revenue)}
          hint={t('onlineStore.stats.revenueHint', {
            count: formatNumber(data.today.orders),
          })}
          icon={<Wallet className="h-4 w-4" />}
          tone="green"
        />
        <StatCard
          label={t('onlineStore.stats.pending')}
          value={formatNumber(data.today.pendingPayment)}
          hint={
            data.today.pendingPayment > 0
              ? t('onlineStore.stats.pendingHint')
              : t('onlineStore.stats.pendingEmpty')
          }
          icon={<Clock3 className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('onlineStore.recent.title')}</CardTitle>
          <CardDescription>{t('onlineStore.recent.description')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.recentOrders.length === 0 ? (
            <EmptyPanel
              title={t('onlineStore.recent.empty')}
              message={t('onlineStore.recent.emptyMessage')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">
                      {t('onlineStore.recent.columns.order')}
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {t('onlineStore.recent.columns.customer')}
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {t('onlineStore.recent.columns.service')}
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {t('onlineStore.recent.columns.payment')}
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {t('onlineStore.recent.columns.status')}
                    </th>
                    <th className="px-4 py-2 text-end font-semibold">
                      {t('onlineStore.recent.columns.total')}
                    </th>
                    <th className="px-4 py-2 text-end font-semibold">
                      {t('onlineStore.recent.columns.placed')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40"
                      onClick={() => setSelected(order)}
                    >
                      <td className="px-4 py-2.5">
                        <p className="numeric font-semibold">{order.orderNumber}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="max-w-[180px] truncate">
                          {order.customerName ?? t('orders.list.walkIn')}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {order.customerPhone ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{orderTypeLabel(order.type)}</td>
                      <td className="px-4 py-2.5">
                        <PaymentBadge status={order.paymentStatus} />
                      </td>
                      <td className="px-4 py-2.5">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="numeric px-4 py-2.5 text-end font-semibold">
                        {formatMoney(order.total)}
                      </td>
                      <td className="px-4 py-2.5 text-end text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        {t('onlineStore.footer', { prefix: PUBLIC_API_PREFIX })}
      </p>

      <OrderDetailDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        order={selected}
        onChanged={(updated) => setSelected(updated)}
      />
    </div>
  );
}
