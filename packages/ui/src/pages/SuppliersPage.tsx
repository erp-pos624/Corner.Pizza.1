import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { SupplierDto } from '@posshope/shared';
import { SupplierDialog } from '../components/inventory/SupplierDialog';
import { SuppliersTab } from '../components/inventory/SuppliersTab';
import { Button } from '../components/ui/button';
import { useInventoryManagement } from '../hooks/useInventoryManagement';
import { useI18n } from '../i18n';

export function SuppliersPage(): ReactElement {
  const { t } = useI18n();
  const inventory = useInventoryManagement('suppliers');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);

  const openCreate = (): void => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('inventory.suppliersPage.subtitle')}</p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('inventory.actions.newSupplier')}
        </Button>
      </div>

      <SuppliersTab
        inventory={inventory}
        onAdd={openCreate}
        onEdit={(supplier) => {
          setEditing(supplier);
          setDialogOpen(true);
        }}
      />

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editing}
        onSaved={inventory.invalidate}
      />
    </div>
  );
}
