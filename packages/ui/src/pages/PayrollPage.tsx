import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  FileDown,
  Gift,
  Lock,
  PlayCircle,
  RotateCcw,
  TrendingDown,
  Users,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type {
  PayrollLineDto,
  PayrollMonthDto,
  PayrollPaymentStatus,
} from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '../components/ui/dialog';
import { ExportActions } from '../components/ui/export-actions';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SkeletonTable } from '../components/ui/skeleton';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { StatCard } from '../components/ui/stat-card';
import { toast } from '../components/ui/toast';
import { PayrollBreakdownDialog } from '../components/hr/PayrollBreakdownDialog';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { downloadCsv, downloadExcel, downloadPdf, type ExportValue } from '../lib/export';
import { formatDate, formatMoney, formatMoneyShort, formatNumber } from '../lib/format';
import {
  currentMonthKey,
  downloadPayslip,
  monthLabel,
  payrollPaymentLabel,
  salaryTypeLabel,
} from '../lib/hr';

function sumRows(rows: PayrollLineDto[], pick: (row: PayrollLineDto) => string): number {
  return rows.reduce((total, row) => total + Number(pick(row)), 0);
}

export function PayrollPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonthKey());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [breakdownLine, setBreakdownLine] = useState<PayrollLineDto | null>(null);

  const payroll = useQuery<PayrollMonthDto>({
    queryKey: ['hr', 'payroll', { month }],
    queryFn: () => api.hr.payrollMonth(month),
  });

  const data = payroll.data;
  const run = data?.run ?? null;
  const rows = run?.lines ?? data?.preview ?? [];
  const closed = run?.status === 'CLOSED';

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['hr'] });
  };

  const generate = useMutation({
    mutationFn: () => api.hr.generatePayroll({ month }),
    onSuccess: () => {
      invalidate();
      toast.success(t('hr.payroll.generated'), monthLabel(month));
      setGenerateOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hr.payroll.generateFailed'));
      setGenerateOpen(false);
    },
  });

  const close = useMutation({
    mutationFn: () => api.hr.closePayroll(run!.id),
    onSuccess: () => {
      invalidate();
      toast.success(t('hr.payroll.closedToast'), monthLabel(month));
      setCloseOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hr.payroll.closeFailed'));
      setCloseOpen(false);
    },
  });

  const reopen = useMutation({
    mutationFn: () => api.hr.reopenPayroll(run!.id, reopenReason.trim()),
    onSuccess: () => {
      invalidate();
      toast.success(t('hr.payroll.reopenedToast'), monthLabel(month));
      setReopenOpen(false);
      setReopenReason('');
      setReopenError(null);
    },
    onError: (error) => {
      setReopenError(error instanceof Error ? error.message : t('hr.payroll.reopenFailed'));
    },
  });

  const payment = useMutation({
    mutationFn: (args: { line: PayrollLineDto; status: PayrollPaymentStatus }) =>
      api.hr.setPayrollPayment(run!.id, args.line.id, args.status),
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hr.payroll.paymentFailed'));
    },
  });

  const employeeCount = rows.length;
  const basicTotal = sumRows(rows, (row) => row.basicSalary);
  const bonusTotal = sumRows(rows, (row) => row.bonusTotal);
  const deductionTotal = sumRows(rows, (row) => row.deductionTotal);
  const netTotal = sumRows(rows, (row) => row.netSalary);

  const exportHeaders = (): string[] => [
    t('hr.payroll.columns.employee'),
    t('hr.payroll.columns.job'),
    t('hr.payroll.columns.basic'),
    t('hr.payroll.breakdownPresentDays'),
    t('hr.payroll.breakdownAbsentDays'),
    t('hr.payroll.breakdownLateMinutes'),
    t('hr.payroll.breakdownAttendance'),
    t('hr.payroll.columns.bonus'),
    t('hr.payroll.columns.deduction'),
    t('hr.payroll.columns.net'),
    t('hr.payroll.columns.status'),
  ];

  const exportRows = (): ExportValue[][] => [
    exportHeaders(),
    ...rows.map((row) => [
      `${row.employeeName} (${row.employeeCode})`,
      row.jobTitle,
      Number(row.basicSalary),
      row.presentDays,
      row.absentDays,
      row.lateMinutes,
      Number(row.attendanceDeduction),
      Number(row.bonusTotal),
      Number(row.deductionTotal),
      Number(row.netSalary),
      payrollPaymentLabel(row.paymentStatus),
    ]),
  ];

  const exportName = `payroll-${month}`;

  const exportCsv = (): void => {
    downloadCsv(exportName, exportRows());
  };

  const exportExcel = async (): Promise<void> => {
    await downloadExcel(exportName, [
      { name: monthLabel(month), rows: exportRows(), widths: [30, 20, 14, 10, 10, 10, 14, 12, 12, 14, 12] },
    ]);
  };

  const exportPdf = async (): Promise<void> => {
    await downloadPdf(exportName, {
      title: t('nav.items.payroll'),
      subtitle: monthLabel(month),
      meta: [
        { label: t('hr.payroll.employeeCount'), value: formatNumber(employeeCount) },
        { label: t('hr.payroll.netTotal'), value: formatMoney(netTotal) },
        { label: t('actions.status'), value: closed ? t('hr.payroll.statusClosed') : t('hr.payroll.statusDraft') },
      ],
      sections: [
        {
          headers: exportHeaders(),
          rows: exportRows().slice(1),
          columnAlign: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-9 w-[160px]"
            aria-label={t('hr.payroll.month')}
          />
          <div className="flex items-center gap-2">
            {run ? (
              <Badge variant={closed ? 'success' : 'warning'}>
                {closed ? t('hr.payroll.statusClosed') : t('hr.payroll.statusDraft')}
              </Badge>
            ) : (
              <Badge variant="outline">{t('hr.payroll.noRun')}</Badge>
            )}
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <ExportActions
              csv={rows.length > 0 ? exportCsv : undefined}
              excel={rows.length > 0 ? exportExcel : undefined}
              pdf={rows.length > 0 ? exportPdf : undefined}
            />
            {!run ? (
              <Button
                size="sm"
                onClick={() => setGenerateOpen(true)}
                disabled={data?.preview.length === 0}
              >
                <PlayCircle className="h-4 w-4" />
                {t('hr.payroll.generate')}
              </Button>
            ) : null}
            {run && !closed ? (
              <Button size="sm" onClick={() => setCloseOpen(true)}>
                <Lock className="h-4 w-4" />
                {t('hr.payroll.close')}
              </Button>
            ) : null}
            {run && closed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReopenReason('');
                  setReopenError(null);
                  setReopenOpen(true);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                {t('hr.payroll.reopen')}
              </Button>
            ) : null}
          </div>
        </div>

        {run ? (
          <div
            className={`flex items-center gap-2 border-b px-3 py-2 text-xs ${
              closed
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-warning/30 bg-warning/10 text-warning-strong'
            }`}
          >
            {closed ? <Lock className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
            <span>{closed ? t('hr.payroll.closedNotice') : t('hr.payroll.draftNotice')}</span>
            {run.reopenReason ? (
              <span className="ms-auto opacity-80">
                {t('hr.payroll.reopenedReason', { reason: run.reopenReason })}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 border-b border-info/25 bg-info/10 px-3 py-2 text-xs text-info">
            <Banknote className="h-3.5 w-3.5" />
            <span>{t('hr.payroll.previewHint')}</span>
          </div>
        )}

        {payroll.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('hr.payroll.loadError')}
              message={payroll.error instanceof Error ? payroll.error.message : undefined}
              onRetry={() => void payroll.refetch()}
            />
          </div>
        ) : payroll.isLoading ? (
          <SkeletonTable
            label={t('states.loadingData')}
            rows={7}
            columns={[
              { kind: 'avatar', label: t('hr.payroll.columns.employee') },
              { kind: 'muted', label: t('hr.payroll.columns.basic') },
              { kind: 'muted', label: t('hr.payroll.columns.days') },
              { kind: 'muted', label: t('hr.payroll.columns.attendance') },
              { kind: 'muted', label: t('hr.payroll.columns.bonus') },
              { kind: 'muted', label: t('hr.payroll.columns.deduction') },
              { kind: 'muted', label: t('hr.payroll.columns.net') },
              { kind: 'badge', label: t('hr.payroll.columns.status') },
              { kind: 'actions' },
            ]}
          />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title={t('hr.payroll.empty')}
            message={t('hr.payroll.emptyMessage')}
          />
        ) : (
          <>
            <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label={t('hr.payroll.employeeCount')}
                value={formatNumber(employeeCount)}
                icon={<Users className="h-4 w-4" />}
                tone="blue"
              />
              <StatCard
                label={t('hr.payroll.basicTotal')}
                value={formatMoneyShort(basicTotal)}
                icon={<Banknote className="h-4 w-4" />}
              />
              <StatCard
                label={t('hr.payroll.bonusTotal')}
                value={formatMoneyShort(bonusTotal)}
                icon={<Gift className="h-4 w-4" />}
                tone="green"
              />
              <StatCard
                label={t('hr.payroll.deductionTotal')}
                value={formatMoneyShort(deductionTotal)}
                icon={<TrendingDown className="h-4 w-4" />}
                tone="red"
              />
              <StatCard
                label={t('hr.payroll.netTotal')}
                value={formatMoneyShort(netTotal)}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone="green"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">{t('hr.payroll.columns.employee')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('hr.payroll.columns.basic')}</th>
                    <th className="px-3 py-2.5 font-semibold">{t('hr.payroll.columns.days')}</th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.payroll.columns.attendance')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">{t('hr.payroll.columns.bonus')}</th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.payroll.columns.deduction')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('hr.payroll.columns.net')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">{t('hr.payroll.columns.status')}</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.employeeName}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {row.employeeCode} · {row.jobTitle} · {salaryTypeLabel(row.salaryType)}
                        </p>
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs">{formatMoney(row.basicSalary)}</td>
                      <td className="numeric px-3 py-2.5 text-xs">
                        {row.presentDays}
                        <span className="text-muted-foreground"> / {row.payableDays}</span>
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs">
                        {Number(row.attendanceDeduction) > 0
                          ? formatMoney(row.attendanceDeduction)
                          : '—'}
                        {row.lateMinutes > 0 ? (
                          <span className="block text-[10px] text-muted-foreground">
                            {t('hr.attendance.lateMinutes', { minutes: row.lateMinutes })}
                          </span>
                        ) : null}
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs text-success">
                        {Number(row.bonusTotal) > 0 ? formatMoney(row.bonusTotal) : '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs text-destructive">
                        {Number(row.deductionTotal) > 0 ? formatMoney(row.deductionTotal) : '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end font-semibold">
                        {formatMoney(row.netSalary)}
                      </td>
                      <td className="px-3 py-2.5">
                        {closed ? (
                          <button
                            type="button"
                            className="focus-ring rounded-full"
                            disabled={payment.isPending}
                            onClick={() =>
                              payment.mutate({
                                line: row,
                                status: row.paymentStatus === 'PAID' ? 'UNPAID' : 'PAID',
                              })
                            }
                            title={
                              row.paymentStatus === 'PAID'
                                ? t('hr.payroll.markUnpaid')
                                : t('hr.payroll.markPaid')
                            }
                          >
                            <Badge variant={row.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                              {payrollPaymentLabel(row.paymentStatus)}
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant={row.paymentStatus === 'PAID' ? 'success' : 'outline'}>
                            {payrollPaymentLabel(row.paymentStatus)}
                          </Badge>
                        )}
                        {row.paidAt ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {t('hr.payroll.paidOn', { date: formatDate(row.paidAt) })}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBreakdownLine(row)}
                            title={t('hr.payroll.breakdown')}
                          >
                            {t('hr.payroll.breakdown')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title={t('hr.payroll.payslip')}
                            onClick={() => void downloadPayslip(row, month)}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title={t('hr.payroll.generateTitle', { month: monthLabel(month) })}
        description={t('hr.payroll.generateDescription')}
        confirmLabel={t('hr.payroll.generateLabel')}
        busy={generate.isPending}
        onConfirm={() => generate.mutate()}
      />

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title={t('hr.payroll.closeTitle', { month: monthLabel(month) })}
        description={t('hr.payroll.closeDescription')}
        confirmLabel={t('hr.payroll.closeLabel')}
        busy={close.isPending}
        onConfirm={() => close.mutate()}
      />

      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (!open) {
            setReopenReason('');
            setReopenError(null);
          }
        }}
      >
        <DialogContent
          title={t('hr.payroll.reopenTitle', { month: monthLabel(month) })}
          description={t('hr.payroll.reopenDescription')}
          className="max-w-md"
        >
          <div className="space-y-1.5">
            <Label htmlFor="hr-reopen-reason">{t('hr.payroll.reopenReason')}</Label>
            <Textarea
              id="hr-reopen-reason"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              maxLength={300}
              rows={3}
              autoFocus
            />
          </div>
          {reopenError ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {reopenError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={reopen.isPending || reopenReason.trim().length < 3}
              onClick={() => reopen.mutate()}
            >
              {reopen.isPending ? t('actions.saving') : t('hr.payroll.reopenLabel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayrollBreakdownDialog
        line={breakdownLine}
        month={month}
        onOpenChange={(open) => {
          if (!open) setBreakdownLine(null);
        }}
      />
    </div>
  );
}
