import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Store } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { branchCreateSchema, type BranchDto } from '@posshope/shared';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { useLanguageStore } from '../../store/language';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { toast } from '../ui/toast';

interface BranchFormState {
  code: string;
  name: string;
  nameAr: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  isActive: boolean;
}

const EMPTY_FORM: BranchFormState = {
  code: '',
  name: '',
  nameAr: '',
  address: '',
  phone: '',
  latitude: '',
  longitude: '',
  isActive: true,
};

export function BranchesTab(): ReactElement {
  const { t } = useI18n();
  const language = useLanguageStore((state) => state.language);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BranchDto | null>(null);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (args: { id: string | null; form: BranchFormState }) => {
      const parsed = branchCreateSchema.safeParse({
        code: args.form.code.trim().toUpperCase(),
        name: args.form.name.trim(),
        nameAr: args.form.nameAr.trim() || undefined,
        address: args.form.address.trim() || undefined,
        phone: args.form.phone.trim() || undefined,
        latitude: args.form.latitude.trim() ? Number(args.form.latitude) : null,
        longitude: args.form.longitude.trim() ? Number(args.form.longitude) : null,
        isActive: args.form.isActive,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t('branches.errors.save'));
      }
      return args.id ? api.branches.update(args.id, parsed.data) : api.branches.create(parsed.data);
    },
    onSuccess: (branch, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success(
        variables.id ? t('branches.toasts.updated') : t('branches.toasts.created'),
        branch.name,
      );
      setDialogOpen(false);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : t('branches.errors.save'));
    },
  });

  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (branch: BranchDto): void => {
    setEditing(branch);
    setForm({
      code: branch.code,
      name: branch.name,
      nameAr: branch.nameAr ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      latitude: branch.latitude == null ? '' : String(branch.latitude),
      longitude: branch.longitude == null ? '' : String(branch.longitude),
      isActive: branch.isActive,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const rows = branches.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Store className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('branches.tabs.branches')}</h2>
        </div>
        {branches.data ? (
          <span className="text-xs text-muted-foreground">
            {t('branches.count', { count: formatNumber(rows.length) })}
          </span>
        ) : null}
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('branches.new')}
        </Button>
      </div>

      {branches.isLoading ? (
        <SkeletonTable
          label={t('branches.loading')}
          rows={4}
          columns={[
            { kind: 'text', label: t('branches.columns.branch') },
            { kind: 'muted', label: t('branches.columns.contact') },
            { kind: 'badge', label: t('branches.columns.status') },
            { kind: 'muted', label: t('branches.columns.created') },
            { kind: 'actions' },
          ]}
        />
      ) : branches.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('branches.errors.load')}
            message={branches.error instanceof Error ? branches.error.message : undefined}
            onRetry={() => void branches.refetch()}
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyPanel
          title={t('branches.empty.title')}
          message={t('branches.empty.message')}
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('branches.new')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('branches.columns.branch')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('branches.columns.contact')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('branches.columns.status')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('branches.columns.created')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((branch) => {
                const primary = language === 'ar' && branch.nameAr ? branch.nameAr : branch.name;
                const secondary = language === 'ar' ? branch.name : branch.nameAr;
                return (
                  <tr
                    key={branch.id}
                    className="border-b border-border/70 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                          <Store className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-semibold">
                            {primary}
                            <Badge variant="outline" className="numeric">
                              {branch.code}
                            </Badge>
                          </p>
                          {secondary ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {secondary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <p className="numeric">{branch.phone ?? '—'}</p>
                      <p className="truncate">{branch.address ?? ''}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={branch.isActive ? 'success' : 'destructive'}>
                        {branch.isActive
                          ? t('branches.status.active')
                          : t('branches.status.inactive')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDate(branch.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(branch)}
                          aria-label={t('branches.actions.edit')}
                          title={t('branches.actions.edit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent
          title={
            editing ? t('branches.editTitle', { name: editing.name }) : t('branches.createTitle')
          }
          description={editing ? t('branches.editDescription') : t('branches.createDescription')}
          className="max-w-lg"
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ id: editing?.id ?? null, form });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="branch-code">{t('branches.form.code')}</Label>
                <Input
                  id="branch-code"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  placeholder={t('branches.form.codePlaceholder')}
                  maxLength={12}
                  dir="ltr"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">{t('branches.form.codeHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-phone">{t('branches.form.phone')}</Label>
                <Input
                  id="branch-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder={t('branches.form.phonePlaceholder')}
                  maxLength={30}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-name">{t('branches.form.name')}</Label>
              <Input
                id="branch-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={t('branches.form.namePlaceholder')}
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-name-ar">{t('branches.form.nameAr')}</Label>
              <Input
                id="branch-name-ar"
                value={form.nameAr}
                onChange={(event) => setForm({ ...form, nameAr: event.target.value })}
                placeholder={t('branches.form.nameArPlaceholder')}
                maxLength={120}
                dir="rtl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-address">{t('branches.form.address')}</Label>
              <Input
                id="branch-address"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder={t('branches.form.addressPlaceholder')}
                maxLength={300}
              />
            </div>

            <div className="space-y-1.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="branch-latitude">{t('branches.form.latitude')}</Label>
                  <Input
                    id="branch-latitude"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={form.latitude}
                    onChange={(event) => setForm({ ...form, latitude: event.target.value })}
                    placeholder="30.044400"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="branch-longitude">{t('branches.form.longitude')}</Label>
                  <Input
                    id="branch-longitude"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={form.longitude}
                    onChange={(event) => setForm({ ...form, longitude: event.target.value })}
                    placeholder="31.235700"
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('branches.form.coordinatesHint')}
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              <span className="text-sm">
                <span className="block font-medium">{t('branches.form.active')}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t('branches.form.activeHint')}
                </span>
              </span>
            </label>

            {formError ? (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  save.isPending || form.code.trim().length < 2 || form.name.trim().length < 2
                }
              >
                {save.isPending ? t('branches.submitting') : t('branches.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
