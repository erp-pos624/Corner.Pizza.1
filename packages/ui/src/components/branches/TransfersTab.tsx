import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowRightLeft, Eye, Plus, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { StockTransferDto, TransferStatus } from '@posshope/shared';
import { useI18n, type TranslationKey } from '../../i18n';
import { api } from '../../lib/api';
import { formatDateTime, formatDecimal, formatNumber, unitLabel } from '../../lib/format';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Select } from '../ui/input';
import { Pagination } from '../ui/pagination';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';
import { toast } from '../ui/toast';
import { TransferCreateDialog } from './TransferCreateDialog';

const PAGE_SIZE = 10;

const STATUS_LABEL_KEY: Record<TransferStatus, TranslationKey> = {
  DRAFT: 'branches.transfers.status.DRAFT',
  IN_TRANSIT: 'branches.transfers.status.IN_TRANSIT',
  RECEIVED: 'branches.transfers.status.RECEIVED',
  CANCELLED: 'branches.transfers.status.CANCELLED',
};

const STATUS_TONE: Record<TransferStatus, 'neutral' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'neutral',
  IN_TRANSIT: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

const STATUSES: TransferStatus[] = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

type ConfirmKind = 'send' | 'receive' | 'cancel';

export function TransfersTab(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TransferStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<StockTransferDto | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; transfer: StockTransferDto } | null>(
    null,
  );

  const transfers = useQuery({
    queryKey: ['branches', 'transfers', { page, status }],
    queryFn: () =>
      api.inventory.transfers({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['branches', 'transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const updateStatus = useMutation({
    mutationFn: ({ transfer, kind }: { transfer: StockTransferDto; kind: ConfirmKind }) =>
      api.inventory.updateTransferStatus(
        transfer.id,
        kind === 'send' ? 'IN_TRANSIT' : kind === 'receive' ? 'RECEIVED' : 'CANCELLED',
      ),
    onSuccess: (updated, variables) => {
      toast.success(
        variables.kind === 'send'
          ? t('branches.transfers.sendToast')
          : variables.kind === 'receive'
            ? t('branches.transfers.receiveToast')
            : t('branches.transfers.cancelToast'),
      );
      if (detail?.id === updated.id) setDetail(updated);
      setConfirm(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('branches.transfers.errors.update'));
      setConfirm(null);
    },
  });

  const confirmCopy = (entry: { kind: ConfirmKind; transfer: StockTransferDto }): {
    title: string;
    description: string;
    label: string;
    destructive: boolean;
  } => {
    if (entry.kind === 'send') {
      return {
        title: t('branches.transfers.sendTitle'),
        description: t('branches.transfers.sendDescription', {
          from: entry.transfer.fromBranchName,
          to: entry.transfer.toBranchName,
        }),
        label: t('branches.transfers.sendLabel'),
        destructive: false,
      };
    }
    if (entry.kind === 'receive') {
      return {
        title: t('branches.transfers.receiveTitle'),
        description: t('branches.transfers.receiveDescription', {
          to: entry.transfer.toBranchName,
        }),
        label: t('branches.transfers.receiveLabel'),
        destructive: false,
      };
    }
    return {
      title: t('branches.transfers.cancelTitle'),
      description: t('branches.transfers.cancelDescription'),
      label: t('branches.transfers.cancelLabel'),
      destructive: true,
    };
  };

  const rows = transfers.data?.items ?? [];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('branches.tabs.transfers')}</h2>
        </div>
        <Select
          aria-label={t('branches.transfers.filterAria')}
          className="h-9 w-[150px]"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as TransferStatus | '');
            setPage(1);
          }}
        >
          <option value="">{t('branches.transfers.allStatuses')}</option>
          {STATUSES.map((entry) => (
            <option key={entry} value={entry}>
              {t(STATUS_LABEL_KEY[entry])}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('branches.transfers.new')}
        </Button>
      </div>

      {transfers.isLoading ? (
        <SkeletonTable
          label={t('branches.transfers.loading')}
          rows={6}
          columns={[
            { kind: 'text', label: t('branches.transfers.columns.reference') },
            { kind: 'text', label: t('branches.transfers.columns.route') },
            { kind: 'badge', label: t('branches.transfers.columns.status') },
            { kind: 'amount', label: t('branches.transfers.columns.items') },
            { kind: 'muted', label: t('branches.transfers.columns.createdBy') },
            { kind: 'muted', label: t('branches.transfers.columns.created') },
            { kind: 'actions' },
          ]}
        />
      ) : transfers.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('branches.transfers.errors.load')}
            message={transfers.error instanceof Error ? transfers.error.message : undefined}
            onRetry={() => void transfers.refetch()}
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyPanel
          title={
            status ? t('branches.transfers.filteredEmpty') : t('branches.transfers.empty.title')
          }
          message={status ? undefined : t('branches.transfers.empty.message')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">
                  {t('branches.transfers.columns.reference')}
                </th>
                <th className="px-3 py-2.5 font-semibold">
                  {t('branches.transfers.columns.route')}
                </th>
                <th className="px-3 py-2.5 font-semibold">
                  {t('branches.transfers.columns.status')}
                </th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('branches.transfers.columns.items')}
                </th>
                <th className="px-3 py-2.5 font-semibold">
                  {t('branches.transfers.columns.createdBy')}
                </th>
                <th className="px-3 py-2.5 font-semibold">
                  {t('branches.transfers.columns.created')}
                </th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="numeric px-3 py-2.5 text-xs font-semibold">{row.reference}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{row.fromBranchName}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground rtl:-scale-x-100" />
                      <span className="font-medium">{row.toBranchName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      tone={STATUS_TONE[row.status]}
                      label={t(STATUS_LABEL_KEY[row.status])}
                    />
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs">
                    {formatNumber(row.items.length)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.createdByName}</td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetail(row)}
                        aria-label={t('branches.transfers.viewAria')}
                        title={t('branches.transfers.viewAria')}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {row.status === 'DRAFT' ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => setConfirm({ kind: 'send', transfer: row })}
                          >
                            <ArrowRightLeft className="h-3 w-3 rtl:-scale-x-100" />
                            {t('branches.transfers.send')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirm({ kind: 'cancel', transfer: row })}
                            aria-label={t('branches.transfers.cancelLabel')}
                            title={t('branches.transfers.cancelLabel')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : row.status === 'IN_TRANSIT' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px]"
                          onClick={() => setConfirm({ kind: 'receive', transfer: row })}
                        >
                          {t('branches.transfers.receive')}
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
          onPageChange={setPage}
        />
      ) : null}

      <TransferCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent
          title={
            detail
              ? t('branches.transfers.detail.title', { reference: detail.reference })
              : t('branches.tabs.transfers')
          }
          description={
            detail
              ? t('branches.transfers.detail.description', {
                  from: detail.fromBranchName,
                  to: detail.toBranchName,
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
                <span>
                  {t('branches.transfers.columns.createdBy')}: {detail.createdByName}
                </span>
                <span>·</span>
                <span>{formatDateTime(detail.createdAt)}</span>
                {detail.receivedAt ? (
                  <>
                    <span>·</span>
                    <span>
                      {t('branches.transfers.detail.receivedAt')}:{' '}
                      {formatDateTime(detail.receivedAt)}
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
                      <th className="px-3 py-2 font-semibold">
                        {t('branches.transfers.detail.ingredient')}
                      </th>
                      <th className="px-3 py-2 text-end font-semibold">
                        {t('branches.transfers.detail.quantity')}
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
                        <td className="numeric px-3 py-2 text-end text-xs font-semibold">
                          {formatDecimal(item.quantity, 3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t('branches.transfers.detail.close')}
            </Button>
            {detail?.status === 'DRAFT' ? (
              <>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirm({ kind: 'cancel', transfer: detail })}
                  disabled={updateStatus.isPending}
                >
                  {t('branches.transfers.cancelLabel')}
                </Button>
                <Button
                  onClick={() => setConfirm({ kind: 'send', transfer: detail })}
                  disabled={updateStatus.isPending}
                >
                  {t('branches.transfers.sendLabel')}
                </Button>
              </>
            ) : detail?.status === 'IN_TRANSIT' ? (
              <Button
                onClick={() => setConfirm({ kind: 'receive', transfer: detail })}
                disabled={updateStatus.isPending}
              >
                {t('branches.transfers.receiveLabel')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? confirmCopy(confirm).title : ''}
        description={confirm ? confirmCopy(confirm).description : ''}
        confirmLabel={confirm ? confirmCopy(confirm).label : ''}
        destructive={confirm ? confirmCopy(confirm).destructive : false}
        busy={updateStatus.isPending}
        onConfirm={() => {
          if (confirm) updateStatus.mutate(confirm);
        }}
      />
    </div>
  );
}
