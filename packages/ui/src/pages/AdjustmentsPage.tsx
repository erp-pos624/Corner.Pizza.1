import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import {
  isDeductionCategory,
  type AdjustmentCategory,
  type AdjustmentDto,
} from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Input, Select } from '../components/ui/input';
import { Pagination } from '../components/ui/pagination';
import { SkeletonTable } from '../components/ui/skeleton';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { AdjustmentDialog } from '../components/hr/AdjustmentDialog';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import {
  adjustmentCategoryLabel,
  currentMonthKey,
  monthLabel,
} from '../lib/hr';

const PAGE_SIZE = 20;

export function AdjustmentsPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonthKey());
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState<AdjustmentCategory | ''>('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdjustmentDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdjustmentDto | null>(null);

  useEffect(() => {
    setPage(1);
  }, [month, employeeId, category]);

  const employees = useQuery({
    queryKey: ['hr', 'employees', { options: true }],
    queryFn: () => api.hr.employees({ page: 1, pageSize: 200, status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const payroll = useQuery({
    queryKey: ['hr', 'payroll', { month }],
    queryFn: () => api.hr.payrollMonth(month),
  });
  const locked = payroll.data?.run?.status === 'CLOSED';

  const adjustments = useQuery({
    queryKey: ['hr', 'adjustments', { page, month, employeeId, category }],
    queryFn: () =>
      api.hr.adjustments({
        page,
        pageSize: PAGE_SIZE,
        payrollMonth: month,
        employeeId: employeeId || undefined,
        category: category || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (adjustment: AdjustmentDto) => api.hr.removeAdjustment(adjustment.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      toast.success(t('hr.adjustments.deleted'));
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hr.adjustments.saveFailed'));
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-9 w-[150px]"
            aria-label={t('hr.adjustments.month')}
          />

          <Select
            aria-label={t('hr.adjustments.employee')}
            className="h-9 w-[190px]"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">{t('hr.adjustments.allEmployees')}</option>
            {(employees.data?.items ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </Select>

          <Select
            aria-label={t('hr.adjustments.category')}
            className="h-9 w-[200px]"
            value={category}
            onChange={(event) => setCategory(event.target.value as AdjustmentCategory | '')}
          >
            <option value="">{t('hr.adjustments.allCategories')}</option>
            <option value="PERFORMANCE_BONUS">{t('hr.adjustments.categoryPerformanceBonus')}</option>
            <option value="OVERTIME">{t('hr.adjustments.categoryOvertime')}</option>
            <option value="OTHER_BONUS">{t('hr.adjustments.categoryOtherBonus')}</option>
            <option value="LATE_ARRIVAL">{t('hr.adjustments.categoryLateArrival')}</option>
            <option value="ABSENCE">{t('hr.adjustments.categoryAbsence')}</option>
            <option value="OTHER_DEDUCTION">{t('hr.adjustments.categoryOtherDeduction')}</option>
          </Select>

          <span className="text-xs text-muted-foreground">{monthLabel(month)}</span>

          <Button
            size="sm"
            className="ms-auto"
            disabled={locked}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('hr.adjustments.add')}
          </Button>
        </div>

        {locked ? (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
            <Lock className="h-3.5 w-3.5" />
            <span>
              <strong>{t('hr.adjustments.locked')}</strong> — {t('hr.adjustments.lockedBody')}
            </span>
          </div>
        ) : null}

        {adjustments.isLoading ? (
          <SkeletonTable
            label={t('states.loadingData')}
            rows={6}
            columns={[
              { kind: 'avatar', label: t('hr.adjustments.columns.employee') },
              { kind: 'muted', label: t('hr.adjustments.columns.date') },
              { kind: 'badge', label: t('hr.adjustments.columns.category') },
              { kind: 'muted', label: t('hr.adjustments.columns.amount') },
              { kind: 'muted', label: t('hr.adjustments.columns.reason') },
              { kind: 'actions' },
            ]}
          />
        ) : adjustments.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('states.error')}
              message={adjustments.error instanceof Error ? adjustments.error.message : undefined}
              onRetry={() => void adjustments.refetch()}
            />
          </div>
        ) : adjustments.data && adjustments.data.items.length === 0 ? (
          <EmptyPanel
            title={t('hr.adjustments.empty')}
            message={t('hr.adjustments.emptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.adjustments.columns.employee')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.adjustments.columns.date')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.adjustments.columns.category')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('hr.adjustments.columns.amount')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.adjustments.columns.reason')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.adjustments.columns.month')}
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {adjustments.data!.items.map((adjustment) => {
                  const deduction = isDeductionCategory(adjustment.category);
                  return (
                    <tr
                      key={adjustment.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{adjustment.employeeName}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {adjustment.employeeCode}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{formatDate(adjustment.date)}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={deduction ? 'destructive' : 'success'}>
                          {adjustmentCategoryLabel(adjustment.category)}
                        </Badge>
                      </td>
                      <td
                        className={`numeric px-3 py-2.5 text-end font-semibold ${
                          deduction ? 'text-destructive' : 'text-success'
                        }`}
                      >
                        {deduction ? '−' : '+'}
                        {formatMoney(adjustment.amount)}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="line-clamp-2">{adjustment.reason}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {monthLabel(adjustment.payrollMonth)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={locked}
                            onClick={() => {
                              setEditing(adjustment);
                              setDialogOpen(true);
                            }}
                            aria-label={t('actions.edit')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={locked}
                            onClick={() => setDeleteTarget(adjustment)}
                            aria-label={t('actions.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {adjustments.data && adjustments.data.total > 0 ? (
          <Pagination
            page={adjustments.data.page}
            pageSize={adjustments.data.pageSize}
            total={adjustments.data.total}
            totalPages={adjustments.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <AdjustmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        adjustment={editing}
        employees={employees.data?.items ?? []}
        defaultMonth={month}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('hr.adjustments.deleteTitle')}
        description={t('hr.adjustments.deleteDescription')}
        confirmLabel={t('hr.adjustments.deleteLabel')}
        destructive
        busy={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget);
        }}
      />
    </div>
  );
}
