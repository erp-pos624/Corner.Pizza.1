import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Eye } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { StocktakeDto, StocktakeStatus } from '@posshope/shared';
import type { InventoryManagement } from '../../hooks/useInventoryManagement';
import { api } from '../../lib/api';
import { formatDateTime, formatDecimal, formatNumber, unitLabel } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { useI18n, type TranslationKey } from '../../i18n';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Pagination } from '../ui/pagination';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';
import { toast } from '../ui/toast';
import { cn } from '../../lib/utils';

const STATUS_LABEL_KEY: Record<StocktakeStatus, TranslationKey> = {
  DRAFT: 'inventory.stocktake.status.draft',
  COMPLETED: 'inventory.stocktake.status.completed',
  CANCELLED: 'inventory.stocktake.status.cancelled',
};

const STATUS_TONE: Record<StocktakeStatus, 'neutral' | 'green' | 'red'> = {
  DRAFT: 'neutral',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export function StocktakesTab({ inventory }: { inventory: InventoryManagement }): ReactElement {
  const { t } = useI18n();
  const canManage = useAuthStore((state) => state.can('stocktakes:manage'));
  const { stocktakes, setStocktakePage, invalidate } = inventory;
  const [detail, setDetail] = useState<StocktakeDto | null>(null);
  const [confirmKind, setConfirmKind] = useState<'complete' | 'cancel' | null>(null);

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'complete' | 'cancel' }) =>
      kind === 'complete'
        ? api.inventory.completeStocktake(id)
        : api.inventory.cancelStocktake(id),
    onSuccess: (data, variables) => {
      toast.success(
        variables.kind === 'complete'
          ? t('inventory.stocktake.completedToast')
          : t('inventory.stocktake.cancelledToast'),
      );
      setDetail(data);
      setConfirmKind(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('inventory.stocktake.errorGeneric'),
      ),
  });

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {stocktakes.isLoading ? (
        <SkeletonTable
          label={t('inventory.stocktake.loading')}
          rows={6}
          columns={[
            { kind: 'text', label: t('inventory.stocktake.reference') },
            { kind: 'badge', label: t('inventory.columns.status') },
            { kind: 'amount', label: t('inventory.stocktake.items', { count: 0 }) },
            { kind: 'muted', label: t('inventory.stocktake.createdBy') },
            { kind: 'muted', label: t('inventory.stocktake.created') },
            { kind: 'actions' },
          ]}
        />
      ) : stocktakes.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('inventory.stocktake.error')}
            message={stocktakes.error instanceof Error ? stocktakes.error.message : undefined}
            onRetry={() => void stocktakes.refetch()}
          />
        </div>
      ) : stocktakes.data && stocktakes.data.items.length === 0 ? (
        <EmptyPanel
          title={t('inventory.stocktake.empty')}
          message={t('inventory.stocktake.emptyMessage')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">
                  {t('inventory.stocktake.reference')}
                </th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.status')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.quantity')}
                </th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.stocktake.createdBy')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.stocktake.created')}</th>
                <th className="px-3 py-2.5 font-semibold">
                  {t('inventory.stocktake.completedAt')}
                </th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {stocktakes.data!.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="numeric px-3 py-2.5 text-xs font-semibold">{row.reference}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      tone={STATUS_TONE[row.status]}
                      label={t(STATUS_LABEL_KEY[row.status])}
                    />
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs">
                    {formatNumber(row.items.length)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.createdByName}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {row.completedAt ? formatDateTime(row.completedAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetail(row)}
                        aria-label={t('inventory.stocktake.view', { reference: row.reference })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t('actions.view')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stocktakes.data && stocktakes.data.total > 0 ? (
        <Pagination
          page={stocktakes.data.page}
          pageSize={stocktakes.data.pageSize}
          total={stocktakes.data.total}
          totalPages={stocktakes.data.totalPages}
          onPageChange={setStocktakePage}
        />
      ) : null}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent
          title={
            detail
              ? t('inventory.stocktake.detailTitle', { reference: detail.reference })
              : t('inventory.stocktake.newTitle')
          }
          description={
            detail
              ? t('inventory.stocktake.detailDescription', {
                  date: formatDateTime(detail.createdAt),
                })
              : undefined
          }
          className="max-w-2xl"
        >
          {detail ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge
                  tone={STATUS_TONE[detail.status]}
                  label={t(STATUS_LABEL_KEY[detail.status])}
                />
                <span>{t('inventory.stocktake.createdBy')}: {detail.createdByName}</span>
                <span>·</span>
                <span>{t('inventory.stocktake.items', { count: detail.items.length })}</span>
                {detail.completedAt ? (
                  <>
                    <span>·</span>
                    <span>
                      {t('inventory.stocktake.completedAt')}: {formatDateTime(detail.completedAt)}
                    </span>
                  </>
                ) : null}
              </div>
              {detail.notes ? (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  {detail.notes}
                </p>
              ) : null}
              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">{t('inventory.columns.ingredient')}</th>
                      <th className="px-3 py-2 text-end font-semibold">
                        {t('inventory.stocktake.expected')}
                      </th>
                      <th className="px-3 py-2 text-end font-semibold">
                        {t('inventory.stocktake.counted')}
                      </th>
                      <th className="px-3 py-2 text-end font-semibold">
                        {t('inventory.stocktake.difference')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-t border-border/70">
                        <td className="px-3 py-2">
                          <span className="font-medium">{item.ingredientName}</span>
                          <span className="ms-1 text-[10px] text-muted-foreground">
                            {unitLabel(item.unit)}
                          </span>
                        </td>
                        <td className="numeric px-3 py-2 text-end text-xs text-muted-foreground">
                          {formatDecimal(item.expectedQty, 3)}
                        </td>
                        <td className="numeric px-3 py-2 text-end text-xs font-semibold">
                          {formatDecimal(item.countedQty, 3)}
                        </td>
                        <td
                          className={cn(
                            'numeric px-3 py-2 text-end text-xs font-semibold',
                            item.variance > 0
                              ? 'text-success'
                              : item.variance < 0
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                          )}
                        >
                          {item.variance > 0 ? '+' : ''}
                          {formatDecimal(item.variance, 3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                {t('inventory.stocktake.varianceHint')}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t('inventory.stocktake.close')}
            </Button>
            {detail && detail.status === 'DRAFT' && canManage ? (
              <>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmKind('cancel')}
                  disabled={action.isPending}
                >
                  {t('inventory.stocktake.cancelLabel')}
                </Button>
                <Button
                  onClick={() => setConfirmKind('complete')}
                  disabled={action.isPending}
                >
                  {action.isPending && confirmKind === 'complete'
                    ? t('inventory.stocktake.completing')
                    : t('inventory.stocktake.complete')}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
        title={
          confirmKind === 'complete'
            ? t('inventory.stocktake.completeTitle')
            : t('inventory.stocktake.cancelTitle')
        }
        description={
          confirmKind === 'complete'
            ? t('inventory.stocktake.completeDescription')
            : t('inventory.stocktake.cancelDescription')
        }
        confirmLabel={
          confirmKind === 'complete'
            ? t('inventory.stocktake.completeLabel')
            : t('inventory.stocktake.cancelLabel')
        }
        destructive
        busy={action.isPending}
        onConfirm={() => {
          if (detail && confirmKind) action.mutate({ id: detail.id, kind: confirmKind });
        }}
      />
    </div>
  );
}
