import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { customerCreateSchema, type CustomerDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { EmptyPanel, ErrorState } from '../ui/states';
import { Skeleton } from '../ui/skeleton';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../store/auth';

interface CustomerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (customer: CustomerDto) => void;
}

const EMPTY_FORM = { name: '', phone: '', address: '' };

export function CustomerPickerDialog({
  open,
  onOpenChange,
  onPick,
}: CustomerPickerDialogProps): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);
  const canCreate = can('customers:write');

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers', 'picker', query],
    queryFn: () => api.customers.list({ q: query || undefined, page: 1, pageSize: 12 }),
    enabled: open,
  });

  const createCustomer = useMutation({
    mutationFn: () => {
      const parsed = customerCreateSchema.safeParse({
        name: form.name,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t('pos.guests.createError'));
      }
      return api.customers.create(parsed.data);
    },
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(t('pos.guests.created'), customer.name);
      onPick(customer);
      handleOpenChange(false);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : t('pos.guests.createError'));
    },
  });

  const handleOpenChange = (next: boolean): void => {
    onOpenChange(next);
    if (!next) {
      setQuery('');
      setCreating(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    }
  };

  const openCreate = (): void => {
    setForm({ ...EMPTY_FORM, name: query.trim() });
    setFormError(null);
    setCreating(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={creating ? t('pos.guests.createTitle') : t('pos.guests.title')}
        description={
          creating ? t('pos.guests.createDescription') : t('pos.guests.description')
        }
        className="max-w-lg"
      >
        {creating ? (
          <>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="guest-name" className="text-xs">
                  {t('pos.guests.name')}
                </Label>
                <Input
                  id="guest-name"
                  autoFocus
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder={t('pos.guests.namePlaceholder')}
                  maxLength={120}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="guest-phone" className="text-xs">
                  {t('pos.guests.phone')}
                </Label>
                <Input
                  id="guest-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder={t('pos.guests.phonePlaceholder')}
                  maxLength={30}
                  dir="ltr"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="guest-address" className="text-xs">
                  {t('pos.guests.address')}
                </Label>
                <Input
                  id="guest-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, address: event.target.value }))
                  }
                  placeholder={t('pos.guests.addressPlaceholder')}
                  maxLength={300}
                  className="mt-1.5"
                />
              </div>
              {formError ? (
                <p className="text-[11px] font-medium text-destructive">{formError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setFormError(null);
                }}
                disabled={createCustomer.isPending}
              >
                <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" />
                {t('pos.guests.back')}
              </Button>
              <Button
                onClick={() => createCustomer.mutate()}
                disabled={createCustomer.isPending || form.name.trim().length < 2}
              >
                {createCustomer.isPending ? t('actions.saving') : t('pos.guests.save')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('pos.guests.search')}
              />
              {canCreate ? (
                <Button variant="outline" size="sm" className="shrink-0" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('pos.guests.new')}
                </Button>
              ) : null}
            </div>
            <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {customersQuery.isLoading ? (
                <div className="space-y-1 p-2" aria-busy="true" aria-label={t('pos.guests.loading')}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 px-1 py-2">
                      <Skeleton radius="full" className="h-8 w-8 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-2.5 w-1/2" />
                      </div>
                      <Skeleton className="h-4 w-4" />
                    </div>
                  ))}
                </div>
              ) : customersQuery.isError ? (
                <ErrorState
                  title={t('pos.guests.loadError')}
                  message={
                    customersQuery.error instanceof Error ? customersQuery.error.message : undefined
                  }
                  onRetry={() => void customersQuery.refetch()}
                  className="border-0 bg-transparent"
                />
              ) : (customersQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyPanel title={t('pos.guests.emptyTitle')} message={t('pos.guests.emptyMessage')} />
              ) : (
                customersQuery.data!.items.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      onPick(row);
                      handleOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-[11px] font-bold text-secondary">
                      {row.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.phone ?? t('pos.guests.noPhone')} ·{' '}
                        {t('pos.guests.ordersCount', { count: row.ordersCount })}
                      </p>
                    </div>
                    <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground rtl:-scale-x-100" />
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
