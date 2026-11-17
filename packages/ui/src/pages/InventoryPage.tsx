import { AlertTriangle, Boxes, ClipboardList, History, Plus, Truck } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { IngredientDto, SupplierDto } from '@posshope/shared';
import { AdjustDialog } from '../components/inventory/AdjustDialog';
import { IngredientDialog } from '../components/inventory/IngredientDialog';
import { IngredientsTab } from '../components/inventory/IngredientsTab';
import { InventoryStats } from '../components/inventory/InventoryStats';
import { MovementsTab } from '../components/inventory/MovementsTab';
import { PurchaseDialog } from '../components/inventory/PurchaseDialog';
import { StockLossDialog, type StockLossMode } from '../components/inventory/StockLossDialog';
import { StocktakeCreateDialog } from '../components/inventory/StocktakeCreateDialog';
import { StocktakesTab } from '../components/inventory/StocktakesTab';
import { SupplierDialog } from '../components/inventory/SupplierDialog';
import { SuppliersTab } from '../components/inventory/SuppliersTab';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ExportActions } from '../components/ui/export-actions';
import { useInventoryManagement, type InventoryTab } from '../hooks/useInventoryManagement';
import {
  downloadCsv,
  downloadExcel,
  downloadPdf,
  type ExportValue,
} from '../lib/export';
import {
  formatDate,
  formatDecimal,
  formatMoney,
  todayIso,
  unitLabel,
} from '../lib/format';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useI18n, type TranslationKey } from '../i18n';

const TABS: Array<{ key: InventoryTab; labelKey: TranslationKey; icon: typeof Boxes }> = [
  { key: 'ingredients', labelKey: 'inventory.tabs.ingredients', icon: Boxes },
  { key: 'movements', labelKey: 'inventory.tabs.movements', icon: History },
  { key: 'stocktakes', labelKey: 'inventory.tabs.stocktakes', icon: ClipboardList },
  { key: 'suppliers', labelKey: 'inventory.tabs.suppliers', icon: Truck },
];

export function InventoryPage(): ReactElement {
  const { t } = useI18n();
  const canStocktakes = useAuthStore((state) => state.can('stocktakes:manage'));
  const [tab, setTab] = useState<InventoryTab>('ingredients');
  const inventory = useInventoryManagement(tab);

  const [ingredientDialogOpen, setIngredientDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientDto | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<IngredientDto | null>(null);
  const [purchaseTarget, setPurchaseTarget] = useState<IngredientDto | null>(null);
  const [lossTarget, setLossTarget] = useState<{
    ingredient: IngredientDto;
    mode: StockLossMode;
  } | null>(null);
  const [stocktakeDialogOpen, setStocktakeDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | null>(null);

  const tabs = TABS.filter((entry) => entry.key !== 'stocktakes' || canStocktakes);
  const reorderAlerts = inventory.reorderAlerts.data ?? [];

  const editIngredient = (ingredient: IngredientDto): void => {
    setEditingIngredient(ingredient);
    setIngredientDialogOpen(true);
  };

  const editSupplier = (supplier: SupplierDto): void => {
    setEditingSupplier(supplier);
    setSupplierDialogOpen(true);
  };

  const ingredientHeaders = (): string[] => [
    t('inventory.ingredient.sku'),
    t('inventory.columns.ingredient'),
    t('inventory.ingredient.unit'),
    t('inventory.columns.inStock'),
    t('inventory.columns.minimum'),
    t('inventory.ingredient.reorder'),
    t('inventory.columns.unitCost'),
    t('inventory.columns.value'),
    t('inventory.columns.supplier'),
  ];

  const ingredientRows = (): ExportValue[][] =>
    (inventory.allIngredients.data?.items ?? []).map((row) => [
      row.sku,
      row.name,
      unitLabel(row.unit),
      row.currentStock,
      row.minStock,
      row.reorderPoint,
      Number(row.costPerUnit),
      Number(row.stockValue),
      row.supplierName ?? '',
    ]);

  const exportBaseName = `forno-inventory-${todayIso()}`;

  const exportCsv = (): void =>
    downloadCsv(exportBaseName, [ingredientHeaders(), ...ingredientRows()]);

  const exportExcel = (): Promise<void> =>
    downloadExcel(exportBaseName, [
      {
        name: t('inventory.tabs.ingredients'),
        rows: [ingredientHeaders(), ...ingredientRows()],
        widths: [14, 26, 8, 12, 12, 12, 12, 14, 22],
      },
    ]);

  const exportPdf = (): Promise<void> =>
    downloadPdf(exportBaseName, {
      title: t('inventory.tabs.ingredients'),
      subtitle: formatDate(new Date()),
      meta: [
        { label: t('inventory.stats.ingredients'), value: formatDecimal(inventory.stats.length, 0) },
        { label: t('inventory.stats.lowStock'), value: formatDecimal(inventory.lowCount, 0) },
        { label: t('inventory.stats.stockValue'), value: formatMoney(inventory.stockValue) },
      ],
      sections: [
        {
          headers: ingredientHeaders(),
          rows: ingredientRows(),
          columnAlign: ['left', 'left', 'center', 'right', 'right', 'right', 'right', 'right', 'left'],
        },
      ],
    });

  return (
    <div className="space-y-4">
      <InventoryStats
        ingredientCount={inventory.stats.length}
        lowCount={inventory.lowCount}
        stockValue={inventory.stockValue}
        supplierCount={inventory.suppliers.data?.total ?? 0}
      />

      {reorderAlerts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800">{t('inventory.reorder.title')}</p>
            <p className="text-xs text-amber-700">
              {t('inventory.reorder.message', {
                count: formatDecimal(reorderAlerts.length, 0),
              })}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTab('ingredients');
              inventory.setLowOnly(true);
            }}
          >
            {t('inventory.reorder.action')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  tab === entry.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(entry.labelKey)}
              </button>
            );
          })}
        </div>
        {tab === 'ingredients' ? (
          <div className="flex flex-wrap items-center gap-2">
            <ExportActions
              csv={exportCsv}
              excel={exportExcel}
              pdf={exportPdf}
              disabled={ingredientRows().length === 0}
            />
            <Button
              onClick={() => {
                setEditingIngredient(null);
                setIngredientDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('inventory.actions.newIngredient')}
            </Button>
          </div>
        ) : tab === 'suppliers' ? (
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setSupplierDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('inventory.actions.newSupplier')}
          </Button>
        ) : tab === 'stocktakes' && canStocktakes ? (
          <Button onClick={() => setStocktakeDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('inventory.stocktake.newTitle')}
          </Button>
        ) : null}
      </div>

      {tab === 'ingredients' ? (
        <IngredientsTab
          inventory={inventory}
          onEdit={editIngredient}
          onAdjust={setAdjustTarget}
          onPurchase={setPurchaseTarget}
          onWaste={(ingredient) => setLossTarget({ ingredient, mode: 'waste' })}
          onReturn={(ingredient) => setLossTarget({ ingredient, mode: 'return' })}
        />
      ) : null}

      {tab === 'movements' ? <MovementsTab inventory={inventory} /> : null}

      {tab === 'stocktakes' && canStocktakes ? (
        <StocktakesTab inventory={inventory} />
      ) : null}

      {tab === 'suppliers' ? (
        <SuppliersTab
          inventory={inventory}
          onAdd={() => {
            setEditingSupplier(null);
            setSupplierDialogOpen(true);
          }}
          onEdit={editSupplier}
        />
      ) : null}

      <p className="text-[11px] text-muted-foreground">{t('inventory.footer')}</p>

      <IngredientDialog
        open={ingredientDialogOpen}
        onOpenChange={setIngredientDialogOpen}
        ingredient={editingIngredient}
        suppliers={inventory.suppliers.data?.items ?? []}
        categories={inventory.categories.data ?? []}
        onSaved={inventory.invalidate}
      />

      <AdjustDialog
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAdjustTarget(null);
        }}
        ingredient={adjustTarget}
        onSaved={inventory.invalidate}
      />

      <StockLossDialog
        mode={lossTarget?.mode ?? null}
        ingredient={lossTarget?.ingredient ?? null}
        onOpenChange={(open) => {
          if (!open) setLossTarget(null);
        }}
        onSaved={inventory.invalidate}
      />

      <PurchaseDialog
        open={purchaseTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPurchaseTarget(null);
        }}
        ingredient={purchaseTarget}
        suppliers={inventory.suppliers.data?.items ?? []}
        onSaved={inventory.invalidate}
      />

      <StocktakeCreateDialog
        open={stocktakeDialogOpen}
        onOpenChange={setStocktakeDialogOpen}
        ingredients={inventory.allIngredients.data?.items ?? []}
        onCreated={inventory.invalidate}
      />

      <SupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        supplier={editingSupplier}
        onSaved={inventory.invalidate}
      />

      <ConfirmDialog
        open={inventory.pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) inventory.clearPendingDelete();
        }}
        title={inventory.pendingDelete?.title ?? t('actions.delete')}
        description={inventory.pendingDelete?.description ?? ''}
        confirmLabel={inventory.pendingDelete?.label ?? t('actions.delete')}
        destructive
        busy={inventory.remove.isPending}
        onConfirm={() => {
          if (inventory.pendingDelete)
            inventory.remove.mutate({ run: inventory.pendingDelete.run });
        }}
      />
    </div>
  );
}

