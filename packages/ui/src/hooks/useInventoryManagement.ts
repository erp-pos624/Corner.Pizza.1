import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { InventoryMovementType } from '@posshope/shared';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { useI18n } from '../i18n';

export const INVENTORY_PAGE_SIZE = 20;

export type InventoryTab = 'ingredients' | 'movements' | 'stocktakes' | 'suppliers';

export interface PendingDeleteTask {
  title: string;
  description: string;
  label: string;
  run: () => Promise<unknown>;
}

export function useInventoryManagement(tab: InventoryTab) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [movementIngredient, setMovementIngredient] = useState('');
  const [movementType, setMovementType] = useState<InventoryMovementType | ''>('');
  const [movementFrom, setMovementFrom] = useState('');
  const [movementTo, setMovementTo] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [stocktakePage, setStocktakePage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTask | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId, lowOnly]);

  useEffect(() => {
    setMovementPage(1);
  }, [movementIngredient, movementType, movementFrom, movementTo]);

  const ingredients = useQuery({
    queryKey: ['inventory', 'ingredients', { page, search, categoryId, lowOnly }],
    queryFn: () =>
      api.inventory.ingredients({
        page,
        pageSize: INVENTORY_PAGE_SIZE,
        q: search || undefined,
        categoryId: categoryId || undefined,
        lowStock: lowOnly || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const allIngredients = useQuery({
    queryKey: ['inventory', 'ingredients', 'all'],
    queryFn: () => api.inventory.ingredients({ page: 1, pageSize: 200 }),
    staleTime: 60_000,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.suppliers.list({ page: 1, pageSize: 200 }),
    staleTime: 60_000,
  });

  const categories = useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: () => api.inventory.categories.list(),
    staleTime: 60_000,
  });

  const movements = useQuery({
    queryKey: [
      'inventory',
      'movements',
      { movementPage, movementIngredient, movementType, movementFrom, movementTo },
    ],
    queryFn: () =>
      api.inventory.movements({
        page: movementPage,
        pageSize: INVENTORY_PAGE_SIZE,
        ingredientId: movementIngredient || undefined,
        type: movementType || undefined,
        from: movementFrom || undefined,
        to: movementTo || undefined,
      }),
    enabled: tab === 'movements',
    placeholderData: (previous) => previous,
  });

  const stocktakes = useQuery({
    queryKey: ['inventory', 'stocktakes', { stocktakePage }],
    queryFn: () =>
      api.inventory.stocktakes({ page: stocktakePage, pageSize: INVENTORY_PAGE_SIZE }),
    enabled: tab === 'stocktakes',
    placeholderData: (previous) => previous,
  });

  const reorderAlerts = useQuery({
    queryKey: ['inventory', 'reorder-alerts'],
    queryFn: () => api.inventory.reorderAlerts(),
    staleTime: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const remove = useMutation({
    mutationFn: (task: { run: () => Promise<unknown> }) => task.run(),
    onSuccess: () => {
      toast.success(t('feedback.deleted'));
      setPendingDelete(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('inventory.errors.deleteGeneric'));
      setPendingDelete(null);
    },
  });

  const requestDelete = (task: PendingDeleteTask): void => setPendingDelete(task);
  const clearPendingDelete = (): void => setPendingDelete(null);

  const stats = allIngredients.data?.items ?? [];
  const lowCount = stats.filter((row) => row.isLowStock).length;
  const stockValue = stats.reduce((sum, row) => sum + Number(row.stockValue), 0);

  return {
    page,
    setPage,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    lowOnly,
    setLowOnly,
    movementIngredient,
    setMovementIngredient,
    movementType,
    setMovementType,
    movementFrom,
    setMovementFrom,
    movementTo,
    setMovementTo,
    movementPage,
    setMovementPage,
    stocktakePage,
    setStocktakePage,
    ingredients,
    allIngredients,
    suppliers,
    categories,
    movements,
    stocktakes,
    reorderAlerts,
    remove,
    pendingDelete,
    requestDelete,
    clearPendingDelete,
    stats,
    lowCount,
    stockValue,
    invalidate,
  };
}

export type InventoryManagement = ReturnType<typeof useInventoryManagement>;
