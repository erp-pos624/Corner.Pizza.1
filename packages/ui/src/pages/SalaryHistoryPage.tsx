import { useQuery } from '@tanstack/react-query';
import { FileDown, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/input';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { SkeletonTable } from '../components/ui/skeleton';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatDate, formatMoney, initials } from '../lib/format';
import {
  downloadPayslip,
  employmentStatusLabel,
  monthLabel,
  payrollPaymentLabel,
  salaryTypeLabel,
} from '../lib/hr';

export function SalaryHistoryPage(): ReactElement {
  const { t } = useI18n();
  const [employeeId, setEmployeeId] = useState('');

  const employees = useQuery({
    queryKey: ['hr', 'employees', { options: true }],
    queryFn: () => api.hr.employees({ page: 1, pageSize: 200 }),
    staleTime: 60_000,
  });

  const history = useQuery({
    queryKey: ['hr', 'employees', employeeId, 'payroll'],
    queryFn: () => api.hr.employeePayroll(employeeId),
    enabled: Boolean(employeeId),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Select
            aria-label={t('hr.salaryHistory.employee')}
            className="h-9 w-full max-w-xs"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">{t('hr.salaryHistory.employee')}</option>
            {(employees.data?.items ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.employeeCode}
              </option>
            ))}
          </Select>
        </div>

        {!employeeId ? (
          <EmptyPanel
            title={t('hr.salaryHistory.employee')}
            message={t('hr.salaryHistory.chooseEmployee')}
          />
        ) : history.isLoading ? (
          <SkeletonTable
            label={t('states.loadingData')}
            rows={5}
            columns={[
              { kind: 'muted', label: t('hr.salaryHistory.columns.month') },
              { kind: 'muted', label: t('hr.salaryHistory.columns.basic') },
              { kind: 'muted', label: t('hr.salaryHistory.columns.bonus') },
              { kind: 'muted', label: t('hr.salaryHistory.columns.deduction') },
              { kind: 'muted', label: t('hr.salaryHistory.columns.net') },
              { kind: 'badge', label: t('hr.salaryHistory.columns.status') },
              { kind: 'actions' },
            ]}
          />
        ) : history.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('hr.salaryHistory.historyLoadError')}
              message={history.error instanceof Error ? history.error.message : undefined}
              onRetry={() => void history.refetch()}
            />
          </div>
        ) : history.data ? (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {initials(history.data.employee.fullName)}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{history.data.employee.fullName}</p>
                <p className="numeric text-[11px] text-muted-foreground">
                  {history.data.employee.employeeCode} · {history.data.employee.jobTitle} ·{' '}
                  {salaryTypeLabel(history.data.employee.salaryType)} ·{' '}
                  {formatMoney(history.data.employee.basicSalary)}
                </p>
              </div>
              <Badge
                variant={history.data.employee.status === 'ACTIVE' ? 'success' : 'destructive'}
                className="ms-auto"
              >
                {employmentStatusLabel(history.data.employee.status)}
              </Badge>
            </div>

            {history.data.lines.length === 0 ? (
              <EmptyPanel
                title={t('hr.salaryHistory.empty')}
                message={t('hr.salaryHistory.emptyMessage')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-semibold">
                        {t('hr.salaryHistory.columns.month')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('hr.salaryHistory.columns.basic')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('hr.salaryHistory.columns.bonus')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('hr.salaryHistory.columns.deduction')}
                      </th>
                      <th className="px-3 py-2.5 text-end font-semibold">
                        {t('hr.salaryHistory.columns.net')}
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        {t('hr.salaryHistory.columns.status')}
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-border/70 last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{monthLabel(line.month)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {line.runStatus === 'DRAFT'
                              ? t('hr.payroll.statusDraft')
                              : t('hr.payroll.statusClosed')}
                          </p>
                        </td>
                        <td className="numeric px-3 py-2.5 text-xs">
                          {formatMoney(line.basicSalary)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-xs text-success">
                          {formatMoney(line.bonusTotal)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-xs text-destructive">
                          {formatMoney(line.deductionTotal)}
                        </td>
                        <td className="numeric px-3 py-2.5 text-end font-semibold">
                          {formatMoney(line.netSalary)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={line.paymentStatus === 'PAID' ? 'success' : 'warning'}
                          >
                            {payrollPaymentLabel(line.paymentStatus)}
                          </Badge>
                          {line.paidAt ? (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {formatDate(line.paidAt)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => void downloadPayslip(line, line.month)}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            {t('hr.salaryHistory.payslip')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
