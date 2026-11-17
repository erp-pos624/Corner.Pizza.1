import { BookOpen, ChefHat, Plus, Tag, UtensilsCrossed } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { CategoryDto, DiscountDto, MenuItemDto, ToppingDto } from '@posshope/shared';
import { CategoriesTab } from '../components/menu/CategoriesTab';
import { CategoryDialog } from '../components/menu/CategoryDialog';
import { DiscountDialog } from '../components/menu/DiscountDialog';
import { DiscountsTab } from '../components/menu/DiscountsTab';
import { ItemEditorDialog } from '../components/menu/ItemEditorDialog';
import { MenuItemsTab } from '../components/menu/MenuItemsTab';
import { RecipeEditorDialog } from '../components/menu/RecipeEditorDialog';
import { ToppingDialog } from '../components/menu/ToppingDialog';
import { ToppingsTab } from '../components/menu/ToppingsTab';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { useMenuManagement } from '../hooks/useMenuManagement';
import { cn } from '../lib/utils';
import { useI18n, type TranslationKey } from '../i18n';

type Tab = 'items' | 'categories' | 'toppings' | 'discounts';

const TABS: Array<{ key: Tab; labelKey: TranslationKey; icon: typeof UtensilsCrossed }> = [
  { key: 'items', labelKey: 'menu.tabs.items', icon: UtensilsCrossed },
  { key: 'categories', labelKey: 'menu.tabs.categories', icon: BookOpen },
  { key: 'toppings', labelKey: 'menu.tabs.toppings', icon: ChefHat },
  { key: 'discounts', labelKey: 'menu.tabs.discounts', icon: Tag },
];

const ADD_KEYS: Record<Tab, TranslationKey> = {
  items: 'menu.add.item',
  categories: 'menu.add.category',
  toppings: 'menu.add.topping',
  discounts: 'menu.add.discount',
};

export function MenuPage(): ReactElement {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('items');
  const menu = useMenuManagement(tab === 'items');

  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemDto | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeItem, setRecipeItem] = useState<MenuItemDto | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [toppingDialogOpen, setToppingDialogOpen] = useState(false);
  const [editingTopping, setEditingTopping] = useState<ToppingDto | null>(null);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountDto | null>(null);

  const openAdd = (): void => {
    if (tab === 'items') {
      setEditingItem(null);
      setItemEditorOpen(true);
    } else if (tab === 'categories') {
      setEditingCategory(null);
      setCategoryDialogOpen(true);
    } else if (tab === 'toppings') {
      setEditingTopping(null);
      setToppingDialogOpen(true);
    } else {
      setEditingDiscount(null);
      setDiscountDialogOpen(true);
    }
  };

  const editItem = (item: MenuItemDto): void => {
    setEditingItem(item);
    setItemEditorOpen(true);
  };

  const openRecipe = (item: MenuItemDto): void => {
    setRecipeItem(item);
    setRecipeOpen(true);
  };

  const editCategory = (category: CategoryDto): void => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  const editTopping = (topping: ToppingDto): void => {
    setEditingTopping(topping);
    setToppingDialogOpen(true);
  };

  const editDiscount = (discount: DiscountDto): void => {
    setEditingDiscount(discount);
    setDiscountDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const count =
              entry.key === 'items'
                ? menu.items.data?.total
                : entry.key === 'categories'
                  ? menu.categories.data?.length
                  : entry.key === 'toppings'
                    ? menu.toppings.data?.length
                    : menu.discounts.data?.length;
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
                {count !== undefined ? (
                  <span
                    className={cn(
                      'numeric text-[10px]',
                      tab === entry.key ? 'opacity-70' : 'opacity-60',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          {t(ADD_KEYS[tab])}
        </Button>
      </div>

      {tab === 'items' ? (
        <MenuItemsTab menu={menu} onAdd={openAdd} onEdit={editItem} onRecipe={openRecipe} />
      ) : null}

      {tab === 'categories' ? (
        <CategoriesTab menu={menu} onAdd={openAdd} onEdit={editCategory} />
      ) : null}

      {tab === 'toppings' ? <ToppingsTab menu={menu} onAdd={openAdd} onEdit={editTopping} /> : null}

      {tab === 'discounts' ? (
        <DiscountsTab menu={menu} onAdd={openAdd} onEdit={editDiscount} />
      ) : null}

      <p className="text-[11px] text-muted-foreground">{t('menu.footer')}</p>

      <ItemEditorDialog
        open={itemEditorOpen}
        onOpenChange={setItemEditorOpen}
        item={editingItem}
        categories={menu.categories.data ?? []}
        onSaved={menu.invalidateMenu}
      />

      <RecipeEditorDialog
        open={recipeOpen}
        onOpenChange={setRecipeOpen}
        item={recipeItem}
        onSaved={menu.invalidateMenu}
      />

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        onSaved={menu.invalidateMenu}
      />

      <ToppingDialog
        open={toppingDialogOpen}
        onOpenChange={setToppingDialogOpen}
        topping={editingTopping}
        ingredients={menu.ingredients.data?.items ?? []}
        onSaved={menu.invalidateMenu}
      />

      <DiscountDialog
        open={discountDialogOpen}
        onOpenChange={setDiscountDialogOpen}
        discount={editingDiscount}
        onSaved={menu.invalidateMenu}
      />

      <ConfirmDialog
        open={menu.pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) menu.clearPendingDelete();
        }}
        title={menu.pendingDelete?.title ?? t('actions.delete')}
        description={menu.pendingDelete?.description ?? ''}
        confirmLabel={menu.pendingDelete?.label ?? t('actions.delete')}
        destructive
        busy={menu.remove.isPending}
        onConfirm={() => {
          if (menu.pendingDelete) menu.remove.mutate(menu.pendingDelete);
        }}
      />
    </div>
  );
}
