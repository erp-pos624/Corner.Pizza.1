import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type { IngredientDto, ToppingDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function ToppingDialog({
  open,
  onOpenChange,
  topping,
  ingredients,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topping: ToppingDto | null;
  ingredients: IngredientDto[];
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [price, setPrice] = useState('');
  const [ingredientId, setIngredientId] = useState('');
  const [ingredientQuantity, setIngredientQuantity] = useState('0');
  const [isAvailable, setIsAvailable] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');

  useEffect(() => {
    if (!open) return;
    setNameEn(topping?.nameEn ?? topping?.name ?? '');
    setNameAr(topping?.nameAr ?? '');
    setPrice(topping?.price ?? '');
    setIngredientId(topping?.ingredientId ?? '');
    setIngredientQuantity(String(topping?.ingredientQuantity ?? 0));
    setIsAvailable(topping?.isAvailable ?? true);
    setSortOrder(String(topping?.sortOrder ?? 0));
  }, [open, topping]);

  const mutation = useMutation({
    mutationFn: () => {
      if (nameEn.trim().length < 2) throw new Error(t('menu.topping.nameRequired'));
      if (!nameAr.trim()) throw new Error(t('menu.topping.arabicRequired'));
      if (!(Number(price) > 0)) throw new Error(t('menu.topping.priceRequired'));
      const body = {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        price: price.trim(),
        ingredientId: ingredientId || null,
        ingredientQuantity: Number(ingredientQuantity || 0),
        isAvailable,
        sortOrder: Number(sortOrder || 0),
      };
      return topping
        ? api.menu.updateTopping(topping.id, body)
        : api.menu.createTopping({ ...body, ingredientId: ingredientId || undefined });
    },
    onSuccess: () => {
      toast.success(topping ? t('menu.topping.updated') : t('menu.topping.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.topping.saveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={topping ? t('menu.topping.editTitle') : t('menu.topping.newTitle')}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="topping-name" className="text-xs">
                {t('menu.topping.nameEn')}
              </Label>
              <Input
                id="topping-name"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t('menu.topping.namePlaceholderEn')}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="topping-name-ar" className="text-xs">
                {t('menu.topping.nameAr')}
              </Label>
              <Input
                id="topping-name-ar"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                placeholder={t('menu.topping.namePlaceholderAr')}
                className="mt-1.5"
                dir="rtl"
                lang="ar"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="topping-price" className="text-xs">
                {t('menu.topping.price')}
              </Label>
              <Input
                id="topping-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="topping-sort" className="text-xs">
                {t('menu.topping.sort')}
              </Label>
              <Input
                id="topping-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="topping-ingredient" className="text-xs">
              {t('menu.topping.ingredient')}
            </Label>
            <Select
              id="topping-ingredient"
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              className="mt-1.5"
            >
              <option value="">{t('menu.topping.noDeduction')}</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} ({unitLabel(ingredient.unit)})
                </option>
              ))}
            </Select>
          </div>
          {ingredientId ? (
            <div>
              <Label htmlFor="topping-quantity" className="text-xs">
                {t('menu.topping.quantity', {
                  unit: unitLabel(ingredients.find((row) => row.id === ingredientId)?.unit ?? 'KG'),
                })}
              </Label>
              <Input
                id="topping-quantity"
                type="number"
                min="0"
                step="0.001"
                value={ingredientQuantity}
                onChange={(event) => setIngredientQuantity(event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
            />
            {t('menu.topping.available')}
          </label>
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
            disabled={
              mutation.isPending ||
              nameEn.trim().length < 2 ||
              !nameAr.trim() ||
              !(Number(price) > 0)
            }
          >
            {mutation.isPending
              ? t('actions.saving')
              : topping
                ? t('menu.topping.save')
                : t('menu.topping.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
