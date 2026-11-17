import { ArrowDownUp, PackagePlus, PackageX, Pencil, Search, Trash2, Undo2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { IngredientDto } from '@posshope/shared';
import type { InventoryManagement } from '../../hooks/useInventoryManagement';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatDecimal, formatMoney, unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { Input, Select } from '../ui/input';
import { Pagination } from '../ui/pagination';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';

interface IngredientsTabProps {
  inventory: InventoryManagement;
  onEdit: (ingredient: IngredientDto) => void;
  onAdjust: (ingredient: IngredientDto) => void;
  onPurchase: (ingredient: IngredientDto) => void;
  onWaste: (ingredient: IngredientDto) => void;
  onReturn: (ingredient: IngredientDto) => void;
}

export function IngredientsTab({
  inventory,
  onEdit,
  onAdjust,
  onPurchase,
  onWaste,
  onReturn,
}: IngredientsTabProps): ReactElement {
  const { t } = useI18n();
  const {
    ingredients,
    categories,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    lowOnly,
    setLowOnly,
    setPage,
    requestDelete,
  } = inventory;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('inventory.search.placeholder')}
            className="h-9 ps-9"
            aria-label={t('inventory.search.aria')}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={t('inventory.search.clear')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <Select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label={t('inventory.filters.categoryAria')}
          className="h-9 w-[180px]"
        >
          <option value="">{t('inventory.filters.allCategories')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Button
          variant={lowOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLowOnly((current) => !current)}
        >
          {t('inventory.actions.lowStockOnly')}
        </Button>
      </div>

      {ingredients.isLoading ? (
        <SkeletonTable
          label={t('inventory.loading.ingredients')}
          rows={8}
          columns={[
            { kind: 'double', label: t('inventory.columns.ingredient') },
            { kind: 'muted', label: t('inventory.columns.category') },
            { kind: 'amount', label: t('inventory.columns.inStock') },
            { kind: 'amount', label: t('inventory.columns.minimum') },
            { kind: 'amount', label: t('inventory.columns.unitCost') },
            { kind: 'amount', label: t('inventory.columns.value') },
            { kind: 'muted', label: t('inventory.columns.storage') },
            { kind: 'muted', label: t('inventory.columns.expiry') },
            { kind: 'muted', label: t('inventory.columns.supplier') },
            { kind: 'muted', label: t('inventory.columns.updated') },
            { kind: 'actions' },
          ]}
        />
      ) : ingredients.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('inventory.errors.ingredients')}
            message={ingredients.error instanceof Error ? ingredients.error.message : undefined}
            onRetry={() => void ingredients.refetch()}
          />
        </div>
      ) : ingredients.data && ingredients.data.items.length === 0 ? (
        <EmptyPanel
          title={lowOnly ? t('inventory.empty.lowStock') : t('inventory.empty.ingredients')}
          message={
            lowOnly ? t('inventory.empty.lowStockMessage') : t('inventory.empty.ingredientsMessage')
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.ingredient')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.category')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.inStock')}
                </th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.minimum')}
                </th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.unitCost')}
                </th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.value')}
                </th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.storage')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.expiry')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.supplier')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.updated')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ingredients.data!.items.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-border/70 last:border-0 hover:bg-muted/30 ${
                    row.isLowStock ? 'bg-destructive/[0.04]' : ''
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-semibold">{row.name}</p>
                        <p className="numeric text-[11px] text-muted-foreground">{row.sku}</p>
                      </div>
                      {row.isLowStock ? (
                        <StatusBadge tone="red" label={t('inventory.badges.low')} />
                      ) : null}
                      {!row.isActive ? (
                        <StatusBadge tone="neutral" label={t('inventory.badges.inactive')} />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.categoryName ?? '—'}
                  </td>
                  <td className="numeric px-3 py-2.5 text-end font-semibold">
                    {formatDecimal(row.currentStock, 3)}{' '}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {unitLabel(row.unit)}
                    </span>
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs">
                    <p className="text-muted-foreground">{formatDecimal(row.minStock, 3)}</p>
                    {row.reorderPoint > 0 || row.maxStock > 0 ? (
                      <p className="text-[10px] text-muted-foreground/80">
                        {row.reorderPoint > 0
                          ? `${t('inventory.columns.reorder')} ${formatDecimal(row.reorderPoint, 3)}`
                          : null}
                        {row.reorderPoint > 0 && row.maxStock > 0 ? ' · ' : null}
                        {row.maxStock > 0
                          ? `${t('inventory.columns.max')} ${formatDecimal(row.maxStock, 3)}`
                          : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs">
                    <p>{formatMoney(row.costPerUnit)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t('inventory.columns.averageCost')} {formatMoney(row.averageCost)}
                    </p>
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs">
                    {formatMoney(row.stockValue)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.storageLocation ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {row.expiryDate ? formatDate(row.expiryDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.supplierName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {formatDateTime(row.updatedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onAdjust(row)}>
                        <ArrowDownUp className="h-3.5 w-3.5" />
                        {t('inventory.actions.adjust')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onPurchase(row)}>
                        <PackagePlus className="h-3.5 w-3.5" />
                        {t('inventory.actions.restock')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onWaste(row)}
                        aria-label={t('inventory.actions.waste', { name: row.name })}
                        title={t('inventory.actions.waste', { name: row.name })}
                      >
                        <PackageX className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onReturn(row)}
                        aria-label={t('inventory.actions.return', { name: row.name })}
                        title={t('inventory.actions.return', { name: row.name })}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(row)}
                        aria-label={t('inventory.actions.edit', { name: row.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          requestDelete({
                            title: t('inventory.delete.ingredientTitle', { name: row.name }),
                            description: t('inventory.delete.ingredientDescription'),
                            label: t('inventory.delete.ingredientLabel'),
                            run: () => api.inventory.removeIngredient(row.id),
                          })
                        }
                        aria-label={t('inventory.actions.delete', { name: row.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ingredients.data && ingredients.data.total > 0 ? (
        <Pagination
          page={ingredients.data.page}
          pageSize={ingredients.data.pageSize}
          total={ingredients.data.total}
          totalPages={ingredients.data.totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
