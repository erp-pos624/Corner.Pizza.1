import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Pencil, Plus, ReceiptText, Tag, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseDto,
} from '@posshope/shared';
import { ExpenseDialog } from '../components/expenses/ExpenseDialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Input, Select } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Pagination } from '../components/ui/pagination';
import { StatCard } from '../components/ui/stat-card';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { ALL_BRANCHES } from '../lib/branch-scope';
import { formatDate, formatMoney, todayIso } from '../lib/format';
import { useAuthStore } from '../store/auth';
import { useBranchScopeStore } from '../store/branch';

const PAGE_SIZE = 20;

function firstOfMonth(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

export function ExpensesPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((state) => state.can('expenses:write'));
  const scope = useBranchScopeStore((state) => state.scope);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayIso);
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const [deleting, setDeleting] = useState<ExpenseDto | null>(null);

  const expenses = useQuery({
    queryKey: ['expenses', { from, to, category, page, scope }],
    queryFn: () =>
      api.expenses.list({
        page,
        pageSize: PAGE_SIZE,
        from,
        to,
        category: category || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['expenses', 'summary', { from, to, category, scope }],
    queryFn: () => api.expenses.summary({ from, to, category: category || undefined }),
    staleTime: 30_000,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: canWrite,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.expenses.remove(id),
    onSuccess: () => {
      toast.success(t('expenses.toast.deleted'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('expenses.error')),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const rows = expenses.data?.items ?? [];
  const summaryData = summary.data;
  const top = summaryData?.byCategory[0];
  const defaultBranchId = scope !== ALL_BRANCHES ? scope : undefined;

  const openCreate = (): void => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('expenses.stats.total')}
          value={summaryData ? formatMoney(summaryData.total) : '—'}
          hint={t('expenses.stats.totalHint')}
          icon={<Coins className="h-4 w-4" />}
          tone="red"
        />
        <StatCard
          label={t('expenses.stats.entries')}
          value={summaryData ? String(summaryData.count) : '—'}
          hint={t('expenses.stats.entriesHint')}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label={t('expenses.stats.top')}
          value={
            top
              ? t(`expenses.categories.${top.category}` as TranslationKey)
              : t('expenses.stats.none')
          }
          hint={
            top
              ? t('expenses.stats.topHint', {
                  amount: formatMoney(top.amount),
                  count: top.count,
                })
              : undefined
          }
          icon={<Tag className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <div>
            <Label htmlFor="expenses-from" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('expenses.filters.from')}
            </Label>
            <Input
              id="expenses-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-36"
            />
          </div>
          <div>
            <Label htmlFor="expenses-to" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('expenses.filters.to')}
            </Label>
            <Input
              id="expenses-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-36"
            />
          </div>
          <div>
            <Label
              htmlFor="expenses-category"
              className="text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              {t('expenses.filters.category')}
            </Label>
            <Select
              id="expenses-category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as ExpenseCategory | '');
                setPage(1);
              }}
              className="mt-1 w-44"
            >
              <option value="">{t('expenses.filters.allCategories')}</option>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`expenses.categories.${value}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void expenses.refetch();
                void summary.refetch();
              }}
            >
              {t('actions.refresh')}
            </Button>
            {canWrite ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {t('expenses.form.create')}
              </Button>
            ) : null}
          </div>
        </div>

        {expenses.isLoading ? (
          <div className="h-48 animate-pulse bg-muted/30" />
        ) : expenses.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('expenses.error')}
              message={expenses.error instanceof Error ? expenses.error.message : undefined}
              onRetry={() => void expenses.refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyPanel title={t('expenses.empty.title')} message={t('expenses.empty.message')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('expenses.table.date')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('expenses.table.category')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('expenses.table.description')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('expenses.table.branch')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('expenses.table.recordedBy')}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{t('expenses.table.amount')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDate(row.expenseDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">
                        {t(`expenses.categories.${row.category}` as TranslationKey)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.description}</p>
                      {row.notes ? (
                        <p className="text-[11px] text-muted-foreground">{row.notes}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.branchName ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.createdByName ?? '—'}
                    </td>
                    <td className="numeric px-3 py-2.5 text-end text-sm font-semibold">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      {canWrite ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('actions.edit')}
                            onClick={() => {
                              setEditing(row);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('actions.delete')}
                            onClick={() => setDeleting(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expenses.data && expenses.data.total > 0 ? (
          <Pagination
            page={expenses.data.page}
            pageSize={expenses.data.pageSize}
            total={expenses.data.total}
            totalPages={expenses.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        branches={branches.data ?? []}
        defaultBranchId={defaultBranchId}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('expenses.delete.title')}
        description={t('expenses.delete.message', { description: deleting?.description ?? '' })}
        confirmLabel={t('expenses.delete.confirm')}
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}
