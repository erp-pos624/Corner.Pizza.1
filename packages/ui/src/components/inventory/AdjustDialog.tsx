import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type { IngredientDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { formatDecimal, unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function AdjustDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientDto | null;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDirection('add');
    setQuantity('');
    setReason('');
    setError(null);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      const amount = Number(quantity);
      if (!(amount > 0)) throw new Error(t('inventory.adjust.quantityError'));
      if (reason.trim().length < 3) throw new Error(t('inventory.adjust.reasonError'));
      if (direction === 'remove' && ingredient && amount > ingredient.currentStock) {
        throw new Error(t('inventory.adjust.tooMuch'));
      }
      return api.inventory.adjust(ingredient!.id, {
        quantity: direction === 'add' ? amount : -amount,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success(t('inventory.adjust.success'));
      onSaved();
      onOpenChange(false);
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error ? mutationError.message : t('inventory.adjust.failed'),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          ingredient
            ? t('inventory.adjust.titleWith', { name: ingredient.name })
            : t('inventory.adjust.title')
        }
        description={
          ingredient
            ? t('inventory.adjust.currentStock', {
                quantity: formatDecimal(ingredient.currentStock, 3),
                unit: unitLabel(ingredient.unit),
              })
            : undefined
        }
        className="max-w-md"
      >
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={direction === 'add' ? 'default' : 'outline'}
            onClick={() => setDirection('add')}
          >
            {t('inventory.adjust.add')}
          </Button>
          <Button
            variant={direction === 'remove' ? 'destructive' : 'outline'}
            onClick={() => setDirection('remove')}
          >
            {t('inventory.adjust.remove')}
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="adjust-quantity" className="text-xs">
              {t('inventory.adjust.quantity', {
                unit: ingredient ? unitLabel(ingredient.unit) : t('inventory.adjust.units'),
              })}
            </Label>
            <Input
              id="adjust-quantity"
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1.5"
              placeholder="0.000"
            />
          </div>
          <div>
            <Label htmlFor="adjust-reason" className="text-xs">
              {t('inventory.adjust.reason')}
            </Label>
            <Input
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('inventory.adjust.reasonPlaceholder')}
              className="mt-1.5"
            />
          </div>
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !(Number(quantity) > 0)}
          >
            {mutation.isPending ? t('inventory.adjust.applying') : t('inventory.adjust.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
