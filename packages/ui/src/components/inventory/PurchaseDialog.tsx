import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type { IngredientDto, SupplierDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { formatDecimal, unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function PurchaseDialog({
  open,
  onOpenChange,
  ingredient,
  suppliers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientDto | null;
  suppliers: SupplierDto[];
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuantity('');
    setUnitCost(ingredient?.costPerUnit ?? '');
    setSupplierId(ingredient?.supplierId ?? '');
    setReference('');
    setNote('');
    setError(null);
  }, [open, ingredient]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!(Number(quantity) > 0)) throw new Error(t('inventory.purchase.quantityError'));
      return api.inventory.purchase(ingredient!.id, {
        quantity: Number(quantity),
        unitCost: unitCost.trim() ? Number(unitCost).toFixed(2) : undefined,
        supplierId: supplierId || null,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t('inventory.purchase.success'));
      onSaved();
      onOpenChange(false);
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error ? mutationError.message : t('inventory.purchase.failed'),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          ingredient
            ? t('inventory.purchase.titleWith', { name: ingredient.name })
            : t('inventory.purchase.title')
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="purchase-quantity" className="text-xs">
              {t('inventory.purchase.quantity', {
                unit: ingredient ? unitLabel(ingredient.unit) : t('inventory.purchase.units'),
              })}
            </Label>
            <Input
              id="purchase-quantity"
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="purchase-cost" className="text-xs">
              {t('inventory.purchase.unitCost')}
            </Label>
            <Input
              id="purchase-cost"
              type="number"
              min="0"
              step="0.01"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="purchase-supplier" className="text-xs">
              {t('inventory.purchase.supplier')}
            </Label>
            <Select
              id="purchase-supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="mt-1.5"
            >
              <option value="">{t('inventory.purchase.noSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="purchase-reference" className="text-xs">
              {t('inventory.purchase.reference')}
            </Label>
            <Input
              id="purchase-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="purchase-note" className="text-xs">
              {t('inventory.purchase.note')}
            </Label>
            <Textarea
              id="purchase-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5 min-h-[60px]"
              maxLength={300}
            />
          </div>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
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
            {mutation.isPending
              ? t('inventory.purchase.receiving')
              : t('inventory.purchase.receive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
