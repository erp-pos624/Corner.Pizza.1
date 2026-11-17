import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type {
  AdjustmentCategory,
  AdjustmentCreateInput,
  AdjustmentDto,
  EmployeeDto,
} from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';

interface AdjustmentFormState {
  employeeId: string;
  category: AdjustmentCategory;
  amount: string;
  date: string;
  reason: string;
  payrollMonth: string;
}

export function AdjustmentDialog({
  open,
  onOpenChange,
  adjustment,
  employees,
  defaultMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustment: AdjustmentDto | null;
  employees: EmployeeDto[];
  defaultMonth: string;
}): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdjustmentFormState>({
    employeeId: '',
    category: 'PERFORMANCE_BONUS',
    amount: '',
    date: '',
    reason: '',
    payrollMonth: defaultMonth,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      adjustment
        ? {
            employeeId: adjustment.employeeId,
            category: adjustment.category,
            amount: adjustment.amount,
            date: adjustment.date,
            reason: adjustment.reason,
            payrollMonth: adjustment.payrollMonth,
          }
        : {
            employeeId: employees[0]?.id ?? '',
            category: 'PERFORMANCE_BONUS',
            amount: '',
            date: new Date().toISOString().slice(0, 10),
            reason: '',
            payrollMonth: defaultMonth,
          },
    );
    setError(null);
  }, [open, adjustment, employees, defaultMonth]);

  const save = useMutation({
    mutationFn: () => {
      const body: AdjustmentCreateInput = {
        employeeId: form.employeeId,
        category: form.category,
        amount: form.amount.trim(),
        date: form.date,
        reason: form.reason.trim(),
        payrollMonth: form.payrollMonth,
      };
      return adjustment
        ? api.hr.updateAdjustment(adjustment.id, body)
        : api.hr.createAdjustment(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      toast.success(adjustment ? t('hr.adjustments.updated') : t('hr.adjustments.created'));
      onOpenChange(false);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error ? mutationError.message : t('hr.adjustments.saveFailed'),
      );
    },
  });

  const valid =
    Boolean(form.employeeId) &&
    Number(form.amount) > 0 &&
    Boolean(form.date) &&
    form.reason.trim().length >= 3 &&
    Boolean(form.payrollMonth);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={adjustment ? t('hr.adjustments.editTitle') : t('hr.adjustments.newTitle')}
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
              <Label htmlFor="hr-adjustment-employee">{t('hr.adjustments.employee')}</Label>
              <Select
                id="hr-adjustment-employee"
                value={form.employeeId}
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
                required
              >
                <option value="">{t('hr.adjustments.chooseEmployee')}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} · {employee.employeeCode}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-adjustment-category">{t('hr.adjustments.category')}</Label>
              <Select
                id="hr-adjustment-category"
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value as AdjustmentCategory })
                }
              >
                <optgroup label={t('hr.adjustments.bonus')}>
                  <option value="PERFORMANCE_BONUS">{t('hr.adjustments.categoryPerformanceBonus')}</option>
                  <option value="OVERTIME">{t('hr.adjustments.categoryOvertime')}</option>
                  <option value="OTHER_BONUS">{t('hr.adjustments.categoryOtherBonus')}</option>
                </optgroup>
                <optgroup label={t('hr.adjustments.deduction')}>
                  <option value="LATE_ARRIVAL">{t('hr.adjustments.categoryLateArrival')}</option>
                  <option value="ABSENCE">{t('hr.adjustments.categoryAbsence')}</option>
                  <option value="OTHER_DEDUCTION">
                    {t('hr.adjustments.categoryOtherDeduction')}
                  </option>
                </optgroup>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-adjustment-amount">{t('hr.adjustments.amount')}</Label>
              <Input
                id="hr-adjustment-amount"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-adjustment-date">{t('hr.adjustments.date')}</Label>
              <Input
                id="hr-adjustment-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr-adjustment-month">{t('hr.adjustments.month')}</Label>
            <Input
              id="hr-adjustment-month"
              type="month"
              value={form.payrollMonth}
              onChange={(event) => setForm({ ...form, payrollMonth: event.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr-adjustment-reason">{t('hr.adjustments.reason')}</Label>
            <Textarea
              id="hr-adjustment-reason"
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              maxLength={300}
              rows={2}
              required
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
