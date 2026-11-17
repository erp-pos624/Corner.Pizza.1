import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, MapPin, MapPinned, Phone, Plus, ShoppingBag, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import {
  DELIVERY_STATUSES,
  type DeliveryOrderDto,
  type DeliveryStatus,
  type DriverSettlementDto,
} from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input, Select, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Pagination } from '../components/ui/pagination';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { ExportActions } from '../components/ui/export-actions';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast';
import { DeliveryZonesTab } from '../components/delivery/DeliveryZonesTab';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { downloadCsv, downloadExcel, downloadPdf, type ExportValue } from '../lib/export';
import { formatDate, formatDateTime, formatMoney, formatNumber, todayIso } from '../lib/format';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

const PAGE_SIZE = 10;

type Tab = 'dispatch' | 'settlements' | 'zones';

type DeliveryStatusFilter = DeliveryStatus | 'all';
type SettlementStatusFilter = 'all' | 'OPEN' | 'SETTLED';

const STATUS_LABEL_KEY: Record<DeliveryStatus, TranslationKey> = {
  PENDING: 'delivery.status.PENDING',
  ASSIGNED: 'delivery.status.ASSIGNED',
  PICKED_UP: 'delivery.status.PICKED_UP',
  DELIVERED: 'delivery.status.DELIVERED',
  FAILED: 'delivery.status.FAILED',
  CANCELLED: 'delivery.status.CANCELLED',
};

const STATUS_VARIANT: Record<
  DeliveryStatus,
  'secondary' | 'default' | 'warning' | 'success' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  ASSIGNED: 'default',
  PICKED_UP: 'warning',
  DELIVERED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'outline',
};

const NEXT_ACTIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: [],
  ASSIGNED: ['PICKED_UP', 'FAILED', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

const ACTION_LABEL_KEY: Partial<Record<DeliveryStatus, TranslationKey>> = {
  PICKED_UP: 'delivery.order.pickedUp',
  DELIVERED: 'delivery.order.delivered',
  FAILED: 'delivery.order.failed',
};

export function DeliveryPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);
  const canDispatch = can('delivery:manage');
  const canUpdate = can('delivery:update');
  const canSettle = can('settlements:manage');
  const canManageZones = can('delivery:zones');

  const [tab, setTab] = useState<Tab>('dispatch');

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatusFilter>('all');
  const [driverFilter, setDriverFilter] = useState('');

  const [assignTarget, setAssignTarget] = useState<DeliveryOrderDto | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrderDto | null>(null);

  const [settlementPage, setSettlementPage] = useState(1);
  const [settlementStatus, setSettlementStatus] = useState<SettlementStatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createDriverId, setCreateDriverId] = useState('');
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [settleTarget, setSettleTarget] = useState<DriverSettlementDto | null>(null);
  const [handedOver, setHandedOver] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['delivery', 'orders', { page, statusFilter, driverFilter }],
    queryFn: () =>
      api.delivery.orders({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
        driverId: driverFilter || undefined,
      }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  const driversQuery = useQuery({
    queryKey: ['delivery', 'drivers'],
    queryFn: () => api.delivery.drivers(),
    enabled: canDispatch,
    staleTime: 60_000,
  });

  const settlementsQuery = useQuery({
    queryKey: ['delivery', 'settlements', { settlementPage, settlementStatus }],
    queryFn: () =>
      api.delivery.settlements({
        page: settlementPage,
        pageSize: PAGE_SIZE,
        status: settlementStatus === 'all' ? undefined : settlementStatus,
      }),
    enabled: tab === 'settlements',
    placeholderData: (previous) => previous,
  });

  const invalidateDispatch = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['delivery'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['tables'] });
  };

  const invalidateSettlements = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['delivery', 'settlements'] });
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const assign = useMutation({
    mutationFn: () => {
      if (!assignTarget || !assignDriverId) throw new Error(t('delivery.errors.assign'));
      return api.delivery.assign(assignTarget.id, { driverId: assignDriverId });
    },
    onSuccess: () => {
      toast.success(t('delivery.assign.success'));
      setAssignTarget(null);
      setAssignDriverId('');
      invalidateDispatch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.errors.assign'));
    },
  });

  const advance = useMutation({
    mutationFn: ({ order, status }: { order: DeliveryOrderDto; status: DeliveryStatus }) =>
      api.delivery.updateStatus(order.id, status),
    onSuccess: () => {
      toast.success(t('delivery.toasts.statusUpdated'));
      invalidateDispatch();
      invalidateSettlements();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.errors.status'));
    },
  });

  const cancelDelivery = useMutation({
    mutationFn: (order: DeliveryOrderDto) => api.delivery.updateStatus(order.id, 'CANCELLED'),
    onSuccess: () => {
      toast.success(t('delivery.cancel.success'));
      setCancelTarget(null);
      invalidateDispatch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.errors.status'));
      setCancelTarget(null);
    },
  });

  const createSettlement = useMutation({
    mutationFn: () => {
      if (!createDriverId) throw new Error(t('delivery.errors.createSettlement'));
      return api.delivery.createSettlement({
        driverId: createDriverId,
        periodStart,
        periodEnd,
      });
    },
    onSuccess: () => {
      toast.success(t('delivery.settlements.create.success'));
      setCreateOpen(false);
      setCreateDriverId('');
      setPeriodStart(todayIso());
      setPeriodEnd(todayIso());
      invalidateSettlements();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.errors.createSettlement'));
    },
  });

  const settleDriver = useMutation({
    mutationFn: () => {
      if (!settleTarget) throw new Error(t('delivery.errors.settle'));
      const amount = handedOver.trim() || settleTarget.cashCollected;
      return api.delivery.settleSettlement(settleTarget.id, {
        amountHandedOver: amount,
        notes: settleNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t('delivery.settlements.settleDialog.success'));
      setSettleTarget(null);
      setHandedOver('');
      setSettleNotes('');
      invalidateSettlements();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('delivery.errors.settle'));
    },
  });

  const drivers = driversQuery.data ?? [];

  const varianceMinor = useMemo(() => {
    if (!settleTarget) return 0;
    const amount = handedOver.trim() || settleTarget.cashCollected;
    const handedMinor = Math.round(Number(amount) * 100);
    const cashMinor = Math.round(Number(settleTarget.cashCollected) * 100);
    if (!Number.isFinite(handedMinor)) return -cashMinor;
    return handedMinor - cashMinor;
  }, [settleTarget, handedOver]);

  const openAssign = (order: DeliveryOrderDto): void => {
    setAssignTarget(order);
    setAssignDriverId(order.driverId ?? '');
  };

  const openSettleDialog = (settlement: DriverSettlementDto): void => {
    setSettleTarget(settlement);
    setHandedOver(settlement.cashCollected);
    setSettleNotes('');
  };

  const dispatchBody = ordersQuery.isLoading ? (
    <div className="space-y-2 p-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  ) : ordersQuery.isError ? (
    <div className="p-3">
      <ErrorState
        title={t('delivery.errors.load')}
        message={ordersQuery.error instanceof Error ? ordersQuery.error.message : undefined}
        onRetry={() => void ordersQuery.refetch()}
      />
    </div>
  ) : (ordersQuery.data?.items.length ?? 0) === 0 ? (
    <EmptyPanel
      title={
        statusFilter === 'all' && !driverFilter
          ? t('delivery.order.emptyTitle')
          : t('delivery.order.filteredEmpty')
      }
      message={
        statusFilter === 'all' && !driverFilter ? t('delivery.order.emptyMessage') : undefined
      }
    />
  ) : (
    <div className="space-y-2 p-3">
      {ordersQuery.data!.items.map((order) => {
        const status = order.deliveryStatus ?? 'PENDING';
        const nextActions = NEXT_ACTIONS[status].filter((target) => target !== 'CANCELLED');
        return (
          <article
            key={order.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-start"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold">{order.orderNumber}</span>
                <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
                {order.isCod ? (
                  <Badge variant="warning">{t('delivery.payment.cod')}</Badge>
                ) : order.paymentStatus === 'PAID' ? (
                  <Badge variant="success">{t('delivery.payment.prepaid')}</Badge>
                ) : (
                  <Badge variant="outline">{t('delivery.payment.unpaid')}</Badge>
                )}
              </div>

              <p className="text-xs font-semibold">{order.customerName ?? '—'}</p>

              {order.customerPhone ? (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground" dir="ltr">
                  <Phone className="h-3 w-3" />
                  {order.customerPhone}
                </p>
              ) : null}
              {order.customerAddress ? (
                <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{order.customerAddress}</span>
                </p>
              ) : null}

              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateTime(order.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3" />
                  {t('delivery.order.items', { count: formatNumber(order.itemsCount) })}
                </span>
                <span className="flex items-center gap-1">
                  <Bike className="h-3 w-3" />
                  {order.driverName ?? t('delivery.order.noDriver')}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="numeric text-sm font-semibold">{formatMoney(order.total)}</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {status === 'PENDING' && canDispatch ? (
                  <Button size="sm" onClick={() => openAssign(order)}>
                    {t('delivery.order.assign')}
                  </Button>
                ) : null}
                {canUpdate
                  ? nextActions.map((target) => (
                      <Button
                        key={target}
                        size="sm"
                        variant={target === 'DELIVERED' ? 'success' : 'outline'}
                        onClick={() => advance.mutate({ order, status: target })}
                        disabled={advance.isPending}
                      >
                        {t(ACTION_LABEL_KEY[target] ?? 'delivery.order.failed')}
                      </Button>
                    ))
                  : null}
                {status === 'ASSIGNED' && canUpdate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCancelTarget(order)}
                    disabled={cancelDelivery.isPending}
                  >
                    {t('delivery.order.cancel')}
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  const settlementHeaders = (): string[] => [
    t('delivery.settlements.columns.settlement'),
    t('delivery.settlements.columns.driver'),
    t('delivery.settlements.columns.period'),
    t('delivery.settlements.columns.orders'),
    t('delivery.settlements.columns.cash'),
    t('delivery.settlements.columns.gross'),
    t('delivery.settlements.columns.card'),
    t('delivery.settlements.columns.handed'),
    t('delivery.settlements.columns.variance'),
    t('delivery.settlements.columns.status'),
    t('delivery.settlements.columns.settledAt'),
  ];

  const settlementRows = (): ExportValue[][] =>
    (settlementsQuery.data?.items ?? []).map((settlement) => [
      settlement.settlementNumber,
      settlement.driverName,
      `${settlement.periodStart} — ${settlement.periodEnd}`,
      settlement.ordersCount,
      Number(settlement.cashCollected),
      Number(settlement.grossSales),
      Number(settlement.cardCollected),
      Number(settlement.amountHandedOver),
      settlement.status === 'SETTLED' ? Number(settlement.variance) : '',
      t(
        settlement.status === 'OPEN'
          ? 'delivery.settlements.status.OPEN'
          : 'delivery.settlements.status.SETTLED',
      ),
      settlement.settledAt ? formatDateTime(settlement.settledAt) : '',
    ]);

  const settlementExportName = `forno-driver-settlements-${todayIso()}`;

  const exportCsv = (): void => {
    if (!settlementsQuery.data) return;
    downloadCsv(settlementExportName, [settlementHeaders(), ...settlementRows()]);
  };

  const exportExcel = async (): Promise<void> => {
    if (!settlementsQuery.data) return;
    await downloadExcel(settlementExportName, [
      {
        name: t('delivery.settlements.title'),
        rows: [settlementHeaders(), ...settlementRows()],
        widths: [18, 20, 24, 9, 16, 16, 16, 16, 12, 11, 18],
      },
    ]);
  };

  const exportPdf = async (): Promise<void> => {
    if (!settlementsQuery.data) return;
    await downloadPdf(settlementExportName, {
      title: t('delivery.settlements.title'),
      subtitle: formatDate(new Date()),
      meta: [
        {
          label: t('delivery.settlements.columns.orders'),
          value: formatNumber(settlementsQuery.data.total),
        },
      ],
      sections: [
        {
          headers: settlementHeaders(),
          rows: settlementRows(),
          columnAlign: [
            'left',
            'left',
            'left',
            'right',
            'right',
            'right',
            'right',
            'right',
            'right',
            'center',
            'left',
          ],
        },
      ],
    });
  };

  const settlementsBody = settlementsQuery.isLoading ? (
    <div className="space-y-2 p-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  ) : settlementsQuery.isError ? (
    <div className="p-3">
      <ErrorState
        title={t('delivery.errors.loadSettlements')}
        message={
          settlementsQuery.error instanceof Error ? settlementsQuery.error.message : undefined
        }
        onRetry={() => void settlementsQuery.refetch()}
      />
    </div>
  ) : (settlementsQuery.data?.items.length ?? 0) === 0 ? (
    <EmptyPanel
      title={
        settlementStatus === 'all'
          ? t('delivery.settlements.emptyTitle')
          : t('delivery.settlements.filteredEmpty')
      }
      message={settlementStatus === 'all' ? t('delivery.settlements.emptyMessage') : undefined}
      action={
        canSettle ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('delivery.settlements.new')}
          </Button>
        ) : undefined
      }
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2 text-start font-semibold">
              {t('delivery.settlements.columns.settlement')}
            </th>
            <th className="px-3 py-2 text-start font-semibold">
              {t('delivery.settlements.columns.driver')}
            </th>
            <th className="px-3 py-2 text-start font-semibold">
              {t('delivery.settlements.columns.period')}
            </th>
            <th className="px-3 py-2 text-end font-semibold">
              {t('delivery.settlements.columns.orders')}
            </th>
            <th className="px-3 py-2 text-end font-semibold">
              {t('delivery.settlements.columns.cash')}
            </th>
            <th className="px-3 py-2 text-end font-semibold">
              {t('delivery.settlements.columns.variance')}
            </th>
            <th className="px-3 py-2 text-start font-semibold">
              {t('delivery.settlements.columns.status')}
            </th>
            <th className="px-3 py-2 text-end font-semibold">
              {t('delivery.settlements.columns.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {settlementsQuery.data!.items.map((settlement) => {
            const variance = Number(settlement.variance);
            return (
              <tr
                key={settlement.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-semibold">{settlement.settlementNumber}</td>
                <td className="px-3 py-2">{settlement.driverName}</td>
                <td className="numeric px-3 py-2 text-xs text-muted-foreground">
                  {t('delivery.settlements.period', {
                    start: formatDate(settlement.periodStart),
                    end: formatDate(settlement.periodEnd),
                  })}
                </td>
                <td className="numeric px-3 py-2 text-end">
                  {formatNumber(settlement.ordersCount)}
                </td>
                <td className="numeric px-3 py-2 text-end font-medium">
                  {formatMoney(settlement.cashCollected)}
                </td>
                <td
                  className={cn(
                    'numeric px-3 py-2 text-end font-medium',
                    settlement.status === 'SETTLED'
                      ? variance === 0
                        ? 'text-success'
                        : 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {settlement.status === 'SETTLED' ? formatMoney(settlement.variance) : '—'}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={settlement.status === 'OPEN' ? 'warning' : 'success'}>
                    {t(
                      settlement.status === 'OPEN'
                        ? 'delivery.settlements.status.OPEN'
                        : 'delivery.settlements.status.SETTLED',
                    )}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-end">
                  {settlement.status === 'OPEN' && canSettle ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSettleDialog(settlement)}
                    >
                      {t('delivery.settlements.settleAction')}
                    </Button>
                  ) : settlement.settledAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(settlement.settledAt)}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const tabs = [
    { key: 'dispatch' as const, labelKey: 'delivery.tabs.dispatch' as const, icon: Bike },
    { key: 'settlements' as const, labelKey: 'delivery.tabs.settlements' as const, icon: Wallet },
    ...(canManageZones
      ? [{ key: 'zones' as const, labelKey: 'delivery.tabs.zones' as const, icon: MapPinned }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  tab === entry.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(entry.labelKey)}
              </button>
            );
          })}
        </div>

        {tab === 'dispatch' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as DeliveryStatusFilter);
                setPage(1);
              }}
              aria-label={t('delivery.filters.statusAria')}
              className="h-9 w-40"
            >
              <option value="all">{t('delivery.filters.all')}</option>
              {DELIVERY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(STATUS_LABEL_KEY[status])}
                </option>
              ))}
            </Select>
            {canDispatch ? (
              <Select
                value={driverFilter}
                onChange={(event) => {
                  setDriverFilter(event.target.value);
                  setPage(1);
                }}
                aria-label={t('delivery.filters.driverAria')}
                className="h-9 w-44"
              >
                <option value="">{t('delivery.filters.allDrivers')}</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        ) : tab === 'settlements' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={settlementStatus}
              onChange={(event) => {
                setSettlementStatus(event.target.value as SettlementStatusFilter);
                setSettlementPage(1);
              }}
              className="h-9 w-36"
            >
              <option value="all">{t('delivery.filters.all')}</option>
              <option value="OPEN">{t('delivery.settlements.status.OPEN')}</option>
              <option value="SETTLED">{t('delivery.settlements.status.SETTLED')}</option>
            </Select>
            <ExportActions
              csv={exportCsv}
              excel={exportExcel}
              pdf={exportPdf}
              disabled={(settlementsQuery.data?.items.length ?? 0) === 0}
            />
            {canSettle ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('delivery.settlements.new')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tab === 'zones' ? (
        <DeliveryZonesTab />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          {tab === 'dispatch' ? (
            <>
              <div className="flex items-center gap-2 border-b border-border p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <Bike className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{t('delivery.tabs.dispatch')}</span>
                {ordersQuery.data ? (
                  <span className="numeric ms-auto text-xs text-muted-foreground">
                    {formatNumber(ordersQuery.data.total)}
                  </span>
                ) : null}
              </div>
              {dispatchBody}
              {ordersQuery.data && ordersQuery.data.total > 0 ? (
                <Pagination
                  page={ordersQuery.data.page}
                  pageSize={ordersQuery.data.pageSize}
                  total={ordersQuery.data.total}
                  totalPages={ordersQuery.data.totalPages}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{t('delivery.settlements.title')}</span>
                {settlementsQuery.data ? (
                  <span className="numeric ms-auto text-xs text-muted-foreground">
                    {formatNumber(settlementsQuery.data.total)}
                  </span>
                ) : null}
              </div>
              {settlementsBody}
              {settlementsQuery.data && settlementsQuery.data.total > 0 ? (
                <Pagination
                  page={settlementsQuery.data.page}
                  pageSize={settlementsQuery.data.pageSize}
                  total={settlementsQuery.data.total}
                  totalPages={settlementsQuery.data.totalPages}
                  onPageChange={setSettlementPage}
                />
              ) : null}
            </>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(assignTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setAssignTarget(null);
            setAssignDriverId('');
          }
        }}
      >
        <DialogContent
          title={t('delivery.assign.title')}
          description={t('delivery.assign.description', {
            number: assignTarget?.orderNumber ?? '',
          })}
          className="max-w-md"
        >
          <div>
            <Label htmlFor="assign-driver" className="text-xs">
              {t('delivery.assign.driver')}
            </Label>
            {driversQuery.isLoading ? (
              <Skeleton className="mt-1.5 h-9 w-full" />
            ) : drivers.length === 0 ? (
              <p className="mt-2 text-[11px] font-medium text-destructive">
                {t('delivery.assign.noDrivers')}
              </p>
            ) : (
              <Select
                id="assign-driver"
                value={assignDriverId}
                onChange={(event) => setAssignDriverId(event.target.value)}
                className="mt-1.5"
              >
                <option value="">—</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignTarget(null)}
              disabled={assign.isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => assign.mutate()} disabled={assign.isPending || !assignDriverId}>
              {assign.isPending ? t('actions.saving') : t('delivery.assign.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title={t('delivery.cancel.title')}
        description={t('delivery.cancel.message', {
          number: cancelTarget?.orderNumber ?? '',
        })}
        confirmLabel={t('delivery.cancel.confirm')}
        destructive
        busy={cancelDelivery.isPending}
        onConfirm={() => {
          if (cancelTarget) cancelDelivery.mutate(cancelTarget);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title={t('delivery.settlements.create.title')}
          description={t('delivery.settlements.create.description')}
          className="max-w-md"
        >
          <div className="grid gap-3">
            <div>
              <Label htmlFor="settlement-driver" className="text-xs">
                {t('delivery.settlements.create.driver')}
              </Label>
              {drivers.length === 0 && !driversQuery.isLoading ? (
                <p className="mt-2 text-[11px] font-medium text-destructive">
                  {t('delivery.settlements.create.noDrivers')}
                </p>
              ) : (
                <Select
                  id="settlement-driver"
                  value={createDriverId}
                  onChange={(event) => setCreateDriverId(event.target.value)}
                  className="mt-1.5"
                >
                  <option value="">—</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="settlement-start" className="text-xs">
                  {t('delivery.settlements.create.start')}
                </Label>
                <Input
                  id="settlement-start"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="settlement-end" className="text-xs">
                  {t('delivery.settlements.create.end')}
                </Label>
                <Input
                  id="settlement-end"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createSettlement.isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={() => createSettlement.mutate()}
              disabled={
                createSettlement.isPending ||
                !createDriverId ||
                !periodStart ||
                !periodEnd ||
                periodEnd < periodStart
              }
            >
              {createSettlement.isPending
                ? t('actions.saving')
                : t('delivery.settlements.create.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(settleTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSettleTarget(null);
            setHandedOver('');
            setSettleNotes('');
          }
        }}
      >
        <DialogContent
          title={t('delivery.settlements.settleDialog.title', {
            number: settleTarget?.settlementNumber ?? '',
          })}
          description={t('delivery.settlements.settleDialog.description')}
          className="max-w-md"
        >
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('delivery.settlements.settleDialog.cashCollected')}
              </span>
              <span className="numeric text-sm font-bold">
                {formatMoney(settleTarget?.cashCollected)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="settle-handover" className="min-w-32 text-xs text-muted-foreground">
                {t('delivery.settlements.settleDialog.amount')}
              </Label>
              <Input
                id="settle-handover"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={handedOver}
                onChange={(event) => setHandedOver(event.target.value)}
                className="h-9 text-end font-semibold"
                dir="ltr"
              />
            </div>
            <div
              className={cn(
                'flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold',
                varianceMinor === 0
                  ? 'bg-success/10 text-success'
                  : varianceMinor > 0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span>{t('delivery.settlements.settleDialog.variance')}</span>
              <span className="numeric">{formatMoney((varianceMinor / 100).toFixed(2))}</span>
            </div>
            <div>
              <Label htmlFor="settle-notes" className="text-xs">
                {t('delivery.settlements.settleDialog.notes')}
              </Label>
              <Textarea
                id="settle-notes"
                value={settleNotes}
                onChange={(event) => setSettleNotes(event.target.value)}
                placeholder={t('delivery.settlements.settleDialog.notesPlaceholder')}
                maxLength={400}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettleTarget(null)}
              disabled={settleDriver.isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => settleDriver.mutate()} disabled={settleDriver.isPending}>
              {settleDriver.isPending
                ? t('actions.saving')
                : t('delivery.settlements.settleDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
