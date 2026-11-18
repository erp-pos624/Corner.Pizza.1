import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  Boxes,
  Coins,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import type { PurchaseOrderStatus } from '@posshope/shared';
import { Button } from '../components/ui/button';
import { ExportActions } from '../components/ui/export-actions';
import { Input, Select } from '../components/ui/input';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import {
  downloadCsv,
  downloadExcel,
  downloadPdf,
  type ExportValue,
} from '../lib/export';
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  formatMoney,
  todayIso,
  unitLabel,
} from '../lib/format';
import { useAuthStore } from '../store/auth';
import { useI18n, type TranslationKey } from '../i18n';

type ReportTab = 'valuation' | 'consumption' | 'purchases' | 'waste' | 'recipeCosts';

const STATUS_LABEL: Record<PurchaseOrderStatus, TranslationKey> = {
  DRAFT: 'inventory.purchasing.status.draft',
  PENDING: 'inventory.purchasing.status.pending',
  APPROVED: 'inventory.purchasing.status.approved',
  PARTIALLY_RECEIVED: 'inventory.purchasing.status.partiallyReceived',
  RECEIVED: 'inventory.purchasing.status.received',
  CANCELLED: 'inventory.purchasing.status.cancelled',
};

const STATUS_TONE: Record<
  PurchaseOrderStatus,
  'neutral' | 'orange' | 'blue' | 'green' | 'red'
> = {
  DRAFT: 'neutral',
  PENDING: 'orange',
  APPROVED: 'blue',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function InventoryReportsPage(): ReactElement {
  const { t } = useI18n();
  const isAdmin = useAuthStore((state) => state.user?.role === 'ADMIN');
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(todayIso());
  const [categoryId, setCategoryId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState<ReportTab>('valuation');

  const categories = useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: () => api.inventory.categories.list(),
    staleTime: 60_000,
  });
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const report = useQuery({
    queryKey: ['reports', 'inventory', { from, to, categoryId, branchId }],
    queryFn: () =>
      api.reports.inventory({
        from,
        to,
        categoryId: categoryId || undefined,
        branchId: branchId || undefined,
      }),
  });

  const data = report.data;
  const summary = data?.summary;

  const table = useMemo(() => {
    if (!data) return { headers: [] as string[], rows: [] as ExportValue[][] };
    if (tab === 'valuation') {
      return {
        headers: [
          t('inventory.columns.ingredient'),
          t('inventory.recipesPage.category'),
          t('inventory.columns.unitCost'),
          t('inventory.columns.inStock'),
          t('inventory.averageCost'),
          t('inventory.columns.value'),
        ],
        rows: data.valuation.map((row) => [
          row.ingredientName,
          row.categoryName ?? '',
          Number(row.averageCost),
          row.currentStock,
          Number(row.lastCost),
          Number(row.stockValue),
        ]),
      };
    }
    if (tab === 'consumption') {
      return {
        headers: [
          t('inventory.columns.ingredient'),
          t('inventory.columns.quantity'),
          t('inventory.reports.consumptionCost'),
        ],
        rows: data.consumption.map((row) => [row.ingredientName, row.quantity, Number(row.cost)]),
      };
    }
    if (tab === 'purchases') {
      return {
        headers: [
          t('inventory.purchasing.orderNumber'),
          t('inventory.columns.supplier'),
          t('inventory.columns.status'),
          t('inventory.purchasing.total'),
          t('inventory.stores.created'),
          t('inventory.purchasing.receivedAt'),
        ],
        rows: data.purchases.map((row) => [
          row.orderNumber,
          row.supplierName,
          t(STATUS_LABEL[row.status]),
          Number(row.total),
          formatDateTime(row.createdAt),
          row.receivedAt ? formatDateTime(row.receivedAt) : '',
        ]),
      };
    }
    if (tab === 'waste') {
      return {
        headers: [
          t('inventory.columns.ingredient'),
          t('inventory.columns.quantity'),
          t('inventory.reports.wasteCost'),
          t('inventory.stores.notes'),
          t('inventory.columns.by'),
          t('inventory.columns.date'),
        ],
        rows: data.waste.map((row) => [
          row.ingredientName,
          row.quantity,
          Number(row.cost ?? 0),
          row.reason ?? '',
          row.userName ?? '',
          formatDateTime(row.createdAt),
        ]),
      };
    }
    return {
      headers: [
        t('inventory.columns.item'),
        t('inventory.recipesPage.sizes'),
        t('inventory.recipesPage.versionLabel'),
        t('inventory.recipesPage.cost'),
        t('inventory.recipesPage.price'),
        t('inventory.recipesPage.marginColumn'),
      ],
      rows: data.recipeCosts.map((row) => [
        row.menuItemName,
        row.sizeName ?? '',
        row.version,
        Number(row.ingredientCost),
        Number(row.sellingPrice),
        row.marginPct,
      ]),
    };
  }, [data, tab, t]);

  const exportName = `corner-pizza-inventory-${tab}-${to}`;
  const exportRows = (): ExportValue[][] => [table.headers, ...table.rows];

  if (report.isLoading) {
    return <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (report.isError) {
    return (
      <ErrorState
        title={t('inventory.reports.loadError')}
        message={report.error instanceof Error ? report.error.message : undefined}
        onRetry={() => void report.refetch()}
      />
    );
  }

  const TABS: Array<{ key: ReportTab; label: TranslationKey }> = [
    { key: 'valuation', label: 'inventory.reports.tabs.valuation' },
    { key: 'consumption', label: 'inventory.reports.tabs.consumption' },
    { key: 'purchases', label: 'inventory.reports.tabs.purchases' },
    { key: 'waste', label: 'inventory.reports.tabs.waste' },
    { key: 'recipeCosts', label: 'inventory.reports.tabs.recipeCosts' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('inventory.stats.stockValue')}
          value={formatMoney(Number(summary?.inventoryValue ?? 0))}
          hint={t('inventory.reports.valueHint')}
          icon={<Coins className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('inventory.stats.lowStock')}
          value={formatDecimal(summary?.lowCount ?? 0, 0)}
          hint={t('inventory.reports.lowHint', { out: formatDecimal(summary?.outCount ?? 0, 0) })}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label={t('inventory.alerts.open')}
          value={formatDecimal(summary?.openAlerts ?? 0, 0)}
          hint={t('inventory.reports.alertsHint')}
          icon={<Boxes className="h-4 w-4" />}
          tone="red"
        />
        <StatCard
          label={t('inventory.reports.purchasesValue')}
          value={formatMoney(Number(summary?.purchasesValue ?? 0))}
          hint={t('inventory.reports.purchasesHint', {
            count: formatDecimal(summary?.purchasesCount ?? 0, 0),
          })}
          icon={<ShoppingCart className="h-4 w-4" />}
          tone="green"
        />
        <StatCard
          label={t('inventory.reports.consumption')}
          value={formatMoney(Number(summary?.consumptionValue ?? 0))}
          hint={t('inventory.reports.consumptionHint')}
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <StatCard
          label={t('inventory.reports.waste')}
          value={formatMoney(Number(summary?.wasteValue ?? 0))}
          hint={t('inventory.reports.wasteHint')}
          icon={<Trash2 className="h-4 w-4" />}
          tone="red"
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('inventory.filters.from')}
          </label>
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 w-40"
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('inventory.filters.to')}
          </label>
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 w-40"
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('inventory.recipesPage.category')}
          </label>
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 w-44"
          >
            <option value="">{t('actions.all')}</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        {isAdmin ? (
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('inventory.columns.store')}
            </label>
            <Select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-9 w-44"
            >
              <option value="">{t('inventory.stores.allStores')}</option>
              {(branches.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="ms-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void report.refetch()}>
            {t('actions.refresh')}
          </Button>
          <ExportActions
            csv={() => downloadCsv(exportName, exportRows())}
            excel={() =>
              downloadExcel(exportName, [{ name: t('inventory.reports.title'), rows: exportRows() }])
            }
            pdf={() =>
              downloadPdf(exportName, {
                title: t('inventory.reports.title'),
                subtitle: `${from} → ${to}`,
                sections: [{ headers: table.headers, rows: table.rows }],
              })
            }
            disabled={table.rows.length === 0}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === entry.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>

        {table.rows.length === 0 ? (
          <EmptyPanel
            title={t('inventory.reports.empty')}
            message={t('inventory.reports.emptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  {table.headers.map((header) => (
                    <th key={header} className="px-3 py-2.5 font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tab === 'valuation'
                  ? data!.valuation.map((row) => (
                      <tr
                        key={row.ingredientId}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{row.ingredientName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {unitLabel(row.unit)}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {row.categoryName ?? '—'}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatMoney(Number(row.averageCost))}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatDecimal(row.currentStock, 3)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                          {formatMoney(Number(row.lastCost))}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                          {formatMoney(Number(row.stockValue))}
                        </td>
                      </tr>
                    ))
                  : null}
                {tab === 'consumption'
                  ? data!.consumption.map((row) => (
                      <tr
                        key={row.ingredientId}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5 font-medium">{row.ingredientName}</td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatDecimal(row.quantity, 3)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                          {formatMoney(Number(row.cost))}
                        </td>
                      </tr>
                    ))
                  : null}
                {tab === 'purchases'
                  ? data!.purchases.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="numeric px-3 py-2.5 text-xs font-semibold">
                          {row.orderNumber}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{row.supplierName}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            tone={STATUS_TONE[row.status]}
                            label={t(STATUS_LABEL[row.status])}
                          />
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                          {formatMoney(Number(row.total))}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {row.receivedAt ? formatDateTime(row.receivedAt) : '—'}
                        </td>
                      </tr>
                    ))
                  : null}
                {tab === 'waste'
                  ? data!.waste.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5 font-medium">{row.ingredientName}</td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatDecimal(row.quantity, 3)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatMoney(Number(row.cost ?? 0))}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {row.reason ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {row.userName ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </td>
                      </tr>
                    ))
                  : null}
                {tab === 'recipeCosts'
                  ? data!.recipeCosts.map((row) => (
                      <tr
                        key={`${row.menuItemId}-${row.sizeId ?? 'base'}-${row.version}`}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5 font-medium">{row.menuItemName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {row.sizeName ?? t('inventory.recipesPage.baseScope')}
                        </td>
                        <td className="numeric px-3 py-2.5 text-xs text-muted-foreground">
                          v{row.version}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatMoney(Number(row.ingredientCost))}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs">
                          {formatMoney(Number(row.sellingPrice))}
                        </td>
                        <td
                          className={cn(
                            'numeric px-3 py-2.5 text-end text-xs font-semibold',
                            row.marginPct < 20 ? 'text-destructive' : 'text-success',
                          )}
                        >
                          {row.marginPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('inventory.reports.footer', {
          from: formatDate(from),
          to: formatDate(to),
        })}
      </p>
    </div>
  );
}
