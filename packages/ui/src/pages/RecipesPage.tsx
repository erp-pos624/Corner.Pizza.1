import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChefHat, Percent } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { MenuItemDto } from '@posshope/shared';
import { RecipeEditorDialog } from '../components/menu/RecipeEditorDialog';
import { Button } from '../components/ui/button';
import { EmptyPanel, ErrorState } from '../components/ui/states';
import { StatCard } from '../components/ui/stat-card';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useI18n } from '../i18n';

function baseRecipe(item: MenuItemDto) {
  return item.recipes.find((recipe) => recipe.sizeId === null) ?? item.recipes[0] ?? null;
}

export function RecipesPage(): ReactElement {
  const { t } = useI18n();
  const [editing, setEditing] = useState<MenuItemDto | null>(null);

  const items = useQuery({
    queryKey: ['menu', 'items', 'recipes-page'],
    queryFn: () => api.menu.items({ page: 1, pageSize: 200 }),
  });

  if (items.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (items.isError) {
    return (
      <ErrorState
        title={t('inventory.recipesPage.loadError')}
        message={items.error instanceof Error ? items.error.message : undefined}
        onRetry={() => void items.refetch()}
      />
    );
  }

  const rows = items.data?.items ?? [];
  const withRecipe = rows.filter((item) => baseRecipe(item) !== null);
  const margins = rows
    .map((item) => {
      const recipe = baseRecipe(item);
      const price = Number(item.basePrice);
      if (!recipe || price <= 0) return null;
      return ((price - Number(recipe.costPerUnit)) / price) * 100;
    })
    .filter((value): value is number => value !== null);
  const averageMargin =
    margins.length > 0 ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('inventory.recipesPage.menuItems')}
          value={String(rows.length)}
          hint={t('inventory.recipesPage.menuItemsHint')}
          icon={<ChefHat className="h-4 w-4" />}
        />
        <StatCard
          label={t('inventory.recipesPage.withRecipe')}
          value={String(withRecipe.length)}
          hint={t('inventory.recipesPage.withRecipeHint')}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <StatCard
          label={t('inventory.recipesPage.margin')}
          value={`${averageMargin.toFixed(1)}%`}
          hint={t('inventory.recipesPage.marginHint')}
          icon={<Percent className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t('inventory.recipesPage.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('inventory.recipesPage.subtitle')}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyPanel
            title={t('inventory.recipesPage.empty')}
            message={t('inventory.recipesPage.emptyMessage')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.item')}</th>
                  <th className="px-3 py-2.5 font-semibold">
                    {t('inventory.recipesPage.sizes')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.recipesPage.cost')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.recipesPage.price')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.recipesPage.marginColumn')}
                  </th>
                  <th className="px-3 py-2.5 text-end font-semibold">
                    {t('inventory.columns.status')}
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const recipe = baseRecipe(item);
                  const cost = recipe ? Number(recipe.costPerUnit) : null;
                  const price = Number(item.basePrice);
                  const margin = cost !== null && price > 0 ? ((price - cost) / price) * 100 : null;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.categoryName ?? '—'} · {item.sku}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {item.sizes.length > 0
                          ? item.sizes.map((size) => size.name).join(' · ')
                          : t('inventory.recipesPage.singleSize')}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs">
                        {cost !== null ? formatMoney(cost) : '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-end text-xs">{formatMoney(price)}</td>
                      <td
                        className={`numeric px-3 py-2.5 text-end text-xs font-semibold ${
                          margin === null
                            ? 'text-muted-foreground'
                            : margin < 20
                              ? 'text-destructive'
                              : 'text-success'
                        }`}
                      >
                        {margin === null ? '—' : `${margin.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        {recipe ? (
                          <span className="text-[11px] text-emerald-700">
                            {t('inventory.recipesPage.version', { version: recipe.version })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700">
                            {t('inventory.recipesPage.missing')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                            <BookOpen className="h-3.5 w-3.5" />
                            {t('inventory.recipesPage.edit')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{t('inventory.recipesPage.footer')}</p>

      <RecipeEditorDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        item={editing}
        onSaved={() => void items.refetch()}
      />
    </div>
  );
}
