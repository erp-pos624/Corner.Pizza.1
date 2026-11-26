import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { HrShiftDto, HrShiftInput } from '@posshope/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';

interface ShiftForm {
  name: string;
  nameAr: string;
  startTime: string;
  endTime: string;
  graceMinutes: string;
  isActive: boolean;
}

const EMPTY: ShiftForm = {
  name: '',
  nameAr: '',
  startTime: '10:00',
  endTime: '17:00',
  graceMinutes: '',
  isActive: true,
};

function formOf(shift: HrShiftDto): ShiftForm {
  return {
    name: shift.nameEn,
    nameAr: shift.nameAr ?? '',
    startTime: shift.startTime,
    endTime: shift.endTime,
    graceMinutes: shift.graceMinutes === null ? '' : String(shift.graceMinutes),
    isActive: shift.isActive,
  };
}

/**
 * Named shifts (e.g. Morning 10:00–17:00, Evening 17:00–01:00). Employees and
 * attendance records can point at one; lateness is then measured from that
 * shift's start. Without a shift the HR Settings work window applies.
 */
export function ShiftsManager(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY);
  const shifts = useQuery({ queryKey: ['hr', 'shifts'], queryFn: () => api.hr.shifts() });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['hr'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: HrShiftInput = {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || undefined,
        startTime: form.startTime,
        endTime: form.endTime,
        graceMinutes: form.graceMinutes.trim() === '' ? null : Number(form.graceMinutes),
        isActive: form.isActive,
        sortOrder: 0,
      };
      return editingId && editingId !== 'new'
        ? api.hr.updateShift(editingId, body)
        : api.hr.createShift(body);
    },
    onSuccess: () => {
      toast.success(t('hr.shifts.saved'));
      setEditingId(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('hr.shifts.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.hr.removeShift(id),
    onSuccess: () => {
      toast.success(t('hr.shifts.deleted'));
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('hr.shifts.saveFailed')),
  });

  const valid =
    form.name.trim().length >= 2 &&
    Boolean(form.startTime) &&
    Boolean(form.endTime) &&
    form.startTime !== form.endTime &&
    (form.graceMinutes.trim() === '' || (Number(form.graceMinutes) >= 0 && Number(form.graceMinutes) <= 120));
  const overnight = form.endTime <= form.startTime;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sun className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t('hr.shifts.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('hr.shifts.description')}</p>
          </div>
        </div>
        {editingId === null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setForm(EMPTY);
              setEditingId('new');
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('hr.shifts.add')}
          </Button>
        ) : null}
      </div>

      {editingId !== null ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="shift-name" className="text-xs">{t('hr.shifts.name')}</Label>
              <Input
                id="shift-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={t('hr.shifts.namePlaceholder')}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-name-ar" className="text-xs">{t('hr.shifts.nameAr')}</Label>
              <Input
                id="shift-name-ar"
                value={form.nameAr}
                onChange={(event) => setForm({ ...form, nameAr: event.target.value })}
                dir="rtl"
                lang="ar"
                maxLength={60}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="shift-start" className="text-xs">{t('hr.shifts.start')}</Label>
              <Input
                id="shift-start"
                type="time"
                value={form.startTime}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-end" className="text-xs">{t('hr.shifts.end')}</Label>
              <Input
                id="shift-end"
                type="time"
                value={form.endTime}
                onChange={(event) => setForm({ ...form, endTime: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-grace" className="text-xs">{t('hr.shifts.grace')}</Label>
              <Input
                id="shift-grace"
                type="number"
                min={0}
                max={120}
                value={form.graceMinutes}
                onChange={(event) => setForm({ ...form, graceMinutes: event.target.value })}
                placeholder={t('hr.shifts.gracePlaceholder')}
                dir="ltr"
              />
            </div>
          </div>
          {overnight && form.startTime !== form.endTime ? (
            <p className="text-[11px] text-muted-foreground">{t('hr.shifts.overnightHint')}</p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            {t('hr.shifts.active')}
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('actions.saving') : t('actions.save')}
            </Button>
          </div>
        </div>
      ) : null}

      {(shifts.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {t('hr.shifts.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(shifts.data ?? []).map((shift) => (
            <li key={shift.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {shift.name}
                  {!shift.isActive ? (
                    <span className="ms-2 text-[11px] text-muted-foreground">{t('hr.shifts.off')}</span>
                  ) : null}
                </p>
                <p className="numeric text-xs text-muted-foreground" dir="ltr">
                  {shift.startTime}–{shift.endTime}
                  {shift.endTime <= shift.startTime ? ` (${t('hr.shifts.overnight')})` : ''}
                  {' · '}
                  {t('hr.shifts.graceShort', {
                    minutes: shift.graceMinutes ?? t('hr.shifts.defaultGrace'),
                  })}
                  {' · '}
                  {t('hr.shifts.employees', { count: shift.employeeCount })}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('hr.shifts.edit', { name: shift.name })}
                  onClick={() => {
                    setForm(formOf(shift));
                    setEditingId(shift.id);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  aria-label={t('hr.shifts.delete', { name: shift.name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(shift.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
