import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import {
  HR_DEFAULTS,
  type AttendanceDto,
  type AttendanceStatus,
  type AttendanceUpsertInput,
  type EmployeeDto,
  type HrSettingsDto,
} from '@posshope/shared';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { computeLatePreview } from '../../lib/hr';

interface AttendanceFormState {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  note: string;
}

export function AttendanceDialog({
  open,
  onOpenChange,
  record,
  employees,
  settings,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AttendanceDto | null;
  employees: EmployeeDto[];
  settings: HrSettingsDto | undefined;
  defaultDate: string;
}): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AttendanceFormState>({
    employeeId: '',
    date: defaultDate,
    status: 'PRESENT',
    checkIn: '',
    checkOut: '',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      record
        ? {
            employeeId: record.employeeId,
            date: record.date,
            status: record.status,
            checkIn: record.checkIn ?? '',
            checkOut: record.checkOut ?? '',
            note: record.note ?? '',
          }
        : {
            employeeId: employees[0]?.id ?? '',
            date: defaultDate || todayIso(),
            status: 'PRESENT',
            checkIn: '',
            checkOut: '',
            note: '',
          },
    );
    setError(null);
  }, [open, record, employees, defaultDate]);

  const save = useMutation({
    mutationFn: () => {
      const body: AttendanceUpsertInput = {
        employeeId: form.employeeId,
        date: form.date,
        status: form.status,
        ...(form.checkIn ? { checkIn: form.checkIn } : {}),
        ...(form.checkOut ? { checkOut: form.checkOut } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      };
      return api.hr.saveAttendance(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      toast.success(t('hr.attendance.saved'));
      onOpenChange(false);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error ? mutationError.message : t('hr.attendance.saveFailed'),
      );
    },
  });

  const timingsDisabled = form.status === 'ABSENT' || form.status === 'DAY_OFF';
  const latePreview = timingsDisabled
    ? 0
    : computeLatePreview(
        form.checkIn,
        settings?.workStart ?? HR_DEFAULTS.workStart,
        settings?.graceMinutes ?? HR_DEFAULTS.graceMinutes,
      );
  const valid = Boolean(form.employeeId) && Boolean(form.date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={record ? t('hr.attendance.editTitle') : t('hr.attendance.newTitle')}
        className="max-w-lg"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-attendance-employee">{t('hr.attendance.employee')}</Label>
              <Select
                id="hr-attendance-employee"
                value={form.employeeId}
                disabled={Boolean(record)}
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
                required
              >
                <option value="">{t('hr.attendance.chooseEmployee')}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} · {employee.employeeCode}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-attendance-date">{t('hr.attendance.date')}</Label>
              <Input
                id="hr-attendance-date"
                type="date"
                value={form.date}
                disabled={Boolean(record)}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="hr-attendance-status">{t('actions.status')}</Label>
              <Select
                id="hr-attendance-status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as AttendanceStatus })
                }
              >
                <option value="PRESENT">{t('hr.attendance.statusPresent')}</option>
                <option value="ABSENT">{t('hr.attendance.statusAbsent')}</option>
                <option value="LATE">{t('hr.attendance.statusLate')}</option>
                <option value="DAY_OFF">{t('hr.attendance.statusDayOff')}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-attendance-in">{t('hr.attendance.checkIn')}</Label>
              <Input
                id="hr-attendance-in"
                type="time"
                value={form.checkIn}
                disabled={timingsDisabled}
                onChange={(event) => setForm({ ...form, checkIn: event.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-attendance-out">{t('hr.attendance.checkOut')}</Label>
              <Input
                id="hr-attendance-out"
                type="time"
                value={form.checkOut}
                disabled={timingsDisabled}
                onChange={(event) => setForm({ ...form, checkOut: event.target.value })}
                dir="ltr"
              />
            </div>
          </div>

          {!timingsDisabled ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t('hr.attendance.autoLateHint')}</span>
              <Badge variant={latePreview > 0 ? 'warning' : 'outline'}>
                {t('hr.attendance.lateMinutes', { minutes: latePreview })}
              </Badge>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="hr-attendance-note">{t('hr.attendance.note')}</Label>
            <Textarea
              id="hr-attendance-note"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              maxLength={300}
              rows={2}
            />
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || !valid}>
              {save.isPending ? t('actions.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
