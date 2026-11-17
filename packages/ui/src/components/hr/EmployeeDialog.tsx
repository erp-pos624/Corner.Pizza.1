import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type {
  BranchDto,
  EmployeeCreateInput,
  EmployeeDto,
  EmployeeUpdateInput,
  SalaryType,
} from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { todayIso } from '../../lib/format';

interface EmployeeFormState {
  fullName: string;
  phone: string;
  jobTitle: string;
  branchId: string;
  hireDate: string;
  basicSalary: string;
  salaryType: SalaryType;
  status: 'ACTIVE' | 'INACTIVE';
}

function emptyForm(): EmployeeFormState {
  return {
    fullName: '',
    phone: '',
    jobTitle: '',
    branchId: '',
    hireDate: todayIso(),
    basicSalary: '',
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
  };
}

function formFromEmployee(employee: EmployeeDto): EmployeeFormState {
  return {
    fullName: employee.fullName,
    phone: employee.phone ?? '',
    jobTitle: employee.jobTitle,
    branchId: employee.branchId ?? '',
    hireDate: employee.hireDate,
    basicSalary: employee.basicSalary,
    salaryType: employee.salaryType,
    status: employee.status,
  };
}

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  branches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDto | null;
  branches: BranchDto[];
}): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EmployeeFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(employee ? formFromEmployee(employee) : emptyForm());
    setError(null);
  }, [open, employee]);

  const save = useMutation({
    mutationFn: (): Promise<EmployeeDto> => {
      const base: EmployeeCreateInput = {
        fullName: form.fullName.trim(),
        jobTitle: form.jobTitle.trim(),
        hireDate: form.hireDate,
        basicSalary: form.basicSalary.trim(),
        salaryType: form.salaryType,
        status: form.status,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        branchId: form.branchId || null,
      };
      if (employee) {
        const update: EmployeeUpdateInput = { ...base };
        return api.hr.updateEmployee(employee.id, update);
      }
      return api.hr.createEmployee(base);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      toast.success(employee ? t('hr.employees.updated') : t('hr.employees.created'));
      onOpenChange(false);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error ? mutationError.message : t('hr.employees.saveFailed'),
      );
    },
  });

  const activeBranches = branches.filter((branch) => branch.isActive);
  const valid =
    form.fullName.trim().length >= 2 &&
    form.jobTitle.trim().length >= 2 &&
    Boolean(form.hireDate) &&
    Number(form.basicSalary) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={employee ? t('hr.employees.editTitle') : t('hr.employees.newTitle')}
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
              <Label htmlFor="hr-employee-name">{t('hr.employees.name')}</Label>
              <Input
                id="hr-employee-name"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-phone">{t('hr.employees.phone')}</Label>
              <Input
                id="hr-employee-phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                maxLength={30}
                dir="ltr"
                inputMode="tel"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-job">{t('hr.employees.jobTitle')}</Label>
              <Input
                id="hr-employee-job"
                value={form.jobTitle}
                onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-branch">{t('hr.employees.branch')}</Label>
              <Select
                id="hr-employee-branch"
                value={form.branchId}
                onChange={(event) => setForm({ ...form, branchId: event.target.value })}
              >
                <option value="">{t('hr.employees.noBranch')}</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-hire">{t('hr.employees.hireDate')}</Label>
              <Input
                id="hr-employee-hire"
                type="date"
                value={form.hireDate}
                onChange={(event) => setForm({ ...form, hireDate: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-salary-type">{t('hr.employees.salaryType')}</Label>
              <Select
                id="hr-employee-salary-type"
                value={form.salaryType}
                onChange={(event) =>
                  setForm({ ...form, salaryType: event.target.value as SalaryType })
                }
              >
                <option value="MONTHLY">{t('hr.employees.salaryTypeMonthly')}</option>
                <option value="DAILY">{t('hr.employees.salaryTypeDaily')}</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-salary">{t('hr.employees.basicSalary')}</Label>
              <Input
                id="hr-employee-salary"
                value={form.basicSalary}
                onChange={(event) => setForm({ ...form, basicSalary: event.target.value })}
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-employee-status">{t('hr.employees.status')}</Label>
              <Select
                id="hr-employee-status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as 'ACTIVE' | 'INACTIVE' })
                }
              >
                <option value="ACTIVE">{t('hr.employees.statusActive')}</option>
                <option value="INACTIVE">{t('hr.employees.statusInactive')}</option>
              </Select>
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
