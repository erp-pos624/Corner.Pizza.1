import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, PackagePlus, PackageSearch } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import type { StockAlertDto, StockAlertStatus } from '@posshope/shared';
import { Button } from '../components/ui/button';
import {
  CreateOrderDialog,
  type PurchaseOrderPrefill,
} from '../components/purchasing/CreateOrderDialog';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { Pagination } from '../components/ui/pagination';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { formatDateTime, formatDecimal, unitLabel } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { useI18n } from '../i18n';

const PAGE_SIZE = 20;

export function StockAlertsPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canManage = useAuthStore((state) => state.can('alerts:manage'));
  const canPurchase = useAuthStore((state) => state.can('purchasing:write'));
  const role = useAuthStore((state) => state.user?.role);
  const [status, setStatus] = useState<StockAlertStatus>('OPEN');
  const [page, setPage] = useState(1);
  const [poTarget, setPoTarget] = useState<{
    alert: StockAlertDto;
    initial: PurchaseOrderPrefill;
  } | null>(null);

  const alerts = useQuery({
    queryKey: ['inventory', 'alerts', { status, page }],
    queryFn: () => api.inventory.alerts({ status, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const replenishment = useQuery({
    queryKey: ['inventory', 'replenishment'],
    queryFn: () => api.inventory.replenishment(),
    staleTime: 30_000,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: () => api.suppliers.list({ page: 1, pageSize: 200 }),
    staleTime: 60_000,
    enabled: canPurchase,
  });
  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'purchase-options'],
    queryFn: () => api.inventory.ingredients({ page: 1, pageSize: 200, isActive: true }),
    staleTime: 60_000,
    enabled: canPurchase,
  });
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: canPurchase && role === 'ADMIN',
  });

  const rows = alerts.data?.items ?? [];
  const suggestions = replenishment.data ?? [];
  const openCount = alerts.data?.total ?? 0;

  const suggestionMap = useMemo(
    () => new Map(suggestions.map((row) => [`${row.branchId}:${row.ingredientId}`, row])),
    [suggestions],
  );

  /**
   * Snapshots the replenishment suggestion for one alert so the purchase-order
   * form opens with the same numbers the row showed, even if queries refetch.
   */
  const openPurchaseOrder = (alert: StockAlertDto): void => {
    const suggestion = suggestionMap.get(`${alert.branchId}:${alert.ingredientId}`);
    const ingredient = (ingredients.data?.items ?? []).find((item) => item.id === alert.ingredientId);
    setPoTarget({
      alert,
      initial: {
        ingredientId: alert.ingredientId,
        branchId: alert.branchId,
        supplierId: suggestion?.supplierId ?? ingredient?.supplierId ?? undefined,
        quantity:
          suggestion?.suggestedQty ??
          Math.max(Number((alert.threshold - alert.currentStock).toFixed(3)), 1),
        unitPrice: ingredient?.costPerUnit,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('inventory.alerts.open')}
          value={status === 'OPEN' ? String(openCount) : '—'}
          hint={t('inventory.alerts.openHint')}
          icon={<BellRing className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label={t('inventory.alerts.replenishment')}
          value={String(suggestions.length)}
          hint={t('inventory.alerts.replenishmentHint')}
          icon={<PackageSearch className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('inventory.alerts.thresholds')}
          value={t('inventory.alerts.thresholdsValue')}
          hint={t('inventory.alerts.thresholdsHint')}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {(['OPEN', 'RESOLVED'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  status === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {value === 'OPEN' ? t('inventory.alerts.openTab') : t('inventory.alerts.resolvedTab')}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void alerts.refetch();
              void replenishment.refetch();
            }}
          >
            {t('actions.refresh')}
          </Button>
        </div>

        {alerts.isLoading ? (
          <div className="h-48 animate-pulse bg-muted/30" />
        ) : alerts.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('inventory.alerts.loadError')}
              message={alerts.error instanceof Error ? alerts.error.message : undefined}
              onRetry={() => void alerts.refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyPanel
            title={
              status === 'OPEN'
                ? t('inventory.alerts.emptyOpen')
                : t('inventory.alerts.emptyResolved')
            }
            message={
              status === 'OPEN'
                ? t('inventory.alerts.emptyOpenMessage')
                : t('inventory.alerts.emptyResolvedMessage')
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.ingredient')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.store')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.alerts.type')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.alerts.current')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.alerts.threshold')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.alerts.raised')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((alert) => (
                  <tr
                    key={alert.id}
                    className={cn(
                      'border-b border-border/70 last:border-0 hover:bg-muted/30',
                      alert.type === 'OUT' && 'bg-destructive/[0.04]',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{alert.ingredientName}</p>
                      {alert.message ? (
                        <p className="text-[11px] text-muted-foreground">{alert.message}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{alert.branchName}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        tone={alert.type === 'OUT' ? 'red' : 'orange'}
                        label={
                          alert.type === 'OUT'
                            ? t('inventory.alerts.typeOut')
                            : t('inventory.alerts.typeLow')
                        }
                      />
                    </td>
                    <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                      {formatDecimal(alert.currentStock, 3)}{' '}
                      <span className="text-[10px] text-muted-foreground">
                        {unitLabel(alert.unit)}
                      </span>
                    </td>
                    <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                      {formatDecimal(alert.threshold, 3)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                      {formatDateTime(alert.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        {alert.status === 'OPEN' ? (
                          canPurchase ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => openPurchaseOrder(alert)}
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                              {t('inventory.alerts.createPo')}
                            </Button>
                          ) : null
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {alert.resolvedAt
                              ? formatDateTime(alert.resolvedAt)
                              : t('inventory.alerts.resolvedTab')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {alerts.data && alerts.data.total > 0 ? (
          <Pagination
            page={alerts.data.page}
            pageSize={alerts.data.pageSize}
            total={alerts.data.total}
            totalPages={alerts.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('inventory.alerts.replenishmentTitle')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('inventory.alerts.replenishmentSubtitle')}
          </p>
        </div>
        {suggestions.length === 0 ? (
          <EmptyPanel
            title={t('inventory.alerts.replenishmentEmpty')}
            message={t('inventory.alerts.replenishmentEmptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.ingredient')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.store')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.alerts.current')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.alerts.reorder')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.alerts.suggested')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.supplier')}</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((row) => (
                  <tr
                    key={`${row.branchId}-${row.ingredientId}`}
                    className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.ingredientName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.categoryName ?? '—'} · {unitLabel(row.unit)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.branchName}</td>
                    <td className="numeric px-3 py-2.5 text-end text-xs">
                      {formatDecimal(row.currentStock, 3)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                      {formatDecimal(row.reorderPoint, 3)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-end text-xs font-semibold text-amber-700">
                      +{formatDecimal(row.suggestedQty, 3)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.supplierName ?? t('inventory.ingredient.noSupplier')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {poTarget ? (
        <CreateOrderDialog
          open
          onOpenChange={(open) => {
            if (!open) setPoTarget(null);
          }}
          suppliers={suppliers.data?.items ?? []}
          ingredients={ingredients.data?.items ?? []}
          branches={role === 'ADMIN' ? (branches.data ?? []) : []}
          initial={poTarget.initial}
          onSaved={() => {
            const alertId = poTarget.alert.id;
            void (async () => {
              if (canManage) {
                try {
                  await api.inventory.resolveAlert(alertId);
                } catch {
                  // The alert may already be auto-resolved by a stock sync.
                }
              }
              void queryClient.invalidateQueries({ queryKey: ['inventory'] });
              void queryClient.invalidateQueries({ queryKey: ['purchasing'] });
            })();
          }}
        />
      ) : null}
    </div>
  );
}
