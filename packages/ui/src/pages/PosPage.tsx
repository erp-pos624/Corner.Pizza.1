import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CategoryDto, MenuItemDto, OrderDto, ToppingDto } from '@posshope/shared';
import { InvoiceViewer } from '../components/invoice/InvoiceViewer';
import { KitchenTicket } from '../components/invoice/KitchenTicket';
import { resolveThermalPaper } from '../lib/receipt-paper';
import { PaymentSuccessDialog } from '../components/orders/PaymentSuccessDialog';
import { CustomerPickerDialog } from '../components/pos/CustomerPickerDialog';
import { ItemBuilder } from '../components/pos/ItemBuilder';
import { OrderPanel } from '../components/pos/OrderPanel';
import { ProductBrowser } from '../components/pos/ProductBrowser';
import { PosSkeleton } from '../components/skeletons/PosSkeleton';
import { ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import type { PageKey } from '../components/layout/AppShell';
import { usePosCart } from '../hooks/usePosCart';
import { useStationPrinting } from '../hooks/useStationPrinting';
import { api } from '../lib/api';
import type { CartLine } from '../lib/pos';
import { takeTableIntent } from '../lib/table-intent';
import { useAuthStore } from '../store/auth';
import { useI18n } from '../i18n';

export function PosPage({ onNavigate }: { onNavigate: (page: PageKey) => void }): ReactElement {
  const { t } = useI18n();
  const isAdmin = useAuthStore((state) => state.user?.role === 'ADMIN');
  const searchRef = useRef<HTMLInputElement>(null);

  const [categoryId, setCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuItemDto | null>(null);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderDto | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [kotOrder, setKotOrder] = useState<OrderDto | null>(null);

  const catalog = useQuery({
    queryKey: ['pos', 'catalog'],
    queryFn: () => api.menu.catalog(),
    staleTime: 30_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });
  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.tables.list(),
    staleTime: 15_000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const toppings = useMemo(() => catalog.data?.toppings ?? [], [catalog.data]);
  const discounts = useMemo(
    () => (catalog.data?.discounts ?? []).filter((discount) => discount.isActive),
    [catalog.data],
  );
  const settings = settingsQuery.data;

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId !== 'all' && item.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.description ?? '').toLowerCase().includes(term)
      );
    });
  }, [items, categoryId, search]);

  const groupedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    return categories.map((category: CategoryDto) => ({
      ...category,
      count: counts.get(category.id) ?? category.itemCount,
    }));
  }, [categories, items]);

  const selectedSize = selected?.sizes.find((size) => size.id === sizeId) ?? null;
  const selectedToppings = toppings.filter((topping) => toppingIds.includes(topping.id));
  const customizeUnit = selected
    ? (selected.hasSizes ? Number(selectedSize?.price ?? 0) : Number(selected.basePrice)) +
      selectedToppings.reduce((sum, topping) => sum + Number(topping.price), 0)
    : 0;
  const customizeTotal = customizeUnit * quantity;

  const resetCustomization = (): void => {
    setSelected(null);
    setSizeId(null);
    setToppingIds([]);
    setQuantity(1);
    setInstructions('');
    setEditingKey(null);
  };

  const tables = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);

  const categoryOf = useCallback(
    (menuItemId: string): string | null =>
      items.find((item) => item.id === menuItemId)?.categoryId ?? null,
    [items],
  );
  const station = useStationPrinting({ settings, categoryOf });

  /**
   * Station printers configured in the dashboard print silently; when none
   * takes the kitchen ticket, fall back to the original print-dialog ticket.
   */
  const routeKitchenPrint = (order: OrderDto, addedItems: OrderDto['items'] | null): void => {
    void station
      .printNewOrder(order, addedItems)
      .then(({ kitchenRouted }) => {
        if (!kitchenRouted) setKotOrder(addedItems ? { ...order, items: addedItems } : order);
      })
      .catch(() => setKotOrder(addedItems ? { ...order, items: addedItems } : order));
  };

  const handleOrderCreated = (order: OrderDto, addedItems: OrderDto['items'] | null): void => {
    resetCustomization();
    if (addedItems) {
      routeKitchenPrint(order, addedItems);
      toast.success(t('pos.addedToTab'));
      return;
    }
    setLastOrder(order);
    setSuccessOpen(true);
    routeKitchenPrint(order, null);
  };

  const cart = usePosCart({
    items,
    tables,
    discounts,
    settings,
    isAdmin,
    onOrderCreated: handleOrderCreated,
  });

  const intentApplied = useRef(false);
  useEffect(() => {
    if (intentApplied.current || tables.length === 0) return;
    const intent = takeTableIntent();
    if (!intent) {
      intentApplied.current = true;
      return;
    }
    const table = tables.find((candidate) => candidate.id === intent.tableId);
    if (!table) return;
    intentApplied.current = true;
    cart.setOrderType('DINE_IN');
    cart.chooseTable(table.id);
    if (intent.mode === 'tab' && table.openOrderId) {
      void api.orders
        .get(table.openOrderId)
        .then((order) => cart.attachTab(order))
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : t('pos.errors.loadTab')),
        );
    } else {
      cart.setPayLater(true);
    }
    // The cart API is stable enough for this one-shot intent handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  useEffect(() => {
    if (!kotOrder) return;
    const timer = window.setTimeout(() => {
      void api
        .print()
        .then((result) => {
          if (!result.ok && !result.cancelled) {
            toast.error(result.error, t('pos.errors.printFailed'));
          }
        })
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : t('pos.errors.printFailed')),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [kotOrder, t]);

  const chooseItem = (item: MenuItemDto): void => {
    if (item.isSoldOut || !item.isAvailable) {
      if (item.soldOutReason) toast.error(item.soldOutReason);
      return;
    }
    const defaultSize = item.sizes.find((size) => size.isDefault) ?? item.sizes[0] ?? null;
    setSelected(item);
    setSizeId(defaultSize?.id ?? null);
    setToppingIds([]);
    setQuantity(1);
    setInstructions('');
    setEditingKey(null);
  };

  const toggleTopping = (topping: ToppingDto): void => {
    if (!topping.isAvailable) return;
    setToppingIds((current) =>
      current.includes(topping.id)
        ? current.filter((id) => id !== topping.id)
        : [...current, topping.id],
    );
  };

  const addToCart = (): void => {
    if (!selected) return;
    if (selected.hasSizes && !sizeId) {
      toast.error(t('pos.errors.chooseSize', { name: selected.name }));
      return;
    }
    const line: CartLine = {
      key: editingKey ?? `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      menuItemId: selected.id,
      name: selected.name,
      imageUrl: selected.imageUrl,
      sizeId,
      sizeName: selectedSize?.name ?? null,
      unitPrice: selected.hasSizes ? Number(selectedSize?.price ?? 0) : Number(selected.basePrice),
      taxInclusive: selected.taxInclusive,
      toppings: selectedToppings.map((topping) => ({
        id: topping.id,
        name: topping.name,
        price: Number(topping.price),
      })),
      quantity,
      specialInstructions: instructions.trim(),
    };
    cart.upsertLine(line, editingKey);
    resetCustomization();
  };

  const editLine = (line: CartLine): void => {
    const item = items.find((candidate) => candidate.id === line.menuItemId) ?? null;
    if (!item) {
      toast.error(t('pos.errors.itemGone'));
      return;
    }
    setSelected(item);
    setSizeId(line.sizeId);
    setToppingIds(line.toppings.map((topping) => topping.id));
    setQuantity(line.quantity);
    setInstructions(line.specialInstructions);
    setEditingKey(line.key);
  };

  const removeLine = (key: string): void => {
    cart.removeLine(key);
    if (editingKey === key) resetCustomization();
  };

  if (catalog.isLoading || settingsQuery.isLoading) {
    return <PosSkeleton />;
  }

  if (catalog.isError || settingsQuery.isError || !settings) {
    return (
      <ErrorState
        title={t('pos.errors.loadTitle')}
        message={
          (catalog.error instanceof Error ? catalog.error.message : undefined) ??
          (settingsQuery.error instanceof Error ? settingsQuery.error.message : undefined) ??
          t('pos.errors.loadHint')
        }
        onRetry={() => {
          void catalog.refetch();
          void settingsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="grid min-h-0 gap-4 xl:h-[calc(100vh-8.5rem)] xl:grid-cols-[minmax(0,1.15fr)_340px_390px]">
      <ProductBrowser
        searchRef={searchRef}
        search={search}
        onSearchChange={setSearch}
        categories={groupedCategories}
        itemCount={items.length}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        filteredItems={filteredItems}
        selectedId={selected?.id ?? null}
        onSelectItem={chooseItem}
        onReset={() => {
          setSearch('');
          setCategoryId('all');
        }}
      />

      <ItemBuilder
        items={items}
        selected={selected}
        editing={Boolean(editingKey)}
        toppings={toppings}
        sizeId={sizeId}
        onSizeChange={setSizeId}
        toppingIds={toppingIds}
        onToggleTopping={toggleTopping}
        quantity={quantity}
        onQuantityChange={setQuantity}
        instructions={instructions}
        onInstructionsChange={setInstructions}
        customizeTotal={customizeTotal}
        onAddToCart={addToCart}
        onReset={resetCustomization}
        onChooseItem={chooseItem}
      />

      <OrderPanel
        cart={cart}
        discounts={discounts}
        isAdmin={isAdmin}
        onNavigate={onNavigate}
        onEditLine={editLine}
        onRemoveLine={removeLine}
        onOpenCustomerPicker={() => setCustomerOpen(true)}
      />

      <CustomerPickerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onPick={cart.chooseCustomer}
      />

      <PaymentSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        order={lastOrder}
        onViewReceipt={() => setInvoiceOpen(true)}
      />

      <InvoiceViewer
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        order={lastOrder}
        invoiceNumber={lastOrder?.invoice?.invoiceNumber ?? null}
      />

      {kotOrder ? (
        <div aria-hidden="true" className="print-source">
          <div className="print-area">
            <KitchenTicket
              paper={resolveThermalPaper()}
              order={{
                ...kotOrder,
                items: kotOrder.items.map((item) => ({
                  ...item,
                  toppings: item.toppings.map((topping) => topping.name),
                })),
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
