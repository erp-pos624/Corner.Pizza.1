import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, PackagePlus, Plus, ReceiptText, Truck } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import type { PurchaseOrderDto, PurchaseOrderStatus } from '@posshope/shared';
import { Button } from '../components/ui/button';
import { CreateOrderDialog } from '../components/purchasing/CreateOrderDialog';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Input, Select } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Pagination } from '../components/ui/pagination';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { formatDate, formatDateTime, formatDecimal, formatMoney } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { useI18n, type TranslationKey } from '../i18n';

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

function ReceiveDialog({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: PurchaseOrderDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');

  const lines = useMemo(
    () =>
      (order?.items ?? []).map((item) => ({
        item,
        remaining: item.quantity - item.receivedQuantity,
      })),
    [order],
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.purchasing.receive(order!.id, {
        supplierInvoiceNo: invoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        items: lines
          .map(({ item }) => ({
            purchaseOrderItemId: item.id,
            quantity: Number(quantities[item.id] || 0),
            unitCost: costs[item.id]?.trim() || undefined,
          }))
          .filter((line) => line.quantity > 0),
      }),
    onSuccess: () => {
      toast.success(t('inventory.purchasing.receivedToast'));
      onSaved();
      onOpenChange(false);
      setQuantities({});
      setCosts({});
      setInvoiceNo('');
      setNotes('');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.purchasing.receiveFailed')),
  });

  const hasQuantity = lines.some(({ item }) => Number(quantities[item.id] || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={order ? t('inventory.purchasing.receiveTitle', { number: order.orderNumber }) : ''}
        description={t('inventory.purchasing.receiveDescription')}
        className="max-w-2xl"
      >
        <div className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
          {lines.map(({ item, remaining }) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_100px_100px] items-center gap-2 rounded-lg border border-border px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.ingredientName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('inventory.purchasing.remaining', {
                    quantity: formatDecimal(remaining, 3),
                  })}{' '}
                  · {formatMoney(Number(item.unitPrice))}
                </p>
              </div>
              <Input
                type="number"
                min="0"
                max={remaining}
                step="0.001"
                value={quantities[item.id] ?? ''}
                placeholder="0"
                onChange={(event) =>
                  setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                }
                aria-label={t('inventory.purchasing.receiveQuantity')}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={costs[item.id] ?? ''}
                placeholder={item.unitPrice}
                onChange={(event) =>
                  setCosts((current) => ({ ...current, [item.id]: event.target.value }))
                }
                aria-label={t('inventory.purchasing.unitCost')}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-invoice" className="text-xs">
              {t('inventory.purchasing.supplierInvoice')}
            </Label>
            <Input
              id="po-invoice"
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-receive-notes" className="text-xs">
              {t('inventory.stores.notes')}
            </Label>
            <Input
              id="po-receive-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('inventory.purchasing.unitCostHint')}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !hasQuantity}>
            {mutation.isPending ? t('actions.saving') : t('inventory.purchasing.receiveGoods')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchasingPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canReceive = useAuthStore((state) => state.can('purchasing:receive'));
  const [tab, setTab] = useState<'orders' | 'receipts'>('orders');
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrderDto | null>(null);

  const orders = useQuery({
    queryKey: ['purchasing', 'orders', { status, page }],
    queryFn: () =>
      api.purchasing.orders({
        page,
        pageSize: 20,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const receipts = useQuery({
    queryKey: ['purchasing', 'receipts', page],
    queryFn: () => api.purchasing.receipts({ page, pageSize: 20 }),
    enabled: tab === 'receipts',
    placeholderData: (previous) => previous,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: () => api.suppliers.list({ page: 1, pageSize: 200 }),
    staleTime: 60_000,
  });

  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'purchase-options'],
    queryFn: () => api.inventory.ingredients({ page: 1, pageSize: 200, isActive: true }),
    staleTime: 60_000,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
  });

  const changeStatus = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'submit' | 'approve' | 'cancel';
    }) => api.purchasing.changeOrderStatus(id, { action }),
    onSuccess: () => {
      toast.success(t('inventory.purchasing.updated'));
      void queryClient.invalidateQueries({ queryKey: ['purchasing'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.purchasing.updateFailed')),
  });

  const orderRows = orders.data?.items ?? [];
  const receiptRows = receipts.data?.items ?? [];
  const ordersValue = orderRows.reduce((sum, order) => sum + Number(order.total), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('inventory.purchasing.orders')}
          value={String(orders.data?.total ?? 0)}
          hint={t('inventory.purchasing.ordersHint')}
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        <StatCard
          label={t('inventory.purchasing.value')}
          value={formatMoney(ordersValue)}
          hint={t('inventory.purchasing.valueHint')}
          icon={<Truck className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('inventory.purchasing.receipts')}
          value={String(receipts.data?.total ?? '—')}
          hint={t('inventory.purchasing.receiptsHint')}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="green"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {(['orders', 'receipts'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                setPage(1);
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {value === 'orders'
                ? t('inventory.purchasing.ordersTab')
                : t('inventory.purchasing.receiptsTab')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'orders' ? (
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PurchaseOrderStatus | '');
                setPage(1);
              }}
              className="h-9 w-44"
              aria-label={t('inventory.columns.status')}
            >
              <option value="">{t('inventory.purchasing.allStatuses')}</option>
              {(Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((value) => (
                <option key={value} value={value}>
                  {t(STATUS_LABEL[value])}
                </option>
              ))}
            </Select>
          ) : null}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('inventory.purchasing.newOrder')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {tab === 'orders' ? (
          orders.isLoading ? (
            <div className="h-64 animate-pulse bg-muted/30" />
          ) : orders.isError ? (
            <div className="p-4">
              <ErrorState
                title={t('inventory.purchasing.loadError')}
                message={orders.error instanceof Error ? orders.error.message : undefined}
                onRetry={() => void orders.refetch()}
              />
            </div>
          ) : orderRows.length === 0 ? (
            <EmptyPanel
              title={t('inventory.purchasing.empty')}
              message={t('inventory.purchasing.emptyMessage')}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-semibold">
                        {t('inventory.purchasing.orderNumber')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('inventory.columns.supplier')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.store')}</th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('inventory.columns.status')}
                      </th>
                      <th className="px-3 py-2.5 text-end font-semibold">
                        {t('inventory.purchasing.total')}
                      </th>
                      <th className="px-3 py-2.5 text-end font-semibold">
                        {t('inventory.purchasing.received')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('inventory.purchasing.expected')}
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5">
                          <p className="numeric text-xs font-semibold">{order.orderNumber}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(order.createdAt)} · {order.items.length}{' '}
                            {t('inventory.purchasing.lines')}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-xs">{order.supplierName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {order.branchName}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            tone={STATUS_TONE[order.status]}
                            label={t(STATUS_LABEL[order.status])}
                          />
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                          {formatMoney(Number(order.total))}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                          {formatMoney(Number(order.receivedTotal))}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {order.expectedAt ? formatDate(order.expectedAt) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            {order.status === 'DRAFT' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={changeStatus.isPending}
                                  onClick={() =>
                                    changeStatus.mutate({ id: order.id, action: 'submit' })
                                  }
                                >
                                  {t('inventory.purchasing.submit')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10"
                                  disabled={changeStatus.isPending}
                                  onClick={() =>
                                    changeStatus.mutate({ id: order.id, action: 'cancel' })
                                  }
                                >
                                  {t('actions.cancel')}
                                </Button>
                              </>
                            ) : null}
                            {order.status === 'PENDING' ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={changeStatus.isPending}
                                  onClick={() =>
                                    changeStatus.mutate({ id: order.id, action: 'approve' })
                                  }
                                >
                                  {t('inventory.purchasing.approve')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10"
                                  disabled={changeStatus.isPending}
                                  onClick={() =>
                                    changeStatus.mutate({ id: order.id, action: 'cancel' })
                                  }
                                >
                                  {t('actions.cancel')}
                                </Button>
                              </>
                            ) : null}
                            {(order.status === 'APPROVED' ||
                              order.status === 'PARTIALLY_RECEIVED') &&
                            canReceive ? (
                              <Button size="sm" onClick={() => setReceiveTarget(order)}>
                                <PackagePlus className="h-3.5 w-3.5" />
                                {t('inventory.purchasing.receiveGoods')}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {orders.data && orders.data.total > 0 ? (
                <Pagination
                  page={orders.data.page}
                  pageSize={orders.data.pageSize}
                  total={orders.data.total}
                  totalPages={orders.data.totalPages}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          )
        ) : receipts.isLoading ? (
          <div className="h-48 animate-pulse bg-muted/30" />
        ) : receiptRows.length === 0 ? (
          <EmptyPanel
            title={t('inventory.purchasing.receiptsEmpty')}
            message={t('inventory.purchasing.receiptsEmptyMessage')}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">
                      {t('inventory.purchasing.receiptNumber')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('inventory.purchasing.orderNumber')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('inventory.purchasing.supplierInvoice')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.purchasing.lines')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('inventory.purchasing.total')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('inventory.purchasing.receivedAt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receiptRows.map((receipt) => (
                    <tr
                      key={receipt.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                    >
                      <td className="numeric px-3 py-2.5 text-xs font-semibold">
                        {receipt.receiptNumber}
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs">
                        {receipt.purchaseOrderNumber}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {receipt.supplierInvoiceNo ?? '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs">
                        {receipt.items.length}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs font-semibold">
                        {formatMoney(Number(receipt.total))}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                        {formatDateTime(receipt.receivedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {receipts.data && receipts.data.total > 0 ? (
              <Pagination
                page={receipts.data.page}
                pageSize={receipts.data.pageSize}
                total={receipts.data.total}
                totalPages={receipts.data.totalPages}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </div>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers.data?.items ?? []}
        ingredients={ingredients.data?.items ?? []}
        branches={role === 'ADMIN' ? (branches.data ?? []) : []}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['purchasing'] });
        }}
      />

      <ReceiveDialog
        order={receiveTarget}
        open={receiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReceiveTarget(null);
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['purchasing'] });
          void queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />
    </div>
  );
}
