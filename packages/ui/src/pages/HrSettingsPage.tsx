import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Save } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import type { HrSettingsDto } from '@posshope/shared';
import { ShiftsManager } from '../components/hr/ShiftsManager';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';

const DAY_KEYS: TranslationKey[] = [
  'hr.settings.daySun',
  'hr.settings.dayMon',
  'hr.settings.dayTue',
  'hr.settings.dayWed',
  'hr.settings.dayThu',
  'hr.settings.dayFri',
  'hr.settings.daySat',
];

interface SettingsForm {
  workStart: string;
  workEnd: string;
  graceMinutes: string;
  lateDeductionPerMinute: string;
  absenceDeductionMultiplier: string;
  weeklyDaysOff: number[];
}

function formFromSettings(settings: HrSettingsDto): SettingsForm {
  return {
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    graceMinutes: String(settings.graceMinutes),
    lateDeductionPerMinute: settings.lateDeductionPerMinute,
    absenceDeductionMultiplier: settings.absenceDeductionMultiplier,
    weeklyDaysOff: [...settings.weeklyDaysOff].sort((a, b) => a - b),
  };
}

export function HrSettingsPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['hr', 'settings'],
    queryFn: () => api.hr.settings(),
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(formFromSettings(settings.data));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (value: SettingsForm) =>
      api.hr.updateSettings({
        workStart: value.workStart,
        workEnd: value.workEnd,
        graceMinutes: Number(value.graceMinutes),
        lateDeductionPerMinute: value.lateDeductionPerMinute.trim(),
        absenceDeductionMultiplier: value.absenceDeductionMultiplier.trim(),
        weeklyDaysOff: value.weeklyDaysOff,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['hr', 'settings'], updated);
      setForm(formFromSettings(updated));
      toast.success(t('hr.settings.saved'));
      setError(null);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error ? mutationError.message : t('hr.settings.saveFailed'),
      );
    },
  });

  if (settings.isError) {
    return (
      <ErrorState
        title={t('states.error')}
        message={settings.error instanceof Error ? settings.error.message : undefined}
        onRetry={() => void settings.refetch()}
      />
    );
  }

  if (!form) {
    return (
      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const toggleDay = (day: number): void => {
    setForm({
      ...form,
      weeklyDaysOff: form.weeklyDaysOff.includes(day)
        ? form.weeklyDaysOff.filter((value) => value !== day)
        : [...form.weeklyDaysOff, day].sort((a, b) => a - b),
    });
  };

  const valid =
    Boolean(form.workStart) &&
    Boolean(form.workEnd) &&
    form.workEnd > form.workStart &&
    Number(form.graceMinutes) >= 0 &&
    Number(form.lateDeductionPerMinute) >= 0 &&
    Number(form.absenceDeductionMultiplier) >= 0;

  return (
    <div className="max-w-2xl space-y-4">
      <form
        className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (form) save.mutate(form);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold">{t('nav.items.hrSettings')}</h2>
            <p className="text-[11px] text-muted-foreground">{t('hr.settings.hint')}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr-settings-start">{t('hr.settings.workStart')}</Label>
            <Input
              id="hr-settings-start"
              type="time"
              value={form.workStart}
              onChange={(event) => setForm({ ...form, workStart: event.target.value })}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-settings-end">{t('hr.settings.workEnd')}</Label>
            <Input
              id="hr-settings-end"
              type="time"
              value={form.workEnd}
              onChange={(event) => setForm({ ...form, workEnd: event.target.value })}
              dir="ltr"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr-settings-grace">{t('hr.settings.graceMinutes')}</Label>
            <Input
              id="hr-settings-grace"
              type="number"
              min={0}
              max={120}
              value={form.graceMinutes}
              onChange={(event) => setForm({ ...form, graceMinutes: event.target.value })}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-settings-late">
              {t('hr.settings.lateDeductionPerMinute')}
            </Label>
            <Input
              id="hr-settings-late"
              value={form.lateDeductionPerMinute}
              onChange={(event) =>
                setForm({ ...form, lateDeductionPerMinute: event.target.value })
              }
              inputMode="decimal"
              dir="ltr"
              required
            />
            <p className="text-[11px] text-muted-foreground">{t('hr.settings.lateRuleHint')}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hr-settings-absence">
            {t('hr.settings.absenceDeductionMultiplier')}
          </Label>
          <Input
            id="hr-settings-absence"
            value={form.absenceDeductionMultiplier}
            onChange={(event) =>
              setForm({ ...form, absenceDeductionMultiplier: event.target.value })
            }
            inputMode="decimal"
            dir="ltr"
            className="sm:max-w-[220px]"
            required
          />
          <p className="text-[11px] text-muted-foreground">{t('hr.settings.absenceRuleHint')}</p>
        </div>

        <div className="space-y-2">
          <Label>{t('hr.settings.weeklyDaysOff')}</Label>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((key, day) => {
              const active = form.weeklyDaysOff.includes(day);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(key)}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-border pt-3">
          <Button type="submit" disabled={save.isPending || !valid}>
            <Save className="h-4 w-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
      <ShiftsManager />
    </div>
  );
}
