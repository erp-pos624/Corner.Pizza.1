import type { ReactElement } from 'react';
import type { PayrollLineDto } from '@posshope/shared';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { useI18n } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { adjustmentCategoryLabel, downloadPayslip, salaryTypeLabel } from '../../lib/hr';

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric font-medium">{value}</span>
    </div>
  );
}

export function PayrollBreakdownDialog({
  line,
  month,
  onOpenChange,
}: {
  line: PayrollLineDto | null;
  month: string;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useI18n();

  return (
    <Dialog open={Boolean(line)} onOpenChange={onOpenChange}>
      <DialogContent
        title={line ? t('hr.payroll.breakdownTitle', { name: line.employeeName }) : ''}
        className="max-w-xl"
      >
        {line ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{line.employeeCode}</Badge>
              <span>{line.jobTitle}</span>
              <span>·</span>
              <span>{salaryTypeLabel(line.salaryType)}</span>
              {line.branchName ? (
                <>
                  <span>·</span>
                  <span>{line.branchName}</span>
                </>
              ) : null}
            </div>

            <div>
              <Row label={t('hr.payroll.breakdownBasic')} value={formatMoney(line.basicSalary)} />
              <Row label={t('hr.payroll.breakdownScheduledDays')} value={String(line.breakdown.scheduledDays)} />
              <Row label={t('hr.payroll.breakdownDailyRate')} value={formatMoney(line.breakdown.dailyRate)} />
              <Row label={t('hr.payroll.breakdownPresentDays')} value={String(line.presentDays)} />
              <Row label={t('hr.payroll.breakdownAbsentDays')} value={String(line.absentDays)} />
              <Row label={t('hr.payroll.breakdownLateMinutes')} value={String(line.lateMinutes)} />
              <Row label={t('hr.payroll.breakdownGross')} value={formatMoney(line.breakdown.grossPay)} />
              <Row label={t('hr.payroll.breakdownLateDeduction')} value={formatMoney(line.breakdown.lateDeduction)} />
              <Row label={t('hr.payroll.breakdownAbsenceDeduction')} value={formatMoney(line.breakdown.absenceDeduction)} />
              <Row label={t('hr.payroll.breakdownAttendance')} value={formatMoney(line.attendanceDeduction)} />
              <Row label={t('hr.payroll.breakdownBonuses')} value={formatMoney(line.bonusTotal)} />
              <Row label={t('hr.payroll.breakdownDeductions')} value={formatMoney(line.breakdown.adjustmentDeductions)} />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t('hr.payroll.breakdownNet')}</span>
                <span className="numeric text-lg font-bold">{formatMoney(line.netSalary)}</span>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('hr.payroll.breakdownAdjustments')}
              </p>
              {line.breakdown.adjustments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('hr.payroll.breakdownNoAdjustments')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {line.breakdown.adjustments.map((adjustment) => (
                    <li
                      key={adjustment.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-2.5 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {adjustmentCategoryLabel(adjustment.category)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {formatDate(adjustment.date)} · {adjustment.reason}
                        </p>
                      </div>
                      <span className="numeric shrink-0 font-semibold">
                        {formatMoney(adjustment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {line.breakdown.notes.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('hr.payroll.breakdownNotes')}
                </p>
                <ul className="list-disc space-y-0.5 ps-5 text-xs text-muted-foreground">
                  {line.breakdown.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('actions.close')}
              </Button>
              <Button onClick={() => void downloadPayslip(line, month)}>
                {t('hr.payroll.payslip')}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
