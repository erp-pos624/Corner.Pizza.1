import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { IngredientDto } from '@posshope/shared';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { useI18n } from '../../i18n';

interface DraftLine {
  key: string;
  ingredientId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

function newLine(): DraftLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ingredientId: '',
    quantity: '1',
    unitPrice: '0.00',
    discount: '0.00',
    taxRate: '0',
  };
}

export interface PurchaseOrderPrefill {
  ingredientId?: string;
  branchId?: string;
  supplierId?: string;
  quantity?: number;
  unitPrice?: string;
}

export function CreateOrderDialog({
  open,
  onOpenChange,
  suppliers,
  ingredients,
  branches,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Array<{ id: string; name: string }>;
  ingredients: IngredientDto[];
  branches: Array<{ id: string; name: string }>;
  initial?: PurchaseOrderPrefill;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0.00');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const { ingredientId: initialIngredientId, branchId: initialBranchId, supplierId: initialSupplierId, quantity: initialQuantity, unitPrice: initialUnitPrice } = initial ?? {};

  useEffect(() => {
    if (!open) return;
    setSupplierId(initialSupplierId ?? '');
    setBranchId(initialBranchId ?? '');
    setExpectedAt('');
    setNotes('');
    setDiscount('0.00');
    setLines([
      {
        ...newLine(),
        ingredientId: initialIngredientId ?? '',
        quantity: initialQuantity != null ? String(initialQuantity) : '1',
        unitPrice: initialUnitPrice ?? '0.00',
      },
    ]);
  }, [open, initialIngredientId, initialBranchId, initialSupplierId, initialQuantity, initialUnitPrice]);

  const ingredientMap = useMemo(() => {
    const map = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    return map;
  }, [ingredients]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const net = Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.discount || 0);
      subtotal += net;
      tax += (net * Number(line.taxRate || 0)) / 100;
    }
    return { subtotal, tax, total: subtotal - Number(discount || 0) + tax };
  }, [lines, discount]);

  const mutation = useMutation({
    mutationFn: () =>
      api.purchasing.createOrder({
        supplierId,
        branchId: branchId || undefined,
        expectedAt: expectedAt || undefined,
        notes: notes.trim() || undefined,
        discount: Number(discount || 0).toFixed(2),
        items: lines
          .filter((line) => line.ingredientId)
          .map((line) => ({
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity || 0),
            unitPrice: Number(line.unitPrice || 0).toFixed(2),
            discount: Number(line.discount || 0).toFixed(2),
            taxRate: Number(line.taxRate || 0),
          })),
      }),
    onSuccess: () => {
      toast.success(t('inventory.purchasing.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.purchasing.createFailed')),
  });

  const valid =
    supplierId.length > 0 &&
    lines.some(
      (line) => line.ingredientId && Number(line.quantity) > 0 && Number(line.unitPrice) >= 0,
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('inventory.purchasing.newOrder')}
        description={t('inventory.purchasing.newOrderDescription')}
        className="max-w-3xl"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier" className="text-xs">
              {t('inventory.columns.supplier')}
            </Label>
            <Select
              id="po-supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">{t('inventory.purchasing.chooseSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-branch" className="text-xs">
              {t('inventory.columns.store')}
            </Label>
            <Select
              id="po-branch"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">{t('inventory.purchasing.currentStore')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-expected" className="text-xs">
              {t('inventory.purchasing.expected')}
            </Label>
            <Input
              id="po-expected"
              type="date"
              value={expectedAt}
              onChange={(event) => setExpectedAt(event.target.value)}
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_90px_100px_90px_80px_auto] gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>{t('inventory.columns.ingredient')}</span>
            <span className="text-end">{t('inventory.purchasing.quantity')}</span>
            <span className="text-end">{t('inventory.purchasing.unitPrice')}</span>
            <span className="text-end">{t('inventory.purchasing.lineDiscount')}</span>
            <span className="text-end">{t('inventory.purchasing.taxRate')}</span>
            <span />
          </div>
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_90px_100px_90px_80px_auto]"
            >
              <Select
                value={line.ingredientId}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key
                        ? {
                            ...entry,
                            ingredientId: event.target.value,
                            unitPrice:
                              ingredientMap.get(event.target.value)?.costPerUnit ?? entry.unitPrice,
                          }
                        : entry,
                    ),
                  )
                }
                aria-label={t('inventory.columns.ingredient')}
                className="col-span-2 sm:col-span-1"
              >
                <option value="">{t('inventory.purchasing.chooseIngredient')}</option>
                {ingredients.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key ? { ...entry, quantity: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={t('inventory.purchasing.quantity')}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key ? { ...entry, unitPrice: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={t('inventory.purchasing.unitPrice')}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.discount}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key ? { ...entry, discount: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={t('inventory.purchasing.lineDiscount')}
              />
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={line.taxRate}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key ? { ...entry, taxRate: event.target.value } : entry,
                    ),
                  )
                }
                aria-label={t('inventory.purchasing.taxRate')}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('actions.remove')}
                onClick={() =>
                  setLines((current) =>
                    current.length === 1
                      ? current
                      : current.filter((entry) => entry.key !== line.key),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, newLine()])}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('inventory.purchasing.addLine')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <div className="space-y-1.5">
            <Label htmlFor="po-notes" className="text-xs">
              {t('inventory.stores.notes')}
            </Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('inventory.purchasing.subtotal')}</span>
              <span className="numeric">{formatMoney(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t('inventory.purchasing.orderDiscount')}</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                className="h-7 w-20 text-end"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('inventory.purchasing.tax')}</span>
              <span className="numeric">{formatMoney(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
              <span>{t('inventory.purchasing.total')}</span>
              <span className="numeric">{formatMoney(totals.total)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !valid}>
            {mutation.isPending ? t('actions.saving') : t('inventory.purchasing.saveDraft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
