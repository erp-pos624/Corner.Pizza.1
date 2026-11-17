import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CalendarCheck,
  Clock,
  UserCheck,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { StatCard } from '../components/ui/stat-card';
import { Skeleton, SkeletonTable } from '../components/ui/skeleton';
import type { PageKey } from '../components/layout/AppShell';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatMoney, formatNumber, todayIso } from '../lib/format';
import { attendanceStatusLabel, currentMonthKey, monthLabel } from '../lib/hr';

export function HrDashboardPage({
  onNavigate,
}: {
  onNavigate: (page: PageKey) => void;
}): ReactElement {
  const { t } = useI18n();
  const today = todayIso();
  const month = currentMonthKey();
  const dashboard = useQuery({
    queryKey: ['hr', 'dashboard'],
    queryFn: () => api.hr.dashboard(),
    refetchInterval: 60_000,
  });
  const payroll = useQuery({
    queryKey: ['hr', 'payroll', { month }],
    queryFn: () => api.hr.payrollMonth(month),
  });
  const attendance = useQuery({
    queryKey: ['hr', 'attendance', { date: today, pageSize: 8 }],
    queryFn: () => api.hr.attendance({ date: today, page: 1, pageSize: 8 }),
  });

  return (
    <div className="space-y-4">
      {dashboard.isError ? (
        <ErrorState
          title={t('states.error')}
          message={dashboard.error instanceof Error ? dashboard.error.message : undefined}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.isLoading || !dashboard.data ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label={t('hr.stats.activeEmployees')}
                value={formatNumber(dashboard.data.activeEmployees)}
                hint={t('hr.stats.activeHint')}
                icon={<Users className="h-4 w-4" />}
                tone="blue"
              />
              <StatCard
                label={t('hr.stats.presentToday')}
                value={formatNumber(dashboard.data.presentToday)}
                hint={t('hr.stats.presentHint')}
                icon={<UserCheck className="h-4 w-4" />}
                tone="green"
              />
              <StatCard
                label={t('hr.stats.absentToday')}
                value={formatNumber(dashboard.data.absentToday)}
                hint={t('hr.stats.absentHint')}
                icon={<UserX className="h-4 w-4" />}
                tone="red"
              />
              <StatCard
                label={t('hr.stats.lateToday')}
                value={formatNumber(dashboard.data.lateToday)}
                hint={t('hr.stats.lateHint')}
                icon={<Clock className="h-4 w-4" />}
                tone="amber"
              />
              <StatCard
                label={t('hr.stats.monthlyPayroll')}
                value={formatMoney(dashboard.data.monthlyPayroll)}
                hint={monthLabel(dashboard.data.currentMonth)}
                icon={<Wallet className="h-4 w-4" />}
                tone="orange"
              />
              <StatCard
                label={t('hr.stats.unpaidSalaries')}
                value={formatMoney(dashboard.data.unpaidSalaries)}
                hint={
                  dashboard.data.unpaidCount > 0
                    ? t('hr.dashboard.unpaidCount', {
                        count: formatNumber(dashboard.data.unpaidCount),
                      })
                    : t('hr.stats.unpaidHint')
                }
                icon={<Banknote className="h-4 w-4" />}
                tone={dashboard.data.unpaidCount > 0 ? 'red' : 'neutral'}
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{t('hr.dashboard.attendanceToday')}</h2>
              <p className="text-[11px] text-muted-foreground">
                {t('hr.dashboard.attendanceHint')}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onNavigate('attendance')}>
              {t('hr.dashboard.openAttendance')}
            </Button>
          </div>

          {attendance.isLoading ? (
            <SkeletonTable
              label={t('states.loadingData')}
              rows={5}
              columns={[
                { kind: 'avatar', label: t('hr.attendance.columns.employee') },
                { kind: 'muted', label: t('hr.attendance.columns.checkIn') },
                { kind: 'muted', label: t('hr.attendance.columns.checkOut') },
                { kind: 'badge', label: t('hr.attendance.columns.status') },
              ]}
            />
          ) : attendance.data && attendance.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.attendance.columns.employee')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.attendance.columns.checkIn')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.attendance.columns.checkOut')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.attendance.columns.late')}
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      {t('hr.attendance.columns.status')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.data.items.map((row) => (
                    <tr key={row.id} className="border-b border-border/70 last:border-0">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{row.employeeName}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {row.employeeCode}
                        </p>
                      </td>
                      <td className="numeric px-3 py-2.5 text-xs">{row.checkIn ?? '—'}</td>
                      <td className="numeric px-3 py-2.5 text-xs">{row.checkOut ?? '—'}</td>
                      <td className="numeric px-3 py-2.5 text-xs">
                        {row.lateMinutes > 0
                          ? t('hr.attendance.lateMinutes', { minutes: row.lateMinutes })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            row.status === 'PRESENT'
                              ? 'success'
                              : row.status === 'LATE'
                                ? 'warning'
                                : row.status === 'ABSENT'
                                  ? 'destructive'
                                  : 'outline'
                          }
                        >
                          {attendanceStatusLabel(row.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyPanel title={t('hr.dashboard.noAttendance')} />
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {t('hr.payroll.month')}
            </p>
            <p className="mt-1 font-display text-lg">{monthLabel(month)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {payroll.data?.run?.status === 'CLOSED'
                ? t('hr.dashboard.payrollStatusClosed')
                : t('hr.dashboard.payrollStatusDraft')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onNavigate('payroll')}>
                {t('hr.dashboard.openPayroll')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate('employees')}>
                {t('hr.dashboard.openEmployees')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
