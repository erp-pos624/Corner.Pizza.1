import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Lock } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import type { AttendanceDto, AttendanceStatus } from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Pagination } from '../components/ui/pagination';
import { SkeletonTable } from '../components/ui/skeleton';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { AttendanceDialog } from '../components/hr/AttendanceDialog';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatDate, todayIso } from '../lib/format';
import { attendanceStatusLabel, currentMonthKey, monthLabel } from '../lib/hr';

const PAGE_SIZE = 20;

export function AttendancePage(): ReactElement {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonthKey());
  const [date, setDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState<AttendanceStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceDto | null>(null);

  useEffect(() => {
    setPage(1);
  }, [month, date, employeeId, status]);

  const employees = useQuery({
    queryKey: ['hr', 'employees', { options: true }],
    queryFn: () => api.hr.employees({ page: 1, pageSize: 200, status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const settings = useQuery({
    queryKey: ['hr', 'settings'],
    queryFn: () => api.hr.settings(),
    staleTime: 60_000,
  });

  const payroll = useQuery({
    queryKey: ['hr', 'payroll', { month }],
    queryFn: () => api.hr.payrollMonth(month),
  });
  const locked = payroll.data?.run?.status === 'CLOSED';

  const attendance = useQuery({
    queryKey: ['hr', 'attendance', { page, month, date, employeeId, status }],
    queryFn: () =>
      api.hr.attendance({
        page,
        pageSize: PAGE_SIZE,
        ...(date ? { date } : { month }),
        employeeId: employeeId || undefined,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const activeEmployees = (employees.data?.items ?? []).filter(
    (employee) => employee.status === 'ACTIVE',
  );

  const openNew = (): void => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: AttendanceDto): void => {
    if (locked) return;
    setEditing(row);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="space-y-1">
            <span className="sr-only">{t('hr.attendance.month')}</span>
            <Input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setDate('');
              }}
              className="h-9 w-[150px]"
              aria-label={t('hr.attendance.month')}
            />
          </div>

          <div className="space-y-1">
            <span className="sr-only">{t('hr.attendance.date')}</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-9 w-[150px]"
              aria-label={t('hr.attendance.date')}
            />
          </div>

          <Select
            aria-label={t('hr.attendance.employee')}
            className="h-9 w-[190px]"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">{t('hr.attendance.allEmployees')}</option>
            {(employees.data?.items ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </Select>

          <Select
            aria-label={t('hr.attendance.columns.status')}
            className="h-9 w-[150px]"
            value={status}
            onChange={(event) => setStatus(event.target.value as AttendanceStatus | '')}
          >
            <option value="">{t('hr.attendance.allStatuses')}</option>
            <option value="PRESENT">{t('hr.attendance.statusPresent')}</option>
            <option value="ABSENT">{t('hr.attendance.statusAbsent')}</option>
            <option value="LATE">{t('hr.attendance.statusLate')}</option>
            <option value="DAY_OFF">{t('hr.attendance.statusDayOff')}</option>
          </Select>

          {date ? (
            <Button size="sm" variant="ghost" onClick={() => setDate('')}>
              {t('actions.clear')}
            </Button>
          ) : null}

          <div className="ms-auto" />

          <Button size="sm" onClick={openNew} disabled={locked || activeEmployees.length === 0}>
            <CalendarPlus className="h-4 w-4" />
            {t('hr.attendance.add')}
          </Button>
        </div>

        {locked ? (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
            <Lock className="h-3.5 w-3.5" />
            <span>
              <strong>{t('hr.attendance.locked')}</strong> — {t('hr.attendance.lockedBody')}
            </span>
          </div>
        ) : null}

        {attendance.isLoading ? (
          <SkeletonTable
            label={t('states.loadingData')}
            rows={7}
            columns={[
              { kind: 'avatar', label: t('hr.attendance.columns.employee') },
              { kind: 'muted', label: t('hr.attendance.columns.date') },
              { kind: 'muted', label: t('hr.attendance.columns.checkIn') },
              { kind: 'muted', label: t('hr.attendance.columns.checkOut') },
              { kind: 'badge', label: t('hr.attendance.columns.late') },
              { kind: 'badge', label: t('hr.attendance.columns.status') },
            ]}
          />
        ) : attendance.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('states.error')}
              message={attendance.error instanceof Error ? attendance.error.message : undefined}
              onRetry={() => void attendance.refetch()}
            />
          </div>
        ) : attendance.data && attendance.data.items.length === 0 ? (
          <EmptyPanel
            title={t('hr.attendance.empty')}
            message={`${monthLabel(month)} — ${t('hr.attendance.emptyMessage')}`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.attendance.columns.employee')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.attendance.columns.date')}</th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.attendance.columns.checkIn')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.attendance.columns.checkOut')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.attendance.columns.late')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.attendance.columns.status')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.attendance.columns.note')}</th>
                </tr>
              </thead>
              <tbody>
                {attendance.data!.items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40"
                    onClick={() => openEdit(row)}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.employeeName}</p>
                      <p className="numeric text-[11px] text-muted-foreground">
                        {row.employeeCode}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{formatDate(row.date)}</td>
                    <td className="numeric px-3 py-2.5 text-xs">{row.checkIn ?? '—'}</td>
                    <td className="numeric px-3 py-2.5 text-xs">{row.checkOut ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {row.lateMinutes > 0 ? (
                        <Badge variant="warning">
                          {t('hr.attendance.lateMinutes', { minutes: row.lateMinutes })}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                      {row.note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {attendance.data && attendance.data.total > 0 ? (
          <Pagination
            page={attendance.data.page}
            pageSize={attendance.data.pageSize}
            total={attendance.data.total}
            totalPages={attendance.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <AttendanceDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        record={editing}
        employees={activeEmployees}
        settings={settings.data}
        defaultDate={date || todayIso()}
      />
    </div>
  );
}
