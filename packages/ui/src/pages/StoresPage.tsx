import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Building2,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import type { IngredientDto, StockTransferDto, TransferStatus } from '@posshope/shared';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input, Select, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Pagination } from '../components/ui/pagination';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import {
  formatDateTime,
  formatDecimal,
  formatMoney,
  unitLabel,
} from '../lib/format';
import { useAuthStore } from '../store/auth';
import { useI18n, type TranslationKey } from '../i18n';

const TRANSFER_TONE: Record<TransferStatus, 'neutral' | 'blue' | 'green' | 'red'> = {
  DRAFT: 'neutral',
  IN_TRANSIT: 'blue',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

const TRANSFER_LABEL: Record<TransferStatus, TranslationKey> = {
  DRAFT: 'inventory.stores.status.draft',
  IN_TRANSIT: 'inventory.stores.status.inTransit',
  RECEIVED: 'inventory.stores.status.received',
  CANCELLED: 'inventory.stores.status.cancelled',
};

interface TransferRow {
  key: string;
  ingredientId: string;
  quantity: string;
}

function TransferDialog({
  open,
  onOpenChange,
  branches,
  ingredients,
  defaultFrom,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Array<{ id: string; name: string }>;
  ingredients: IngredientDto[];
  defaultFrom: string;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [fromBranchId, setFromBranchId] = useState(defaultFrom);
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<TransferRow[]>([
    { key: 'row-1', ingredientId: '', quantity: '1' },
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      api.inventory.createTransfer({
        fromBranchId,
        toBranchId,
        notes: notes.trim() || undefined,
        items: rows
          .filter((row) => row.ingredientId && Number(row.quantity) > 0)
          .map((row) => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) })),
      }),
    onSuccess: () => {
      toast.success(t('inventory.stores.transferCreated'));
      onSaved();
      onOpenChange(false);
      setRows([{ key: 'row-1', ingredientId: '', quantity: '1' }]);
      setNotes('');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.stores.transferFailed')),
  });

  const valid =
    fromBranchId &&
    toBranchId &&
    fromBranchId !== toBranchId &&
    rows.some((row) => row.ingredientId && Number(row.quantity) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('inventory.stores.newTransfer')}
        description={t('inventory.stores.newTransferDescription')}
        className="max-w-2xl"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-from" className="text-xs">
              {t('inventory.stores.from')}
            </Label>
            <Select
              id="transfer-from"
              value={fromBranchId}
              onChange={(event) => setFromBranchId(event.target.value)}
            >
              <option value="">{t('inventory.stores.chooseStore')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-to" className="text-xs">
              {t('inventory.stores.to')}
            </Label>
            <Select
              id="transfer-to"
              value={toBranchId}
              onChange={(event) => setToBranchId(event.target.value)}
            >
              <option value="">{t('inventory.stores.chooseStore')}</option>
              {branches
                .filter((branch) => branch.id !== fromBranchId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
              <Select
                value={row.ingredientId}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, ingredientId: event.target.value }
                        : entry,
                    ),
                  )
                }
                aria-label={t('inventory.columns.ingredient')}
              >
                <option value="">{t('inventory.stores.chooseIngredient')}</option>
                {ingredients.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name} ({unitLabel(ingredient.unit)})
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={row.quantity}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.key === row.key ? { ...entry, quantity: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={t('inventory.columns.quantity')}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('actions.remove')}
                onClick={() =>
                  setRows((current) =>
                    current.length === 1
                      ? current
                      : current.filter((entry) => entry.key !== row.key),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: `row-${Date.now()}`, ingredientId: '', quantity: '1' },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            {t('inventory.stores.addLine')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="transfer-notes" className="text-xs">
            {t('inventory.stores.notes')}
          </Label>
          <Textarea
            id="transfer-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={400}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !valid}>
            {mutation.isPending ? t('actions.saving') : t('inventory.stores.createTransfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StoresPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canManage = useAuthStore((state) => state.can('transfers:manage'));
  const [tab, setTab] = useState<'stock' | 'transfers'>('stock');
  const [branchFilter, setBranchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [transferPage, setTransferPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const stores = useQuery({
    queryKey: ['inventory', 'stores'],
    queryFn: () => api.inventory.stores(),
    staleTime: 30_000,
  });

  const stock = useQuery({
    queryKey: ['inventory', 'store-stock', { branchFilter, search }],
    queryFn: () =>
      api.inventory.storeStock({
        branchId: branchFilter || undefined,
        q: search || undefined,
      }),
    staleTime: 15_000,
  });

  const transfers = useQuery({
    queryKey: ['inventory', 'transfers', transferPage],
    queryFn: () => api.inventory.transfers({ page: transferPage, pageSize: 20 }),
    enabled: tab === 'transfers',
    placeholderData: (previous) => previous,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
  });

  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'transfer-options'],
    queryFn: () => api.inventory.ingredients({ page: 1, pageSize: 200, isActive: true }),
    staleTime: 60_000,
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TransferStatus }) =>
      api.inventory.updateTransferStatus(id, status),
    onSuccess: () => {
      toast.success(t('inventory.stores.transferUpdated'));
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.stores.transferFailed')),
  });

  const storeRows = useMemo(() => stores.data ?? [], [stores.data]);
  const stockRows = stock.data ?? [];
  const totals = useMemo(
    () => ({
      stores: storeRows.length,
      value: storeRows.reduce((sum, row) => sum + Number(row.stockValue), 0),
      low: storeRows.reduce((sum, row) => sum + row.lowCount, 0),
      out: storeRows.reduce((sum, row) => sum + row.outCount, 0),
    }),
    [storeRows],
  );

  const transferRows = transfers.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label={t('inventory.stores.stores')}
          value={String(totals.stores)}
          hint={t('inventory.stores.storesHint')}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label={t('inventory.stores.value')}
          value={formatMoney(totals.value)}
          hint={t('inventory.stores.valueHint')}
          icon={<Truck className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('inventory.stores.low')}
          value={String(totals.low)}
          hint={t('inventory.stores.lowHint')}
          icon={<PackageCheck className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label={t('inventory.stores.out')}
          value={String(totals.out)}
          hint={t('inventory.stores.outHint')}
          icon={<ArrowLeftRight className="h-4 w-4" />}
          tone="red"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {(['stock', 'transfers'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {value === 'stock' ? t('inventory.stores.stockTab') : t('inventory.stores.transfersTab')}
            </button>
          ))}
        </div>
        {tab === 'transfers' ? (
          <Button onClick={() => setDialogOpen(true)} disabled={!canManage}>
            <Plus className="h-4 w-4" />
            {t('inventory.stores.newTransfer')}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('inventory.stores.search')}
                className="h-9 w-56 ps-8"
              />
            </div>
            <Select
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              className="h-9 w-52"
              aria-label={t('inventory.stores.filterStore')}
            >
              <option value="">{t('inventory.stores.allStores')}</option>
              {storeRows.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {tab === 'stock' ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          {stock.isLoading ? (
            <div className="h-64 animate-pulse bg-muted/30" />
          ) : stock.isError ? (
            <div className="p-4">
              <ErrorState
                title={t('inventory.stores.loadError')}
                message={stock.error instanceof Error ? stock.error.message : undefined}
                onRetry={() => void stock.refetch()}
              />
            </div>
          ) : stockRows.length === 0 ? (
            <EmptyPanel
              title={t('inventory.stores.stockEmpty')}
              message={t('inventory.stores.stockEmptyMessage')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.ingredient')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.store')}</th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.columns.inStock')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.columns.minimum')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.ingredient.reorder')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.columns.value')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.columns.status')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr
                      key={`${row.branchId}-${row.ingredientId}`}
                      className={cn(
                        'border-b border-border/70 last:border-0 hover:bg-muted/30',
                        row.isOut && 'bg-destructive/[0.04]',
                        !row.isOut && row.isLow && 'bg-amber-50/60',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.ingredientName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.categoryName ?? '—'} · {unitLabel(row.unit)}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.branchName}</td>
                      <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                        {formatDecimal(row.currentStock, 3)}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                        {formatDecimal(row.minStock, 3)}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                        {formatDecimal(row.reorderPoint, 3)}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs">
                        {formatMoney(Number(row.stockValue))}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <StatusBadge
                          tone={row.isOut ? 'red' : row.isLow ? 'orange' : 'green'}
                          label={
                            row.isOut
                              ? t('inventory.alerts.typeOut')
                              : row.isLow
                                ? t('inventory.alerts.typeLow')
                                : t('inventory.badges.healthy')
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          {transfers.isLoading ? (
            <div className="h-48 animate-pulse bg-muted/30" />
          ) : transferRows.length === 0 ? (
            <EmptyPanel
              title={t('inventory.stores.transfersEmpty')}
              message={t('inventory.stores.transfersEmptyMessage')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.stores.reference')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.stores.route')}</th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.stores.lines')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.status')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('inventory.stores.created')}</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {transferRows.map((transfer: StockTransferDto) => (
                    <tr
                      key={transfer.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                    >
                      <td className="numeric px-3 py-2.5 text-xs font-semibold">
                        {transfer.reference}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className="font-medium">{transfer.fromBranchName}</span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="font-medium">{transfer.toBranchName}</span>
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs">
                        {transfer.items.length}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          tone={TRANSFER_TONE[transfer.status]}
                          label={t(TRANSFER_LABEL[transfer.status])}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                        {formatDateTime(transfer.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canManage && transfer.status === 'DRAFT' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={changeStatus.isPending}
                                onClick={() =>
                                  changeStatus.mutate({ id: transfer.id, status: 'IN_TRANSIT' })
                                }
                              >
                                {t('inventory.stores.dispatch')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10"
                                disabled={changeStatus.isPending}
                                onClick={() =>
                                  changeStatus.mutate({ id: transfer.id, status: 'CANCELLED' })
                                }
                              >
                                {t('actions.cancel')}
                              </Button>
                            </>
                          ) : null}
                          {canManage && transfer.status === 'IN_TRANSIT' ? (
                            <Button
                              size="sm"
                              disabled={changeStatus.isPending}
                              onClick={() =>
                                changeStatus.mutate({ id: transfer.id, status: 'RECEIVED' })
                              }
                            >
                              {t('inventory.stores.receive')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {transfers.data && transfers.data.total > 0 ? (
            <Pagination
              page={transfers.data.page}
              pageSize={transfers.data.pageSize}
              total={transfers.data.total}
              totalPages={transfers.data.totalPages}
              onPageChange={setTransferPage}
            />
          ) : null}
        </div>
      )}

      <TransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branches={(branches.data ?? []).filter((branch) => branch.isActive)}
        ingredients={ingredients.data?.items ?? []}
        defaultFrom={branchFilter}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />
    </div>
  );
}
