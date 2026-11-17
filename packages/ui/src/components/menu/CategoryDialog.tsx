import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type { CategoryDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryDto | null;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNameEn(category?.nameEn ?? category?.name ?? '');
    setNameAr(category?.nameAr ?? '');
    setDescriptionEn(category?.descriptionEn ?? category?.description ?? '');
    setDescriptionAr(category?.descriptionAr ?? '');
    setSortOrder(String(category?.sortOrder ?? 0));
    setIsActive(category?.isActive ?? true);
  }, [open, category]);

  const mutation = useMutation({
    mutationFn: () => {
      if (nameEn.trim().length < 2) throw new Error(t('menu.category.nameRequired'));
      if (!nameAr.trim()) throw new Error(t('menu.category.arabicRequired'));
      const body = {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        description: descriptionEn.trim() || undefined,
        descriptionAr: descriptionAr.trim() || undefined,
        sortOrder: Number(sortOrder || 0),
        isActive,
      };
      return category ? api.categories.update(category.id, body) : api.categories.create(body);
    },
    onSuccess: () => {
      toast.success(category ? t('menu.category.updated') : t('menu.category.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.category.saveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={category ? t('menu.category.editTitle') : t('menu.category.newTitle')}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-name" className="text-xs">
                {t('menu.category.nameEn')}
              </Label>
              <Input
                id="category-name"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={t('menu.category.namePlaceholderEn')}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="category-name-ar" className="text-xs">
                {t('menu.category.nameAr')}
              </Label>
              <Input
                id="category-name-ar"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                placeholder={t('menu.category.namePlaceholderAr')}
                className="mt-1.5"
                dir="rtl"
                lang="ar"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-description" className="text-xs">
                {t('menu.category.descriptionEn')}
              </Label>
              <Textarea
                id="category-description"
                value={descriptionEn}
                onChange={(event) => setDescriptionEn(event.target.value)}
                placeholder={t('menu.category.descriptionPlaceholderEn')}
                maxLength={300}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="category-description-ar" className="text-xs">
                {t('menu.category.descriptionAr')}
              </Label>
              <Textarea
                id="category-description-ar"
                value={descriptionAr}
                onChange={(event) => setDescriptionAr(event.target.value)}
                placeholder={t('menu.category.descriptionPlaceholderAr')}
                maxLength={300}
                className="mt-1.5"
                dir="rtl"
                lang="ar"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category-sort" className="text-xs">
                {t('menu.category.sort')}
              </Label>
              <Input
                id="category-sort"
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className="mt-1.5"
                dir="ltr"
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              {t('menu.category.visibleInPos')}
            </label>
          </div>
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
            disabled={mutation.isPending || nameEn.trim().length < 2 || !nameAr.trim()}
          >
            {mutation.isPending
              ? t('actions.saving')
              : category
                ? t('menu.category.save')
                : t('menu.category.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
