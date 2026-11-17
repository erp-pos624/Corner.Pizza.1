import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  CheckCircle2,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import {
  PAYMENT_METHODS,
  TABLE_STATUSES,
  type DiningTableDto,
  type PaymentMethod,
  type TableStatus,
} from '@posshope/shared';
import type { PageKey } from '../components/layout/AppShell';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, paymentMethodLabel } from '../lib/format';
import { setTableIntent } from '../lib/table-intent';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

const STATUS_LABEL_KEY: Record<TableStatus, TranslationKey> = {
  AVAILABLE: 'tables.status.AVAILABLE',
  OCCUPIED: 'tables.status.OCCUPIED',
  NEEDS_CLEANING: 'tables.status.NEEDS_CLEANING',
};

const STATUS_VARIANT: Record<TableStatus, 'success' | 'warning' | 'secondary'> = {
  AVAILABLE: 'success',
  OCCUPIED: 'warning',
  NEEDS_CLEANING: 'secondary',
};

const CARD_TONE: Record<TableStatus, string> = {
  AVAILABLE: 'border-border',
  OCCUPIED: 'border-warning/40',
  NEEDS_CLEANING: 'border-primary/30',
};

type StatusFilter = TableStatus | 'all';

const FILTERS: StatusFilter[] = ['all', ...TABLE_STATUSES];

interface TableForm {
  name: string;
  seats: string;
  isActive: boolean;
}

const EMPTY_FORM: TableForm = { name: '', seats: '4', isActive: true };

export function TablesPage({ onNavigate }: { onNavigate: (page: PageKey) => void }): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);
  const canManage = can('tables:manage');

  const [filter, setFilter] = useState<StatusFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiningTableDto | null>(null);
  const [form, setForm] = useState<TableForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DiningTableDto | null>(null);
  const [settleTarget, setSettleTarget] = useState<DiningTableDto | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');

  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.tables.list(),
    staleTime: 10_000,
  });

  const counts = useMemo(() => {
    const all = tablesQuery.data ?? [];
    return {
      AVAILABLE: all.filter((table) => table.status === 'AVAILABLE').length,
      OCCUPIED: all.filter((table) => table.status === 'OCCUPIED').length,
      NEEDS_CLEANING: all.filter((table) => table.status === 'NEEDS_CLEANING').length,
    };
  }, [tablesQuery.data]);

  const visibleTables = useMemo(
    () =>
      (tablesQuery.data ?? []).filter((table) => filter === 'all' || table.status === filter),
    [tablesQuery.data, filter],
  );

  const settleOrder = useQuery({
    queryKey: ['orders', 'detail', settleTarget?.openOrderId],
    queryFn: () => api.orders.get(settleTarget!.openOrderId!),
    enabled: Boolean(settleTarget?.openOrderId),
  });

  const invalidateOrderData = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tables'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  const saveTable = useMutation({
    mutationFn: () => {
      if (form.name.trim().length === 0) throw new Error(t('tables.create.name'));
      const seats = Number(form.seats);
      if (!Number.isFinite(seats) || seats < 1) throw new Error(t('tables.create.seats'));
      const body = {
        name: form.name.trim(),
        seats: Math.min(40, Math.round(seats)),
        isActive: form.isActive,
      };
      return editing ? api.tables.update(editing.id, body) : api.tables.create(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t(editing ? 'tables.toasts.updated' : 'tables.toasts.created'));
      setFormOpen(false);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : t('tables.errors.create'));
    },
  });

  const removeTable = useMutation({
    mutationFn: (table: DiningTableDto) => api.tables.remove(table.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t('tables.toasts.deleted'));
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('tables.errors.delete'));
      setPendingDelete(null);
    },
  });

  const markReady = useMutation({
    mutationFn: (table: DiningTableDto) =>
      api.tables.update(table.id, { status: 'AVAILABLE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t('tables.toasts.cleaned'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('tables.errors.update'));
    },
  });

  const settleTab = useMutation({
    mutationFn: () => {
      const order = settleOrder.data;
      if (!settleTarget?.openOrderId || !order) throw new Error(t('tables.settle.loadOrder'));
      const totalMinor = Math.round(Number(order.total) * 100);
      const receivedMinor =
        settleMethod === 'CASH' && cashReceived.trim()
          ? Math.round(Number(cashReceived) * 100)
          : totalMinor;
      if (!Number.isFinite(receivedMinor) || receivedMinor < totalMinor) {
        throw new Error(t('tables.settle.short'));
      }
      const amount =
        settleMethod === 'CASH'
          ? (receivedMinor / 100).toFixed(2)
          : order.total;
      return api.orders.settle(settleTarget.openOrderId, {
        payments: [{ method: settleMethod, amount }],
      });
    },
    onSuccess: () => {
      toast.success(t('tables.settle.success'));
      setSettleTarget(null);
      setCashReceived('');
      setSettleMethod('CASH');
      invalidateOrderData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('tables.errors.settle'));
    },
  });

  const openAtPos = (table: DiningTableDto, mode: 'new' | 'tab'): void => {
    setTableIntent({ tableId: table.id, mode });
    onNavigate('pos');
  };

  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (table: DiningTableDto): void => {
    setEditing(table);
    setForm({ name: table.name, seats: String(table.seats), isActive: table.isActive });
    setFormError(null);
    setFormOpen(true);
  };

  const openSettle = (table: DiningTableDto): void => {
    setSettleTarget(table);
    setSettleMethod('CASH');
    setCashReceived('');
  };

  const closeSettle = (open: boolean): void => {
    if (!open) {
      setSettleTarget(null);
      setCashReceived('');
      setSettleMethod('CASH');
    }
  };

  const totalMinor = settleOrder.data ? Math.round(Number(settleOrder.data.total) * 100) : 0;
  const receivedMinor =
    settleMethod === 'CASH' && cashReceived.trim()
      ? Math.round(Number(cashReceived) * 100)
      : totalMinor;
  const changeMinor = receivedMinor - totalMinor;
  const receivedInvalid = !Number.isFinite(receivedMinor) || receivedMinor < totalMinor;

  const body = tablesQuery.isLoading ? (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-36 w-full" />
      ))}
    </div>
  ) : tablesQuery.isError ? (
    <div className="p-3">
      <ErrorState
        title={t('tables.errors.load')}
        message={tablesQuery.error instanceof Error ? tablesQuery.error.message : undefined}
        onRetry={() => void tablesQuery.refetch()}
      />
    </div>
  ) : (tablesQuery.data ?? []).length === 0 ? (
    <EmptyPanel
      title={t('tables.card.emptyTitle')}
      message={t('tables.card.emptyMessage')}
      action={
        canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            {t('tables.new')}
          </Button>
        ) : undefined
      }
    />
  ) : visibleTables.length === 0 ? (
    <EmptyPanel title={t('tables.card.filteredEmpty')} />
  ) : (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visibleTables.map((table) => {
        const hasTab = Boolean(table.openOrderId);
        return (
          <article
            key={table.id}
            className={cn(
              'flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-card',
              CARD_TONE[table.status],
              !table.isActive && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold" title={table.name}>
                  {table.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {t('tables.card.seats', { count: formatNumber(table.seats) })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!table.isActive ? (
                  <Badge variant="outline">{t('tables.card.inactive')}</Badge>
                ) : null}
                <Badge variant={STATUS_VARIANT[table.status]}>
                  {t(STATUS_LABEL_KEY[table.status])}
                </Badge>
              </div>
            </div>

            {hasTab ? (
              <div className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {t('tables.card.tab', { number: table.openOrderNumber ?? '' })}
                  </span>
                  <span className="numeric font-semibold">{formatMoney(table.openOrderTotal)}</span>
                </div>
                {table.openOrderOpenedAt ? (
                  <p className="mt-0.5 text-muted-foreground">
                    {t('tables.card.tabOpened', { when: formatDateTime(table.openOrderOpenedAt) })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
              {table.isActive && table.status === 'AVAILABLE' ? (
                <Button size="sm" onClick={() => openAtPos(table, 'new')}>
                  <ReceiptText className="h-3.5 w-3.5" />
                  {t('tables.card.openTab')}
                </Button>
              ) : null}
              {table.isActive && table.status === 'OCCUPIED' ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => openAtPos(table, hasTab ? 'tab' : 'new')}
                  >
                    <ReceiptText className="h-3.5 w-3.5" />
                    {hasTab ? t('tables.card.continueTab') : t('tables.card.openTab')}
                  </Button>
                  {hasTab ? (
                    <Button size="sm" variant="outline" onClick={() => openSettle(table)}>
                      {t('tables.card.settle')}
                    </Button>
                  ) : null}
                </>
              ) : null}
              {table.isActive && table.status === 'NEEDS_CLEANING' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markReady.mutate(table)}
                  disabled={markReady.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('tables.card.markCleaned')}
                </Button>
              ) : null}
              {canManage ? (
                <span className="ms-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openEdit(table)}
                    aria-label={t('tables.card.edit')}
                    title={t('tables.card.edit')}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(table)}
                    aria-label={t('tables.card.delete')}
                    title={t('tables.card.delete')}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-ring"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <Armchair className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">{t('nav.items.tables')}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="success">
              {t('tables.summary.available', { count: formatNumber(counts.AVAILABLE) })}
            </Badge>
            <Badge variant="warning">
              {t('tables.summary.occupied', { count: formatNumber(counts.OCCUPIED) })}
            </Badge>
            <Badge variant="secondary">
              {t('tables.summary.cleaning', { count: formatNumber(counts.NEEDS_CLEANING) })}
            </Badge>
          </div>

          {canManage ? (
            <Button size="sm" className="ms-auto" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              {t('tables.new')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border p-3" role="group" aria-label={t('tables.filters.statusAria')}>
          {FILTERS.map((entry) => {
            const active = filter === entry;
            const count =
              entry === 'all' ? (tablesQuery.data ?? []).length : counts[entry];
            return (
              <button
                key={entry}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(entry)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {entry === 'all' ? t('tables.filters.all') : t(STATUS_LABEL_KEY[entry])}
                <span className={cn('numeric', active ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>
                  {formatNumber(count)}
                </span>
              </button>
            );
          })}
        </div>

        {body}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          title={editing ? t('tables.edit.title') : t('tables.create.title')}
          description={editing ? t('tables.edit.description') : t('tables.create.description')}
          className="max-w-md"
        >
          <div className="grid gap-3">
            <div>
              <Label htmlFor="table-name" className="text-xs">
                {t('tables.create.name')}
              </Label>
              <Input
                id="table-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('tables.create.namePlaceholder')}
                maxLength={30}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="table-seats" className="text-xs">
                {t('tables.create.seats')}
              </Label>
              <Input
                id="table-seats"
                type="number"
                min="1"
                max="40"
                step="1"
                value={form.seats}
                onChange={(event) => setForm((current) => ({ ...current, seats: event.target.value }))}
                className="mt-1.5"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              {t('tables.create.active')}
            </label>
            {formError ? <p className="text-[11px] font-medium text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveTable.isPending}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => saveTable.mutate()} disabled={saveTable.isPending}>
              {saveTable.isPending
                ? t('actions.saving')
                : editing
                  ? t('actions.save')
                  : t('tables.new')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t('tables.delete.title')}
        description={t('tables.delete.message', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('tables.delete.confirm')}
        destructive
        busy={removeTable.isPending}
        onConfirm={() => {
          if (pendingDelete) removeTable.mutate(pendingDelete);
        }}
      />

      <Dialog open={Boolean(settleTarget)} onOpenChange={closeSettle}>
        <DialogContent
          title={t('tables.settle.title', { number: settleTarget?.openOrderNumber ?? '' })}
          description={t('tables.settle.description')}
          className="max-w-md"
        >
          {settleOrder.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : settleOrder.isError || !settleOrder.data ? (
            <ErrorState
              title={t('tables.settle.loadOrder')}
              message={settleOrder.error instanceof Error ? settleOrder.error.message : undefined}
              onRetry={() => void settleOrder.refetch()}
            />
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('tables.settle.total')}
                </span>
                <span className="numeric text-base font-bold">{formatMoney(settleOrder.data.total)}</span>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t('tables.settle.method')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((method) => {
                    const active = settleMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSettleMethod(method)}
                        className={cn(
                          'rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {paymentMethodLabel(method)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {settleMethod === 'CASH' ? (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="settle-cash" className="min-w-24 text-xs text-muted-foreground">
                      {t('tables.settle.received')}
                    </Label>
                    <Input
                      id="settle-cash"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      placeholder={settleOrder.data.total}
                      className="h-9 text-end font-semibold"
                      dir="ltr"
                    />
                  </div>
                  {changeMinor > 0 ? (
                    <div className="flex items-center justify-between rounded-md bg-success/10 px-2 py-1.5 text-[11px] font-semibold text-success">
                      <span>{t('tables.settle.change')}</span>
                      <span className="numeric">{formatMoney((changeMinor / 100).toFixed(2))}</span>
                    </div>
                  ) : null}
                  {receivedInvalid ? (
                    <p className="text-[11px] font-medium text-destructive">
                      {t('tables.settle.short')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => closeSettle(false)} disabled={settleTab.isPending}>
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={() => settleTab.mutate()}
              disabled={
                settleTab.isPending ||
                settleOrder.isLoading ||
                !settleOrder.data ||
                (settleMethod === 'CASH' && receivedInvalid)
              }
            >
              {settleTab.isPending ? t('actions.saving') : t('tables.settle.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
