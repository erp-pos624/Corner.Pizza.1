import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CategoryDto, DiscountDto, MenuItemDto, ToppingDto } from '@posshope/shared';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { useI18n } from '../i18n';

export const MENU_PAGE_SIZE = 20;

export type MenuAvailability = 'all' | 'available' | 'soldout';

export interface PendingDelete {
  title: string;
  description: string;
  label: string;
  run: () => Promise<unknown>;
}

export function useMenuManagement(itemsTabActive: boolean) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [availability, setAvailability] = useState<MenuAvailability>('all');
  /** Retired items sit in switched-off categories and stay hidden unless asked for. */
  const [showRetired, setShowRetired] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, availability, showRetired]);

  const categories = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: () => api.categories.list(),
    staleTime: 30_000,
  });

  const items = useQuery({
    queryKey: ['menu', 'items', { page, search, categoryFilter, availability, showRetired }],
    queryFn: () =>
      api.menu.items({
        page,
        pageSize: MENU_PAGE_SIZE,
        q: search || undefined,
        categoryId: categoryFilter || undefined,
        isAvailable: availability === 'all' ? undefined : availability === 'available',
        includeHidden: showRetired || undefined,
      }),
    placeholderData: (previous) => previous,
    enabled: itemsTabActive,
  });

  const toppings = useQuery({
    queryKey: ['menu', 'toppings'],
    queryFn: () => api.menu.toppings(),
    staleTime: 30_000,
  });

  const discounts = useQuery({
    queryKey: ['discounts'],
    queryFn: () => api.discounts.list(),
    staleTime: 30_000,
  });

  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'menu-options'],
    queryFn: () => api.inventory.ingredients({ page: 1, pageSize: 200, isActive: true }),
    staleTime: 60_000,
  });

  const invalidateMenu = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
    void queryClient.invalidateQueries({ queryKey: ['discounts'] });
    void queryClient.invalidateQueries({ queryKey: ['pos', 'catalog'] });
  };

  const toggleItem = useMutation({
    mutationFn: (item: MenuItemDto) => api.menu.update(item.id, { isAvailable: !item.isAvailable }),
    onSuccess: (updated) => {
      toast.success(
        t('menu.item.toggleMessage', {
          name: updated.name,
          state: updated.isAvailable ? t('menu.item.available') : t('menu.item.soldOut'),
        }),
      );
      invalidateMenu();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.toasts.itemFailed')),
  });

  const toggleTopping = useMutation({
    mutationFn: (topping: ToppingDto) =>
      api.menu.updateTopping(topping.id, { isAvailable: !topping.isAvailable }),
    onSuccess: () => {
      toast.success(t('menu.toasts.toppingUpdated'));
      invalidateMenu();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.toasts.toppingFailed')),
  });

  const toggleDiscount = useMutation({
    mutationFn: (discount: DiscountDto) =>
      api.discounts.update(discount.id, { isActive: !discount.isActive }),
    onSuccess: () => {
      toast.success(t('menu.toasts.discountUpdated'));
      invalidateMenu();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.toasts.discountFailed')),
  });

  const toggleCategory = useMutation({
    mutationFn: (category: CategoryDto) =>
      api.categories.update(category.id, { isActive: !category.isActive }),
    onSuccess: () => {
      toast.success(t('menu.toasts.categoryUpdated'));
      invalidateMenu();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('menu.toasts.categoryFailed')),
  });

  const remove = useMutation({
    mutationFn: (task: PendingDelete) => task.run(),
    onSuccess: () => {
      toast.success(t('menu.toasts.deleted'));
      setPendingDelete(null);
      invalidateMenu();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('menu.toasts.deleteFailed'));
      setPendingDelete(null);
    },
  });

  const requestDelete = (task: PendingDelete): void => setPendingDelete(task);
  const clearPendingDelete = (): void => setPendingDelete(null);

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    availability,
    setAvailability,
    showRetired,
    setShowRetired,
    setPage,
    categories,
    items,
    toppings,
    discounts,
    ingredients,
    toggleItem,
    toggleTopping,
    toggleDiscount,
    toggleCategory,
    remove,
    pendingDelete,
    requestDelete,
    clearPendingDelete,
    invalidateMenu,
  };
}

export type MenuManagement = ReturnType<typeof useMenuManagement>;
