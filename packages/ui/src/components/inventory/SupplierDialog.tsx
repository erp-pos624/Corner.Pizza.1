import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import type { SupplierDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/toast';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDto | null;
  onSaved: () => void;
}): ReactElement {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNameEn(supplier?.nameEn ?? '');
    setNameAr(supplier?.nameAr ?? '');
    setPhone(supplier?.phone ?? '');
    setEmail(supplier?.email ?? '');
    setAddress(supplier?.address ?? '');
    setNotes(supplier?.notes ?? '');
    setIsActive(supplier?.isActive ?? true);
  }, [open, supplier]);

  const namesValid = nameEn.trim().length >= 2 && nameAr.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () => {
      if (nameEn.trim().length < 2) throw new Error(t('inventory.supplier.nameRequired'));
      if (!nameAr.trim()) throw new Error(t('inventory.supplier.arabicRequired'));
      const body = {
        name: nameEn.trim(),
        nameAr: nameAr.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        isActive,
      };
      return supplier ? api.suppliers.update(supplier.id, body) : api.suppliers.create(body);
    },
    onSuccess: () => {
      toast.success(supplier ? t('inventory.supplier.updated') : t('inventory.supplier.created'));
      onSaved();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('inventory.supplier.saveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={supplier ? t('inventory.supplier.editTitle') : t('inventory.supplier.newTitle')}
        className="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier-name-en" className="text-xs">
              {t('inventory.supplier.nameEn')}
            </Label>
            <Input
              id="supplier-name-en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder={t('inventory.supplier.namePlaceholderEn')}
              dir="ltr"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="supplier-name-ar" className="text-xs">
              {t('inventory.supplier.nameAr')}
            </Label>
            <Input
              id="supplier-name-ar"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              placeholder={t('inventory.supplier.namePlaceholderAr')}
              dir="rtl"
              lang="ar"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="supplier-phone" className="text-xs">
              {t('inventory.supplier.phone')}
            </Label>
            <Input
              id="supplier-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="supplier-email" className="text-xs">
              {t('inventory.supplier.email')}
            </Label>
            <Input
              id="supplier-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="supplier-address" className="text-xs">
              {t('inventory.supplier.address')}
            </Label>
            <Input
              id="supplier-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="supplier-notes" className="text-xs">
              {t('inventory.supplier.notes')}
            </Label>
            <Textarea
              id="supplier-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1.5 min-h-[60px]"
              maxLength={500}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            {t('inventory.supplier.active')}
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
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !namesValid}>
            {mutation.isPending
              ? t('actions.saving')
              : supplier
                ? t('inventory.supplier.save')
                : t('inventory.supplier.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
