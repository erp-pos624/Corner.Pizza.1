import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { transferCreateSchema } from '@posshope/shared';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { formatDecimal, unitLabel } from '../../lib/format';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';

interface TransferRow {
  key: number;
  ingredientId: string;
  quantity: string;
}

export function TransferCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(1);

  useEffect(() => {
    if (!open) return;
    setFromBranchId('');
    setToBranchId('');
    setNotes('');
    setRows([{ key: 0, ingredientId: '', quantity: '' }]);
    setError(null);
    nextKey.current = 1;
  }, [open]);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: open,
  });
  const activeBranches = (branches.data ?? []).filter((branch) => branch.isActive);

  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'transfer-source', fromBranchId],
    queryFn: () =>
      api.inventory.ingredients({ page: 1, pageSize: 300, branchId: fromBranchId }),
    enabled: open && Boolean(fromBranchId),
    staleTime: 30_000,
  });
  const ingredientOptions = (ingredients.data?.items ?? []).filter(
    (ingredient) => ingredient.isActive,
  );

  const create = useMutation({
    mutationFn: () => {
      if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) {
        throw new Error(t('branches.transfers.create.errors.branches'));
      }
      const filled = rows.filter((row) => row.ingredientId.length > 0);
      if (filled.length === 0) throw new Error(t('branches.transfers.create.errors.items'));
      if (filled.some((row) => !(Number(row.quantity) > 0))) {
        throw new Error(t('branches.transfers.create.errors.quantity'));
      }
      const seen = new Set<string>();
      for (const row of filled) {
        if (seen.has(row.ingredientId)) {
          throw new Error(t('branches.transfers.create.errors.duplicate'));
        }
        seen.add(row.ingredientId);
      }
      const parsed = transferCreateSchema.safeParse({
        fromBranchId,
        toBranchId,
        notes: notes.trim() || undefined,
        items: filled.map((row) => ({
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
        })),
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? t('branches.transfers.create.errors.items'),
        );
      }
      return api.inventory.createTransfer(parsed.data);
    },
    onSuccess: () => {
      toast.success(t('branches.transfers.create.success'));
      onCreated();
      onOpenChange(false);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : t('branches.transfers.errors.update'),
      );
    },
  });

  const updateRow = (key: number, patch: Partial<TransferRow>): void => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('branches.transfers.create.title')}
        description={t('branches.transfers.create.description')}
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-from">{t('branches.transfers.create.from')}</Label>
              <Select
                id="transfer-from"
                value={fromBranchId}
                onChange={(event) => {
                  setFromBranchId(event.target.value);
                  setRows([{ key: nextKey.current++, ingredientId: '', quantity: '' }]);
                }}
              >
                <option value="">{t('branches.transfers.create.branchPlaceholder')}</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-to">{t('branches.transfers.create.to')}</Label>
              <Select
                id="transfer-to"
                value={toBranchId}
                onChange={(event) => setToBranchId(event.target.value)}
              >
                <option value="">{t('branches.transfers.create.branchPlaceholder')}</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id} disabled={branch.id === fromBranchId}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transfer-notes">{t('branches.transfers.create.notes')}</Label>
            <Textarea
              id="transfer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('branches.transfers.create.notesPlaceholder')}
              maxLength={400}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t('branches.transfers.create.ingredients')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    { key: nextKey.current++, ingredientId: '', quantity: '' },
                  ])
                }
                disabled={!fromBranchId || ingredientOptions.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('branches.transfers.create.addItem')}
              </Button>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('branches.transfers.create.ingredient')}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('branches.transfers.create.quantity')}
              </span>
              <span />
            </div>

            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-2"
              >
                <Select
                  aria-label={t('branches.transfers.create.ingredient')}
                  value={row.ingredientId}
                  onChange={(event) =>
                    updateRow(row.key, { ingredientId: event.target.value })
                  }
                >
                  <option value="">{t('branches.transfers.create.selectIngredient')}</option>
                  {ingredientOptions.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {`${ingredient.name} — ${t('branches.transfers.create.available', {
                        quantity: formatDecimal(ingredient.currentStock, 3),
                        unit: unitLabel(ingredient.unit),
                      })}`}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={t('branches.transfers.create.quantity')}
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0.000"
                  value={row.quantity}
                  onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                  className="numeric"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                  disabled={rows.length === 1}
                  aria-label={t('branches.transfers.create.removeAria')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {fromBranchId && ingredients.isSuccess && ingredientOptions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {t('branches.transfers.create.noIngredients')}
              </p>
            ) : null}
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || !fromBranchId || !toBranchId}
          >
            {create.isPending
              ? t('branches.transfers.create.submitting')
              : t('branches.transfers.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
