import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, UserMinus, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import type { EmployeeDto, EmploymentStatus } from '@posshope/shared';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { Input, Select } from '../components/ui/input';
import { Pagination } from '../components/ui/pagination';
import { SkeletonTable } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast';
import { EmployeeDialog } from '../components/hr/EmployeeDialog';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { formatDate, formatMoney, initials } from '../lib/format';
import { employmentStatusLabel, salaryTypeLabel } from '../lib/hr';

const PAGE_SIZE = 20;

export function EmployeesPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<EmploymentStatus | ''>('');
  const [branchId, setBranchId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDto | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<EmployeeDto | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, branchId]);

  const employees = useQuery({
    queryKey: ['hr', 'employees', { page, debouncedSearch, status, branchId }],
    queryFn: () =>
      api.hr.employees({
        page,
        pageSize: PAGE_SIZE,
        q: debouncedSearch || undefined,
        status: status || undefined,
        branchId: branchId || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
  });

  const deactivate = useMutation({
    mutationFn: (employee: EmployeeDto) =>
      api.hr.updateEmployee(employee.id, { status: 'INACTIVE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      toast.success(t('hr.employees.deactivated'));
      setDeactivateTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hr.employees.saveFailed'));
      setDeactivateTarget(null);
    },
  });

  const filtered = Boolean(debouncedSearch) || Boolean(status) || Boolean(branchId);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('hr.employees.searchPlaceholder')}
              className="h-9 ps-9"
              aria-label={t('hr.employees.searchAria')}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label={t('actions.clear')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            aria-label={t('hr.employees.status')}
            className="h-9 w-[140px]"
            value={status}
            onChange={(event) => setStatus(event.target.value as EmploymentStatus | '')}
          >
            <option value="">{t('hr.employees.allStatuses')}</option>
            <option value="ACTIVE">{t('hr.employees.statusActive')}</option>
            <option value="INACTIVE">{t('hr.employees.statusInactive')}</option>
          </Select>

          <Select
            aria-label={t('hr.employees.branch')}
            className="h-9 w-[160px]"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">{t('actions.all')}</option>
            {(branches.data ?? [])
              .filter((branch) => branch.isActive)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </Select>

          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('hr.employees.add')}
          </Button>
        </div>

        {employees.isLoading ? (
          <SkeletonTable
            label={t('states.loadingData')}
            rows={7}
            columns={[
              { kind: 'avatar', label: t('hr.employees.columns.name') },
              { kind: 'muted', label: t('hr.employees.columns.jobTitle') },
              { kind: 'muted', label: t('hr.employees.columns.branch') },
              { kind: 'muted', label: t('hr.employees.columns.hireDate') },
              { kind: 'muted', label: t('hr.employees.columns.basicSalary') },
              { kind: 'badge', label: t('hr.employees.columns.status') },
              { kind: 'actions' },
            ]}
          />
        ) : employees.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('states.error')}
              message={employees.error instanceof Error ? employees.error.message : undefined}
              onRetry={() => void employees.refetch()}
            />
          </div>
        ) : employees.data && employees.data.items.length === 0 ? (
          <EmptyPanel
            title={filtered ? t('states.noResults') : t('hr.employees.empty')}
            message={t('hr.employees.emptyMessage')}
            action={
              !filtered ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t('hr.employees.addFirst')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('hr.employees.columns.name')}</th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.employees.columns.jobTitle')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.employees.columns.branch')}</th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.employees.columns.hireDate')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.employees.columns.basicSalary')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('hr.employees.columns.salaryType')}
                  </th>
                  <th className="px-3 py-2.5 font-semibold">{t('hr.employees.columns.status')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {employees.data!.items.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-border/70 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {initials(employee.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{employee.fullName}</p>
                          <p className="numeric text-[11px] text-muted-foreground">
                            {employee.employeeCode}
                            {employee.phone ? ` · ${employee.phone}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{employee.jobTitle}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {employee.branchName ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDate(employee.hireDate)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-xs font-medium">
                      {formatMoney(employee.basicSalary)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">{salaryTypeLabel(employee.salaryType)}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'destructive'}>
                        {employmentStatusLabel(employee.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(employee);
                            setDialogOpen(true);
                          }}
                          aria-label={`${t('actions.edit')} ${employee.fullName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={employee.status === 'INACTIVE'}
                          onClick={() => setDeactivateTarget(employee)}
                          aria-label={`${t('actions.remove')} ${employee.fullName}`}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {employees.data && employees.data.total > 0 ? (
          <Pagination
            page={employees.data.page}
            pageSize={employees.data.pageSize}
            total={employees.data.total}
            totalPages={employees.data.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        employee={editing}
        branches={branches.data ?? []}
      />

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title={t('hr.employees.deactivateTitle', { name: deactivateTarget?.fullName ?? '' })}
        description={t('hr.employees.deactivateDescription')}
        confirmLabel={t('hr.employees.deactivateLabel')}
        destructive
        busy={deactivate.isPending}
        onConfirm={() => {
          if (deactivateTarget) deactivate.mutate(deactivateTarget);
        }}
      />
    </div>
  );
}
