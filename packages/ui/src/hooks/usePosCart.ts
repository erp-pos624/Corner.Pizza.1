import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_BRANCH_ID,
  PAYMENT_METHODS,
  computeOrderTax,
  type CustomerDto,
  type DiningTableDto,
  type DiscountDto,
  type MenuItemDto,
  type OrderDto,
  type OrderType,
  type PaymentMethod,
  type SettingsDto,
} from '@posshope/shared';
import { toast } from '../components/ui/toast';
import type { GeoPoint } from '../components/map/LeafletMap';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { ALL_BRANCHES } from '../lib/branch-scope';
import { previewDeliveryZone } from '../lib/delivery-zones';
import { formatDecimal, formatMoney } from '../lib/format';
import {
  EMPTY_CUSTOMER,
  fromMinor,
  lineTotal,
  money,
  newPaymentLine,
  type CartLine,
  type CustomerForm,
  type PaymentLine,
} from '../lib/pos';
import { useAuthStore } from '../store/auth';
import { useBranchScopeStore } from '../store/branch';
import { createIdempotencyKey } from '../lib/utils';
import { readDeviceConfig } from '../lib/device';

interface UsePosCartOptions {
  items: MenuItemDto[];
  tables: DiningTableDto[];
  discounts: DiscountDto[];
  settings: SettingsDto | undefined;
  isAdmin: boolean;
  /** `addedItems` is set when items were appended to an existing tab. */
  onOrderCreated: (order: OrderDto, addedItems: OrderDto['items'] | null) => void;
}

export function usePosCart({
  items,
  tables,
  discounts,
  settings,
  isAdmin,
  onOrderCreated,
}: UsePosCartOptions) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const checkoutKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const authUser = useAuthStore((state) => state.user);
  const scope = useBranchScopeStore((state) => state.scope);

  const [cart, setCart] = useState<CartLine[]>([]);
  // This terminal's setup decides what a fresh ticket starts as.
  const defaultChannelRef = useRef<'POS' | 'TALABAT'>(readDeviceConfig()?.defaultChannel ?? 'POS');
  const [orderType, setOrderTypeState] = useState<OrderType>(
    () => readDeviceConfig()?.defaultOrderType ?? 'DINE_IN',
  );
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [payLater, setPayLater] = useState(false);
  const [isCod, setIsCod] = useState(false);
  const [tab, setTab] = useState<OrderDto | null>(null);
  const [customer, setCustomer] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [discountId, setDiscountId] = useState('');
  const [notes, setNotes] = useState('');
  /** POS for walk-in/phone orders, TALABAT for orders keyed in from the Talabat tablet. */
  const [channel, setChannelState] = useState<'POS' | 'TALABAT'>(defaultChannelRef.current);
  const [externalRef, setExternalRef] = useState('');
  const defaultPaymentMethod = (): PaymentMethod =>
    defaultChannelRef.current === 'TALABAT' ? 'WALLET' : 'CASH';
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>(() => [
    newPaymentLine(defaultPaymentMethod()),
  ]);
  const [deliveryPoint, setDeliveryPointState] = useState<GeoPoint | null>(null);

  const subtotalMinor = cart.reduce((sum, line) => sum + money(lineTotal(line)), 0);
  const selectedDiscount = discounts.find((discount) => discount.id === discountId) ?? null;
  const discountMinor = selectedDiscount
    ? selectedDiscount.type === 'PERCENT'
      ? Math.round((subtotalMinor * Number(selectedDiscount.value)) / 100)
      : Math.min(money(Number(selectedDiscount.value)), subtotalMinor)
    : 0;
  const taxRate = Number(settings?.taxRate ?? 14);
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: orderType === 'DELIVERY',
  });
  const sellingBranchId =
    scope !== ALL_BRANCHES
      ? scope
      : (authUser?.branchId ?? branchesQuery.data?.[0]?.id ?? DEFAULT_BRANCH_ID);
  const deliveryBranch =
    branchesQuery.data?.find((branch) => branch.id === sellingBranchId) ?? null;
  const zonesQuery = useQuery({
    queryKey: ['delivery-zones', sellingBranchId, 'pos'],
    queryFn: () => api.deliveryZones.list({ branchId: sellingBranchId }),
    enabled: orderType === 'DELIVERY',
    staleTime: 60_000,
  });
  const zoneCheckQuery = useQuery({
    queryKey: [
      'delivery-check',
      sellingBranchId,
      deliveryPoint?.lat ?? null,
      deliveryPoint?.lng ?? null,
    ],
    queryFn: () => {
      if (!deliveryPoint) throw new Error('No delivery point selected');
      return api.delivery.checkZone({ ...deliveryPoint, branchId: sellingBranchId });
    },
    enabled: orderType === 'DELIVERY' && Boolean(deliveryPoint),
    staleTime: 30_000,
    retry: false,
  });
  const deliveryPreview = useMemo(
    () =>
      previewDeliveryZone({
        zonesCount: zonesQuery.data?.length ?? 0,
        check: zoneCheckQuery.data,
        subtotalMinor,
        fallbackFee: settings?.deliveryFee ?? '0',
      }),
    [zonesQuery.data, zoneCheckQuery.data, subtotalMinor, settings?.deliveryFee],
  );
  const deliveryPending =
    orderType === 'DELIVERY' &&
    (branchesQuery.isLoading ||
      zonesQuery.isLoading ||
      (Boolean(deliveryPoint) && zoneCheckQuery.isFetching));
  const deliveryMinor = orderType === 'DELIVERY' ? deliveryPreview.deliveryFeeMinor : 0;
  // Same calculator as the server, so the register shows what will be charged.
  const taxBreakdown = computeOrderTax({
    lines: cart.map((line) => ({
      amountMinor: money(lineTotal(line)),
      taxInclusive: line.taxInclusive,
    })),
    discountMinor,
    taxRate,
    deliveryFeeMinor: deliveryMinor,
  });
  const taxMinor = taxBreakdown.taxMinor;
  const includedTaxMinor = taxBreakdown.includedTaxMinor;
  const addedTaxMinor = taxBreakdown.addedTaxMinor;
  const totalMinor = taxBreakdown.totalMinor;
  const paymentSummary = useMemo(() => {
    const amounts = paymentLines.map((line) => money(Number(line.amount || '0')));
    const tenderedMinor = amounts.reduce((sum, amount) => sum + amount, 0);
    const cashMinor = paymentLines.reduce(
      (sum, line, index) => (line.method === 'CASH' ? sum + amounts[index] : sum),
      0,
    );
    const nonCashMinor = tenderedMinor - cashMinor;
    const hasCash = paymentLines.some((line) => line.method === 'CASH');
    const cashShareMinor = Math.max(totalMinor - nonCashMinor, 0);
    return {
      tenderedMinor,
      hasCash,
      cashShareMinor,
      remainingMinor: Math.max(totalMinor - tenderedMinor, 0),
      changeMinor: Math.max(tenderedMinor - totalMinor, 0),
      nonCashOver: nonCashMinor > totalMinor,
      cashUnused: hasCash && cashShareMinor === 0 && tenderedMinor > 0,
      cashShort: hasCash && cashMinor < cashShareMinor,
      missing: !hasCash && tenderedMinor !== totalMinor,
    };
  }, [paymentLines, totalMinor]);
  const capPct = Number(settings?.maxCashierDiscountPct ?? 0);
  const capMinor = Math.round((subtotalMinor * capPct) / 100);
  const overCashierCap = !isAdmin && discountMinor > capMinor;

  const updatePaymentLine = (key: string, patch: Partial<PaymentLine>): void => {
    setPaymentLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const changePaymentMethod = (key: string, method: PaymentMethod): void => {
    setPaymentLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        if (line.amount.trim() !== '' || method === 'CASH') return { ...line, method };
        const others = current
          .filter((entry) => entry.key !== key)
          .reduce((sum, entry) => sum + money(Number(entry.amount || '0')), 0);
        const remaining = Math.max(totalMinor - others, 0);
        return { ...line, method, amount: remaining > 0 ? fromMinor(remaining) : '' };
      }),
    );
  };

  const addPaymentLine = (): void => {
    const used = new Set(paymentLines.map((line) => line.method));
    const method = PAYMENT_METHODS.find((entry) => !used.has(entry));
    if (!method) return;
    const line = newPaymentLine(method);
    if (method !== 'CASH' && paymentSummary.remainingMinor > 0) {
      line.amount = fromMinor(paymentSummary.remainingMinor);
    }
    setPaymentLines((current) => [...current, line]);
  };

  const removePaymentLine = (key: string): void => {
    setPaymentLines((current) =>
      current.length > 1 ? current.filter((line) => line.key !== key) : current,
    );
  };

  const upsertLine = (line: CartLine, editingKey: string | null): void => {
    setCart((current) =>
      editingKey
        ? current.map((entry) => (entry.key === editingKey ? line : entry))
        : [...current, line],
    );
  };

  const changeQuantity = (key: string, delta: number): void => {
    setCart((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(Math.max(line.quantity + delta, 1), 99) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeLine = (key: string): void => {
    setCart((current) => current.filter((line) => line.key !== key));
  };

  const chooseCustomer = (picked: CustomerDto): void => {
    setCustomer({
      id: picked.id,
      name: picked.name,
      phone: picked.phone ?? '',
      address: picked.address ?? '',
    });
  };

  const clearCustomer = (): void => {
    setCustomer(EMPTY_CUSTOMER);
    setDeliveryPointState(null);
  };

  const setDeliveryPoint = (point: GeoPoint | null): void => {
    setDeliveryPointState(point);
  };

  const setOrderType = (type: OrderType): void => {
    setOrderTypeState(type);
    if (type !== 'DINE_IN') {
      setTableId(null);
      setTableNumber('');
      setPayLater(false);
      setTab(null);
    }
    if (type !== 'DELIVERY') {
      setIsCod(false);
      setDeliveryPointState(null);
    }
  };

  const chooseTable = (id: string | null): void => {
    if (!id) {
      setTableId(null);
      setTableNumber('');
      setTab(null);
      return;
    }
    const table = tables.find((candidate) => candidate.id === id) ?? null;
    setTableId(id);
    setTableNumber(table?.name ?? '');
    setTab(null);
    setPayLater(false);
  };

  const attachTab = (order: OrderDto): void => {
    setTab(order);
    setPayLater(false);
    setDiscountId('');
    if (order.tableId) {
      setTableId(order.tableId);
      setTableNumber(order.tableNumber ?? '');
    }
  };

  const leaveTab = (): void => setTab(null);

  const createOrder = useMutation({
    mutationFn: () => {
      const items = cart.map((line) => ({
        menuItemId: line.menuItemId,
        sizeId: line.sizeId,
        quantity: line.quantity,
        toppingIds: line.toppings.map((topping) => topping.id),
        specialInstructions: line.specialInstructions || undefined,
      }));
      if (tab) return api.orders.addItems(tab.id, { items });
      const body = {
        type: orderType,
        customerId: customer.id,
        customerName: customer.name.trim() || undefined,
        customerPhone: customer.phone.trim() || undefined,
        customerAddress: customer.address.trim() || undefined,
        customerLat: orderType === 'DELIVERY' ? deliveryPoint?.lat : undefined,
        customerLng: orderType === 'DELIVERY' ? deliveryPoint?.lng : undefined,
        tableId: orderType === 'DINE_IN' ? tableId || undefined : undefined,
        tableNumber: orderType === 'DINE_IN' ? tableNumber.trim() || undefined : undefined,
        items,
        discountId: discountId || undefined,
        notes: notes.trim() || undefined,
        channel,
        externalRef: channel === 'TALABAT' ? externalRef.trim() || undefined : undefined,
        payLater: orderType === 'DINE_IN' && payLater,
        isCod: orderType === 'DELIVERY' && isCod,
        payments:
          payLater || isCod
            ? []
            : paymentLines.map((line) => ({
                method: line.method,
                amount: line.amount || '0',
                reference: line.reference.trim() || undefined,
              })),
      };
      const signature = JSON.stringify(body);
      const pending = checkoutKeyRef.current;
      const idempotencyKey =
        pending?.signature === signature ? pending.key : createIdempotencyKey();
      checkoutKeyRef.current = { signature, key: idempotencyKey };
      return api.orders.create({ ...body, idempotencyKey });
    },
    onSuccess: (order) => {
      checkoutKeyRef.current = null;
      const previousItemIds = tab ? new Set(tab.items.map((item) => item.id)) : null;
      onOrderCreated(
        order,
        previousItemIds ? order.items.filter((item) => !previousItemIds.has(item.id)) : null,
      );
      setCart([]);
      setCustomer(EMPTY_CUSTOMER);
      setNotes('');
      setDiscountId('');
      setPaymentLines([newPaymentLine(defaultPaymentMethod())]);
      setChannelState(defaultChannelRef.current);
      setExternalRef('');
      if (tab) {
        setTab(order);
      } else {
        setTableNumber('');
        setPayLater(false);
        setIsCod(false);
        setDeliveryPointState(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['pos', 'catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('pos.errors.createFailed'));
    },
  });

  const validationError = useMemo(() => {
    if (cart.length === 0) return t('pos.validation.cartEmpty');
    if (orderType === 'DELIVERY') {
      if (!customer.address.trim()) return t('pos.validation.address');
      if (deliveryPending) return t('pos.validation.zoneChecking');
      if (deliveryPreview.block === 'PIN_REQUIRED') return t('pos.validation.zonePinRequired');
      if (deliveryPreview.block === 'OUT_OF_RANGE') return t('pos.validation.zoneOutOfRange');
      if (deliveryPreview.block === 'MIN_ORDER') {
        return t('pos.validation.zoneMinOrder', {
          amount: formatMoney(zoneCheckQuery.data?.minOrderAmount ?? '0'),
        });
      }
    }
    if (tab) return null;
    if (orderType === 'DINE_IN' && (payLater || tableId) && !tableId) {
      return t('pos.validation.table');
    }
    if (payLater || isCod) return null;
    if (overCashierCap) {
      return t('pos.validation.discountLimit', { percent: formatDecimal(capPct, 0) });
    }
    if (paymentSummary.nonCashOver) return t('pos.validation.paymentOver');
    if (paymentSummary.cashUnused) return t('pos.validation.cashUnused');
    if (paymentSummary.cashShort) return t('pos.validation.cashShort');
    if (paymentSummary.missing) return t('pos.validation.paymentTotal');
    return null;
  }, [
    cart.length,
    orderType,
    customer.address,
    deliveryPending,
    deliveryPreview,
    zoneCheckQuery.data?.minOrderAmount,
    tab,
    payLater,
    isCod,
    tableId,
    overCashierCap,
    capPct,
    paymentSummary,
    t,
  ]);

  /**
   * Talabat orders are collected by Talabat, so default the payment to
   * Wallet (kept out of the cash drawer) and the order to Takeaway.
   */
  const setChannel = (next: 'POS' | 'TALABAT'): void => {
    setChannelState(next);
    if (next === 'TALABAT') {
      if (orderType === 'DINE_IN') setOrderType('TAKEAWAY');
      setPaymentLines([newPaymentLine('WALLET')]);
    } else {
      setExternalRef('');
      setPaymentLines([newPaymentLine('CASH')]);
    }
  };

  const placeOrder = (): void => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    createOrder.mutate();
  };

  return {
    items,
    tables,
    cart,
    setCart,
    orderType,
    setOrderType,
    tableId,
    tableNumber,
    setTableNumber,
    payLater,
    setPayLater,
    isCod,
    setIsCod,
    tab,
    chooseTable,
    attachTab,
    leaveTab,
    customer,
    setCustomer,
    clearCustomer,
    deliveryBranch,
    deliveryZones: zonesQuery.data ?? [],
    deliveryPoint,
    setDeliveryPoint,
    deliveryPreview,
    deliveryPending,
    zoneCheck: zoneCheckQuery.data ?? null,
    discountId,
    setDiscountId,
    notes,
    setNotes,
    channel,
    setChannel,
    externalRef,
    setExternalRef,
    paymentLines,
    subtotalMinor,
    selectedDiscount,
    discountMinor,
    taxRate,
    taxMinor,
    includedTaxMinor,
    addedTaxMinor,
    deliveryMinor,
    totalMinor,
    paymentSummary,
    capPct,
    capMinor,
    overCashierCap,
    validationError,
    updatePaymentLine,
    changePaymentMethod,
    addPaymentLine,
    removePaymentLine,
    upsertLine,
    changeQuantity,
    removeLine,
    chooseCustomer,
    createOrder,
    placeOrder,
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
