import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import { DISCOUNT_TYPES, type DiscountDto, type DiscountType } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

export function DiscountDialog({
  open,
  onOpenChange,
  discount,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount: DiscountDto | null;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [type, setType] = useState<DiscountType>('PERCENT');
  const [value, setValue] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNameEn(discount?.nameEn ?? discount?.name ?? '');
    setNameAr(discount?.nameAr ?? '');
    setType(discount?.type ?? 'PERCENT');
    setValue(discount?.value ?? '');
    setIsActive(discount?.isActive ?? true);
  }, [open, discount]);

  const invalidValue = !(Number(value) > 0) || (type === 'PERCENT' && Number(value) > 100);

  const mutation = useMutation({
    mutationFn: () => {
      if (nameEn.trim().length < 2) throw new Error(t('menu.discount.nameRequired'));
      if (!nameAr.trim()) throw new Error(t('menu.discount.arabicRequired'));
      if (invalidValue) throw new Error(t('menu.discount.valueRequired'));
      const body = {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        type,
        value: Number(value).toFixed(2),
        isActive,
      };
      return discount ? api.discounts.update(discount.id, body) : api.discounts.create(body);
    },
    onSuccess: () => {
      toast.success(discount ? t('menu.discount.updated') : t('menu.discount.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.discount.saveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={discount ? t('menu.discount.editTitle') : t('menu.discount.newTitle')}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="discount-name" className="text-xs">
                {t('menu.discount.nameEn')}
              </Label>
              <Input
                id="discount-name"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t('menu.discount.namePlaceholderEn')}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="discount-name-ar" className="text-xs">
                {t('menu.discount.nameAr')}
              </Label>
              <Input
                id="discount-name-ar"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                placeholder={t('menu.discount.namePlaceholderAr')}
                className="mt-1.5"
                dir="rtl"
                lang="ar"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="discount-type" className="text-xs">
                {t('menu.discount.type')}
              </Label>
              <Select
                id="discount-type"
                value={type}
                onChange={(event) => setType(event.target.value as DiscountType)}
                className="mt-1.5"
              >
                {DISCOUNT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option === 'PERCENT'
                      ? t('menu.discount.percentage')
                      : t('menu.discount.fixed')}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="discount-value" className="text-xs">
                {t('menu.discount.valueLabel', {
                  unit: type === 'PERCENT' ? '%' : t('labels.currency'),
                })}
              </Label>
              <Input
                id="discount-value"
                type="number"
                min="0"
                step="0.01"
                max={type === 'PERCENT' ? 100 : undefined}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
          </div>
          {type === 'PERCENT' ? (
            <p className="text-[11px] text-muted-foreground">{t('menu.discount.cashierCapNote')}</p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            {t('menu.discount.checkout')}
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
              mutation.isPending || nameEn.trim().length < 2 || !nameAr.trim() || invalidValue
            }
          >
            {mutation.isPending
              ? t('actions.saving')
              : discount
                ? t('menu.discount.save')
                : t('menu.discount.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
