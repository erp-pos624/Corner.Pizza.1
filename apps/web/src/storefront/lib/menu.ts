import {
  DEFAULT_STOREFRONT_CONTENT,
  type PublicBranchDto,
  type PublicMenuDto,
  type PublicSettingsDto,
  type StorefrontContent,
} from '@posshope/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCart } from '../store/cart';
import { api } from './api';

interface BranchState {
  branchId: string | null;
  setBranch: (branchId: string) => void;
}

export const useBranchChoice = create<BranchState>()(
  persist((set) => ({ branchId: null, setBranch: (branchId) => set({ branchId }) }), {
    name: 'forno-branch',
  }),
);

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: api.branches, staleTime: 60_000 });
}

/** Restaurant contact details, maintained in dashboard Settings. */
export function usePublicSettings(): { settings: PublicSettingsDto | null } {
  const query = useQuery({
    queryKey: ['public-settings'],
    queryFn: api.settings,
    staleTime: 60_000,
  });
  return { settings: query.data ?? null };
}

/** Home-page copy edited from the dashboard; defaults cover a missing column. */
export function useStorefrontContent(): StorefrontContent {
  const query = useQuery({
    queryKey: ['storefront-content'],
    queryFn: api.storefront,
    staleTime: 60_000,
  });
  return query.data ?? DEFAULT_STOREFRONT_CONTENT;
}

/** The branch being ordered from: the saved choice, else the first one open. */
export function useActiveBranch(): { branch: PublicBranchDto | null; isLoading: boolean } {
  const { data, isLoading } = useBranches();
  const chosen = useBranchChoice((state) => state.branchId);
  const branch =
    data?.find((candidate) => candidate.id === chosen) ??
    data?.find((candidate) => candidate.acceptingOrders) ??
    data?.[0] ??
    null;
  return { branch, isLoading };
}

/**
 * The live menu for the active branch. Whenever it loads, cart lines that
 * point at something no longer on the menu are dropped and the remaining
 * lines get fresh names and photos.
 */
export function useMenu() {
  const { branch, isLoading: branchLoading } = useActiveBranch();
  const query = useQuery({
    queryKey: ['menu', branch?.id],
    queryFn: () => api.menu(branch!.id),
    enabled: Boolean(branch),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  const menu = query.data;
  useEffect(() => {
    if (menu) syncCartWithMenu(menu);
  }, [menu]);

  return { ...query, menu, branch, isLoading: branchLoading || query.isLoading };
}

function syncCartWithMenu(menu: PublicMenuDto): void {
  const items = new Map(menu.items.map((item) => [item.id, item]));
  const toppings = new Map(menu.toppings.map((topping) => [topping.id, topping]));
  const cart = useCart.getState();

  cart.reconcile((line) => {
    const item = items.get(line.menuItemId);
    if (!item) return false;
    if (item.hasSizes && !item.sizes.some((size) => size.id === line.sizeId)) return false;
    return line.toppingIds.every((id) => toppings.has(id));
  });

  const refreshed = useCart.getState().lines.map((line) => {
    const item = items.get(line.menuItemId)!;
    return {
      ...line,
      name: item.name,
      imageUrl: item.imageUrl,
      sizeName: item.sizes.find((size) => size.id === line.sizeId)?.name ?? null,
      toppingNames: line.toppingIds.map((id) => toppings.get(id)!.name),
    };
  });
  const changed = refreshed.some((line, index) => {
    const before = useCart.getState().lines[index]!;
    return line.name !== before.name || line.imageUrl !== before.imageUrl;
  });
  if (changed) useCart.setState({ lines: refreshed });
}
