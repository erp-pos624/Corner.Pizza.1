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

export type StockLossMode = 'waste' | 'return';

export function StockLossDialog({
  mode,
  onOpenChange,
  ingredient,
  onSaved,
}: {
  mode: StockLossMode | null;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientDto | null;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setQuantity('');
    setReason('');
    setError(null);
  }, [mode, ingredient?.id]);

  const isReturn = mode === 'return';

  const mutation = useMutation({
    mutationFn: () => {
      const amount = Number(quantity);
      if (!(amount > 0)) throw new Error(t('inventory.loss.quantityError'));
      if (reason.trim().length < 3) throw new Error(t('inventory.loss.reasonError'));
      if (ingredient && amount > ingredient.currentStock) {
        throw new Error(t('inventory.loss.tooMuch'));
      }
      const body = { quantity: amount, reason: reason.trim() };
      return isReturn
        ? api.inventory.returnStock(ingredient!.id, body)
        : api.inventory.waste(ingredient!.id, body);
    },
    onSuccess: () => {
      toast.success(
        isReturn ? t('inventory.loss.successReturn') : t('inventory.loss.successWaste'),
      );
      onSaved();
      onOpenChange(false);
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : t('inventory.loss.failed')),
  });

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          ingredient
            ? t(isReturn ? 'inventory.loss.returnTitleWith' : 'inventory.loss.wasteTitleWith', {
                name: ingredient.name,
              })
            : t(isReturn ? 'inventory.loss.returnTitle' : 'inventory.loss.wasteTitle')
        }
        description={t(isReturn ? 'inventory.loss.returnHint' : 'inventory.loss.wasteHint')}
        className="max-w-md"
      >
        {ingredient ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {t('inventory.loss.currentStock', {
              quantity: formatDecimal(ingredient.currentStock, 3),
              unit: unitLabel(ingredient.unit),
            })}
          </p>
        ) : null}
        <div className="space-y-3">
          <div>
            <Label htmlFor="loss-quantity" className="text-xs">
              {t('inventory.loss.quantity', {
                unit: ingredient ? unitLabel(ingredient.unit) : t('inventory.adjust.units'),
              })}
            </Label>
            <Input
              id="loss-quantity"
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
            <Label htmlFor="loss-reason" className="text-xs">
              {t('inventory.loss.reason')}
            </Label>
            <Input
              id="loss-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t(
                isReturn
                  ? 'inventory.loss.returnReasonPlaceholder'
                  : 'inventory.loss.wasteReasonPlaceholder',
              )}
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
            variant={isReturn ? 'default' : 'destructive'}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !(Number(quantity) > 0)}
          >
            {mutation.isPending
              ? t('inventory.loss.saving')
              : t(isReturn ? 'inventory.loss.submitReturn' : 'inventory.loss.submitWaste')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
