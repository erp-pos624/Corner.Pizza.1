import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import {
  INGREDIENT_UNITS,
  type IngredientCategoryDto,
  type IngredientDto,
  type IngredientUnit,
  type SupplierDto,
} from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  suppliers,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientDto | null;
  suppliers: SupplierDto[];
  categories: IngredientCategoryDto[];
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState<IngredientUnit>('KG');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [reorderPoint, setReorderPoint] = useState('0');
  const [maxStock, setMaxStock] = useState('0');
  const [costPerUnit, setCostPerUnit] = useState('0.00');
  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNameEn(ingredient?.nameEn ?? '');
    setNameAr(ingredient?.nameAr ?? '');
    setSku(ingredient?.sku ?? '');
    setUnit(ingredient?.unit ?? 'KG');
    setCurrentStock(String(ingredient?.currentStock ?? 0));
    setMinStock(String(ingredient?.minStock ?? 0));
    setReorderPoint(String(ingredient?.reorderPoint ?? 0));
    setMaxStock(String(ingredient?.maxStock ?? 0));
    setCostPerUnit(ingredient?.costPerUnit ?? '0.00');
    setSupplierId(ingredient?.supplierId ?? '');
    setCategoryId(ingredient?.categoryId ?? '');
    setStorageLocation(ingredient?.storageLocation ?? '');
    setExpiryDate(ingredient?.expiryDate ?? '');
    setIsActive(ingredient?.isActive ?? true);
  }, [open, ingredient]);

  const namesValid = nameEn.trim().length >= 2 && nameAr.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () => {
      if (nameEn.trim().length < 2) throw new Error(t('inventory.ingredient.nameRequired'));
      if (!nameAr.trim()) throw new Error(t('inventory.ingredient.arabicRequired'));
      const body = {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        sku: sku.trim() || undefined,
        unit,
        minStock: Number(minStock || 0),
        reorderPoint: Number(reorderPoint || 0),
        maxStock: Number(maxStock || 0),
        costPerUnit: Number(costPerUnit || 0).toFixed(2),
        supplierId: supplierId || null,
        categoryId: categoryId || null,
        storageLocation: storageLocation.trim() || undefined,
        expiryDate: expiryDate || undefined,
        isActive,
      };
      return ingredient
        ? api.inventory.updateIngredient(ingredient.id, body)
        : api.inventory.createIngredient({ ...body, currentStock: Number(currentStock || 0) });
    },
    onSuccess: () => {
      toast.success(
        ingredient ? t('inventory.ingredient.updated') : t('inventory.ingredient.created'),
      );
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.ingredient.saveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          ingredient ? t('inventory.ingredient.editTitle') : t('inventory.ingredient.newTitle')
        }
        className="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ingredient-name-en" className="text-xs">
              {t('inventory.ingredient.nameEn')}
            </Label>
            <Input
              id="ingredient-name-en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder={t('inventory.ingredient.namePlaceholderEn')}
              dir="ltr"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-name-ar" className="text-xs">
              {t('inventory.ingredient.nameAr')}
            </Label>
            <Input
              id="ingredient-name-ar"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              placeholder={t('inventory.ingredient.namePlaceholderAr')}
              dir="rtl"
              lang="ar"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-sku" className="text-xs">
              {t('inventory.ingredient.sku')}
            </Label>
            <Input
              id="ingredient-sku"
              value={sku}
              onChange={(event) => setSku(event.target.value.toUpperCase())}
              placeholder={t('inventory.ingredient.skuPlaceholder')}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-unit" className="text-xs">
              {t('inventory.ingredient.unit')}
            </Label>
            <Select
              id="ingredient-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value as IngredientUnit)}
              className="mt-1.5"
            >
              {INGREDIENT_UNITS.map((option) => (
                <option key={option} value={option}>
                  {unitLabel(option)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ingredient-category" className="text-xs">
              {t('inventory.ingredient.category')}
            </Label>
            <Select
              id="ingredient-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="mt-1.5"
            >
              <option value="">{t('inventory.ingredient.noCategory')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          {!ingredient ? (
            <div>
              <Label htmlFor="ingredient-stock" className="text-xs">
                {t('inventory.ingredient.openingStock')}
              </Label>
              <Input
                id="ingredient-stock"
                type="number"
                min="0"
                step="0.001"
                value={currentStock}
                onChange={(event) => setCurrentStock(event.target.value)}
                className="mt-1.5"
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="ingredient-min" className="text-xs">
              {t('inventory.ingredient.minimum')}
            </Label>
            <Input
              id="ingredient-min"
              type="number"
              min="0"
              step="0.001"
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-reorder" className="text-xs">
              {t('inventory.ingredient.reorder')}
            </Label>
            <Input
              id="ingredient-reorder"
              type="number"
              min="0"
              step="0.001"
              value={reorderPoint}
              onChange={(event) => setReorderPoint(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-max" className="text-xs">
              {t('inventory.ingredient.maxStock')}
            </Label>
            <Input
              id="ingredient-max"
              type="number"
              min="0"
              step="0.001"
              value={maxStock}
              onChange={(event) => setMaxStock(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-location" className="text-xs">
              {t('inventory.ingredient.storageLocation')}
            </Label>
            <Input
              id="ingredient-location"
              value={storageLocation}
              onChange={(event) => setStorageLocation(event.target.value)}
              placeholder={t('inventory.ingredient.storagePlaceholder')}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-expiry" className="text-xs">
              {t('inventory.ingredient.expiryDate')}
            </Label>
            <Input
              id="ingredient-expiry"
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              className="mt-1.5"
              dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-cost" className="text-xs">
              {t('inventory.ingredient.cost')}
            </Label>
            <Input
              id="ingredient-cost"
              type="number"
              min="0"
              step="0.01"
              value={costPerUnit}
              onChange={(event) => setCostPerUnit(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="ingredient-supplier" className="text-xs">
              {t('inventory.ingredient.supplier')}
            </Label>
            <Select
              id="ingredient-supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="mt-1.5"
            >
              <option value="">{t('inventory.ingredient.noSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="mt-5 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            {t('inventory.ingredient.active')}
          </label>
        </div>
        {ingredient ? (
          <p className="text-[11px] text-muted-foreground">{t('inventory.ingredient.hint')}</p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !namesValid}>
            {mutation.isPending
              ? t('actions.saving')
              : ingredient
                ? t('inventory.ingredient.save')
                : t('inventory.ingredient.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
