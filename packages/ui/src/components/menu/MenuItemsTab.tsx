import { ChefHat, Pencil, Plus, Search, Trash2, UtensilsCrossed, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { MenuItemDto } from '@posshope/shared';
import type { MenuManagement } from '../../hooks/useMenuManagement';
import { api } from '../../lib/api';
import { formatMoney, menuKindLabel } from '../../lib/format';
import { resolveImageUrl } from '../../lib/images';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { Input, Select } from '../ui/input';
import { Pagination } from '../ui/pagination';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { Toggle } from '../ui/toggle';

interface MenuItemsTabProps {
  menu: MenuManagement;
  onAdd: () => void;
  onEdit: (item: MenuItemDto) => void;
  onRecipe: (item: MenuItemDto) => void;
}

export function MenuItemsTab({ menu, onAdd, onEdit, onRecipe }: MenuItemsTabProps): ReactElement {
  const { t } = useI18n();
  const {
    items,
    categories,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    availability,
    setAvailability,
    showRetired,
    setShowRetired,
    setPage,
    toggleItem,
    requestDelete,
  } = menu;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('menu.search.placeholder')}
            className="h-9 ps-9"
            aria-label={t('menu.search.aria')}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={t('menu.search.clear')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label={t('menu.filters.categoryAria')}
          className="h-9 w-[170px]"
        >
          <option value="">{t('menu.filters.allCategories')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          value={availability}
          onChange={(event) => setAvailability(event.target.value as typeof availability)}
          aria-label={t('menu.filters.availabilityAria')}
          className="h-9 w-[150px]"
        >
          <option value="all">{t('menu.filters.allAvailability')}</option>
          <option value="available">{t('menu.filters.available')}</option>
          <option value="soldout">{t('menu.filters.soldOut')}</option>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={showRetired}
            onChange={(event) => setShowRetired(event.target.checked)}
          />
          {t('menu.filters.showRetired')}
        </label>
      </div>

      {items.isLoading ? (
        <SkeletonTable
          label={t('menu.loading.items')}
          rows={8}
          columns={[
            { kind: 'image', label: t('menu.columns.item') },
            { kind: 'text', label: t('menu.columns.category') },
            { kind: 'text', label: t('menu.columns.kind') },
            { kind: 'amount', label: t('menu.columns.price') },
            { kind: 'amount', label: t('menu.columns.foodCost') },
            { kind: 'muted', label: t('menu.columns.sizes') },
            { kind: 'toggle', label: t('menu.columns.status') },
            { kind: 'actions' },
          ]}
        />
      ) : items.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('menu.errors.items')}
            message={items.error instanceof Error ? items.error.message : undefined}
            onRetry={() => void items.refetch()}
          />
        </div>
      ) : items.data && items.data.items.length === 0 ? (
        <EmptyPanel
          title={t('menu.empty.items')}
          message={t('menu.empty.itemsMessage')}
          action={
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              {t('menu.add.item')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.item')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.category')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.kind')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">{t('menu.columns.price')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">{t('menu.columns.foodCost')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.sizes')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.status')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.data!.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {resolveImageUrl(item.imageUrl) ? (
                        <img
                          src={resolveImageUrl(item.imageUrl)!}
                          alt=""
                          className="h-9 w-9 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                          <UtensilsCrossed className="h-4 w-4" />
                        </span>
                      )}
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {item.sku}
                          {item.isFeatured ? ` · ${t('menu.item.featured')}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{item.categoryName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{menuKindLabel(item.kind)}</td>
                  <td className="numeric px-3 py-2.5 text-end">
                    {item.hasSizes && item.sizes.length > 0 ? (
                      <div>
                        <p className="font-semibold">
                          {formatMoney(Math.min(...item.sizes.map((size) => Number(size.price))))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {t('menu.item.priceRange', {
                            price: formatMoney(
                              Math.max(...item.sizes.map((size) => Number(size.price))),
                            ),
                          })}
                        </p>
                      </div>
                    ) : (
                      <span className="font-semibold">{formatMoney(item.basePrice)}</span>
                    )}
                  </td>
                  <td className="numeric px-3 py-2.5 text-end text-xs text-muted-foreground">
                    {formatMoney(item.costPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.hasSizes
                      ? item.sizes.map((size) => size.name).join(' · ')
                      : t('menu.item.single')}
                  </td>
                  <td className="px-3 py-2.5">
                    <Toggle
                      checked={item.isAvailable}
                      onChange={() => toggleItem.mutate(item)}
                      label={item.isAvailable ? t('menu.item.available') : t('menu.item.soldOut')}
                      disabled={toggleItem.isPending}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRecipe(item)}
                        title={t('menu.item.recipe')}
                      >
                        <ChefHat className="h-3.5 w-3.5" />
                        {t('menu.item.recipe')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(item)}
                        aria-label={t('menu.item.edit', { name: item.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          requestDelete({
                            title: t('menu.item.deleteTitle', { name: item.name }),
                            description: t('menu.item.deleteDescription'),
                            label: t('menu.item.deleteLabel'),
                            run: () => api.menu.remove(item.id),
                          })
                        }
                        aria-label={t('menu.item.delete', { name: item.name })}
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

      {items.data && items.data.total > 0 ? (
        <Pagination
          page={items.data.page}
          pageSize={items.data.pageSize}
          total={items.data.total}
          totalPages={items.data.totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
