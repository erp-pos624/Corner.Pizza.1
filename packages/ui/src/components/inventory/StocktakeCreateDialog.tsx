import { useMutation } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { IngredientDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { formatDecimal, unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function StocktakeCreateDialog({
  open,
  onOpenChange,
  ingredients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredients: IngredientDto[];
  onCreated: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setCounts({});
    setNotes('');
    setError(null);
  }, [open]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter(
      (row) =>
        row.name.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term),
    );
  }, [ingredients, search]);

  const counted = Object.entries(counts).filter(([, value]) => value.trim() !== '');

  const mutation = useMutation({
    mutationFn: () => {
      const items = counted
        .map(([ingredientId, value]) => ({ ingredientId, countedQty: Number(value) }))
        .filter((item) => Number.isFinite(item.countedQty) && item.countedQty >= 0);
      if (items.length === 0) throw new Error(t('inventory.stocktake.countError'));
      return api.inventory.createStocktake({
        notes: notes.trim() || undefined,
        items,
      });
    },
    onSuccess: () => {
      toast.success(t('inventory.stocktake.createdToast'));
      onCreated();
      onOpenChange(false);
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error ? mutationError.message : t('inventory.stocktake.errorGeneric'),
      ),
  });

  const setCount = (id: string, value: string): void =>
    setCounts((current) => ({ ...current, [id]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('inventory.stocktake.newTitle')}
        description={t('inventory.stocktake.addHint')}
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('inventory.stocktake.search')}
              className="h-9 ps-9"
              aria-label={t('inventory.stocktake.search')}
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('inventory.empty.ingredients')}
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {visible.map((row) => {
                  const value = counts[row.id] ?? '';
                  return (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {row.sku} · {t('inventory.stocktake.expected')}:{' '}
                          {formatDecimal(row.currentStock, 3)} {unitLabel(row.unit)}
                        </p>
                      </div>
                      <div className="relative w-28 shrink-0">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={value}
                          onChange={(event) => setCount(row.id, event.target.value)}
                          placeholder="0.000"
                          className="h-8 pe-7 text-end"
                          aria-label={`${t('inventory.stocktake.counted')} — ${row.name}`}
                        />
                        {value ? (
                          <button
                            type="button"
                            onClick={() => setCount(row.id, '')}
                            className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                            aria-label={t('inventory.search.clear')}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="stocktake-notes" className="text-xs">
              {t('inventory.stocktake.notes')}
            </Label>
            <Input
              id="stocktake-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('inventory.stocktake.notesPlaceholder')}
              className="mt-1.5"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {counted.length > 0
              ? t('inventory.stocktake.items', { count: counted.length })
              : t('inventory.stocktake.noItems')}
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={mutation.isPending || counted.length === 0}
          >
            {mutation.isPending ? t('inventory.stocktake.creating') : t('inventory.stocktake.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
