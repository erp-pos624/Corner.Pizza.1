import type { Prisma } from '@prisma/client';
import {
  ORDER_CHANNEL_LABELS,
  ORDER_TYPE_LABELS,
  languageLocale,
  pickLocalized,
  pickLocalizedNullable,
  type BestSellerRow,
  type CashierPerformanceRow,
  type CategorySalesRow,
  type DashboardDto,
  type OrderChannel,
  type OrderDto,
  type PaymentDistributionRow,
  type ReportDto,
  type ReportRow,
  type RevenuePoint,
} from '@posshope/shared';
import { prisma } from '../../prisma.js';
import { businessDayStart, parseDateOnly, todayInBusinessTimezone } from '../../lib/dates.js';
import { ValidationError } from '../../lib/errors.js';
import { orderInclude, toOrderDto } from '../../lib/mappers.js';
import { currentLanguage } from '../../lib/request-language.js';

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;

const ORDER_TYPE_LABELS_AR: Record<string, string> = {
  DINE_IN: 'تناول في المطعم',
  TAKEAWAY: 'استلام',
  DELIVERY: 'توصيل',
};

const ORDER_CHANNEL_LABELS_AR: Record<OrderChannel, string> = {
  POS: 'نقاط البيع',
  ONLINE: 'الموقع الإلكتروني',
};

const reportOrderInclude = {
  items: true,
  payments: true,
  refunds: { select: { method: true, amount: true } },
  cashier: { select: { id: true, fullName: true } },
} satisfies Prisma.OrderInclude;

type ReportOrder = Prisma.OrderGetPayload<{ include: typeof reportOrderInclude }>;

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(dateOnly: string, days: number): string {
  const value = parseDateOnly(dateOnly);
  return new Date(value.getTime() + days * DAY).toISOString().slice(0, 10);
}

function differenceInDays(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / DAY);
}

function seriesLabel(dateOnly: string): string {
  return new Intl.DateTimeFormat(languageLocale(currentLanguage()), {
    month: 'short',
    day: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date(`${dateOnly}T12:00:00Z`));
}

function resolveRange(query: { from?: string; to?: string }, defaultDays = 30): {
  from: string;
  to: string;
  days: number;
} {
  const today = todayInBusinessTimezone();
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(defaultDays - 1));
  let days: number;
  try {
    days = differenceInDays(from, to) + 1;
  } catch {
    throw new ValidationError('Dates must use YYYY-MM-DD format');
  }
  if (days < 1) throw new ValidationError('The start date must be before the end date');
  if (days > MAX_RANGE_DAYS) throw new ValidationError(`Reports cover at most ${MAX_RANGE_DAYS} days`);
  return { from, to, days };
}

function rangeBounds(from: string, to: string): { start: Date; end: Date } {
  const start = businessDayStart(from);
  const end = new Date(businessDayStart(to).getTime() + DAY);
  return { start, end };
}

function refundTotal(order: ReportOrder): number {
  return (order.refunds ?? []).reduce((sum, refund) => sum + Number(refund.amount), 0);
}

function netTotal(order: ReportOrder): number {
  return Number(order.total) - refundTotal(order);
}

function orderCost(order: { items: Array<{ unitCost: Prisma.Decimal; quantity: number }> }): number {
  return order.items.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);
}

function orderProfit(order: ReportOrder): number {
  return (
    Number(order.subtotal) -
    Number(order.discount) -
    orderCost(order) +
    Number(order.deliveryFee) -
    refundTotal(order)
  );
}

export function recordedOrderFilter(
  start: Date,
  end: Date,
  branchId?: string,
  channel?: OrderChannel,
): Prisma.OrderWhereInput {
  return {
    status: { not: 'CANCELLED' },
    paymentStatus: { in: ['PAID', 'PAID_ONLINE', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    createdAt: { gte: start, lt: end },
    ...(branchId ? { branchId } : {}),
    ...(channel ? { channel } : {}),
  };
}

async function loadOrders(
  start: Date,
  end: Date,
  branchId?: string,
  channel?: OrderChannel,
): Promise<ReportOrder[]> {
  return prisma.order.findMany({
    where: recordedOrderFilter(start, end, branchId, channel),
    include: reportOrderInclude,
    orderBy: { createdAt: 'asc' },
  });
}

function buildSeries(orders: ReportOrder[], from: string, days: number): RevenuePoint[] {
  const buckets = new Map<string, RevenuePoint>();
  for (let index = 0; index < days; index += 1) {
    const key = addDays(from, index);
    buckets.set(key, { date: key, label: seriesLabel(key), revenue: 0, orders: 0, profit: 0 });
  }
  for (const order of orders) {
    const key = dateKey(order.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenue += netTotal(order);
    bucket.orders += 1;
    bucket.profit += orderProfit(order);
  }
  return [...buckets.values()].map((point) => ({
    ...point,
    revenue: Math.round(point.revenue * 100) / 100,
    profit: Math.round(point.profit * 100) / 100,
  }));
}

async function menuCategoryLookup(): Promise<
  Map<string, { name: string; nameAr: string | null; categoryId: string }>
> {
  const rows = await prisma.menuItem.findMany({ include: { category: true } });
  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.category.name, nameAr: row.category.nameAr, categoryId: row.categoryId },
    ]),
  );
}

function buildCategoryRows(
  orders: ReportOrder[],
  lookup: Map<string, { name: string; nameAr: string | null; categoryId: string }>,
): CategorySalesRow[] {
  const language = currentLanguage();
  const groups = new Map<
    string,
    { categoryId: string; name: string; revenue: number; units: number; orderIds: Set<string> }
  >();
  for (const order of orders) {
    for (const item of order.items) {
      const info = lookup.get(item.menuItemId);
      if (!info) continue;
      const existing = groups.get(info.categoryId) ?? {
        categoryId: info.categoryId,
        name: pickLocalized(language, info.name, info.nameAr),
        revenue: 0,
        units: 0,
        orderIds: new Set<string>(),
      };
      existing.revenue += Number(item.lineTotal);
      existing.units += item.quantity;
      existing.orderIds.add(order.id);
      groups.set(info.categoryId, existing);
    }
  }
  return [...groups.values()]
    .map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      revenue: row.revenue.toFixed(2),
      units: row.units,
      orders: row.orderIds.size,
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

function buildBestSellers(
  orders: ReportOrder[],
  lookup: Map<string, { name: string; nameAr: string | null; categoryId: string }>,
  limit = 8,
): BestSellerRow[] {
  const language = currentLanguage();
  const groups = new Map<
    string,
    { menuItemId: string; name: string; imageUrl: string | null; categoryName: string | null; units: number; revenue: number }
  >();
  for (const order of orders) {
    for (const item of order.items) {
      const category = lookup.get(item.menuItemId);
      const existing = groups.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        name: pickLocalized(language, item.menuItemName, item.menuItemNameAr),
        imageUrl: item.imageUrl,
        categoryName: category
          ? pickLocalizedNullable(language, category.name, category.nameAr)
          : null,
        units: 0,
        revenue: 0,
      };
      existing.units += item.quantity;
      existing.revenue += Number(item.lineTotal);
      groups.set(item.menuItemId, existing);
    }
  }
  return [...groups.values()]
    .map((row) => ({ ...row, revenue: row.revenue.toFixed(2) }))
    .sort((a, b) => b.units - a.units || Number(b.revenue) - Number(a.revenue))
    .slice(0, limit);
}

function buildPaymentDistribution(orders: ReportOrder[]): PaymentDistributionRow[] {
  const groups = new Map<string, { amount: number; count: number }>();
  for (const order of orders) {
    for (const payment of order.payments ?? []) {
      const existing = groups.get(payment.method) ?? { amount: 0, count: 0 };
      existing.amount += Number(payment.amount);
      existing.count += 1;
      groups.set(payment.method, existing);
    }
    for (const refund of order.refunds ?? []) {
      const existing = groups.get(refund.method) ?? { amount: 0, count: 0 };
      existing.amount -= Number(refund.amount);
      groups.set(refund.method, existing);
    }
  }
  const rows = [...groups.entries()].filter(([, row]) => row.amount > 0);
  const total = rows.reduce((sum, [, row]) => sum + row.amount, 0);
  return rows
    .map(([method, row]) => ({
      method: method as PaymentDistributionRow['method'],
      amount: row.amount.toFixed(2),
      count: row.count,
      percent: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
}

export function buildChannelRows(orders: ReportOrder[]): ReportRow[] {
  const language = currentLanguage();
  const groups = new Map<OrderChannel, { orders: number; units: number; revenue: number }>();
  for (const order of orders) {
    const channel = order.channel;
    const existing = groups.get(channel) ?? { orders: 0, units: 0, revenue: 0 };
    existing.orders += 1;
    existing.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
    existing.revenue += netTotal(order);
    groups.set(channel, existing);
  }
  return [...groups.entries()]
    .map(([channel, row]) => ({
      key: channel,
      label:
        language === 'ar' ? ORDER_CHANNEL_LABELS_AR[channel] : ORDER_CHANNEL_LABELS[channel],
      orders: row.orders,
      units: row.units,
      revenue: row.revenue.toFixed(2),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

export async function getDashboard(
  rangeDays: number,
  branchId?: string,
  channel?: OrderChannel,
): Promise<DashboardDto> {
  const language = currentLanguage();
  const today = todayInBusinessTimezone();
  const yesterday = addDays(today, -1);
  const range = resolveRange({ to: today, from: addDays(today, -(rangeDays - 1)) });
  const { start, end } = rangeBounds(range.from, range.to);
  const todayBounds = rangeBounds(today, today);
  const yesterdayBounds = rangeBounds(yesterday, yesterday);

  const [
    todayOrders,
    onlineTodayOrders,
    yesterdayOrders,
    rangeOrders,
    totalProducts,
    activeProducts,
    totalCustomers,
    pendingOrders,
    stockLevels,
    recentOrders,
    lookup,
  ] = await Promise.all([
    prisma.order.findMany({
      where: recordedOrderFilter(todayBounds.start, todayBounds.end, branchId, channel),
      include: reportOrderInclude,
    }),
    prisma.order.findMany({
      where: recordedOrderFilter(todayBounds.start, todayBounds.end, branchId, 'ONLINE'),
      include: reportOrderInclude,
    }),
    prisma.order.aggregate({
      where: recordedOrderFilter(yesterdayBounds.start, yesterdayBounds.end, branchId, channel),
      _sum: { total: true },
    }),
    loadOrders(start, end, branchId, channel),
    prisma.menuItem.count(),
    prisma.menuItem.count({ where: { isAvailable: true } }),
    prisma.customer.count(),
    prisma.order.count({
      where: {
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        ...(branchId ? { branchId } : {}),
        ...(channel ? { channel } : {}),
      },
    }),
    prisma.ingredientStock.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ingredient: { is: { isActive: true } },
      },
      include: { ingredient: true },
      orderBy: { currentStock: 'asc' },
    }),
    prisma.order.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(channel ? { channel } : {}),
      },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    menuCategoryLookup(),
  ]);

  const todayRevenue = todayOrders.reduce((sum, order) => sum + netTotal(order), 0);
  const todayProfit = todayOrders.reduce((sum, order) => sum + orderProfit(order), 0);
  const yesterdayRevenue = Number(yesterdayOrders._sum.total ?? 0);
  const revenueChangePct =
    yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
      : null;

  const lowStockLevels = stockLevels.filter(
    (level) => Number(level.currentStock) <= Number(level.minStock),
  );
  const onlineRevenue = onlineTodayOrders.reduce((sum, order) => sum + netTotal(order), 0);

  return {
    generatedAt: new Date().toISOString(),
    rangeDays,
    overview: {
      todayRevenue: todayRevenue.toFixed(2),
      todayOrders: todayOrders.length,
      averageOrderValue: (todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0).toFixed(2),
      totalProducts,
      activeProducts,
      totalCustomers,
      pendingOrders,
      lowStockIngredients: lowStockLevels.length,
      todayProfit: todayProfit.toFixed(2),
      revenueChangePct,
      onlineRevenue: onlineRevenue.toFixed(2),
      onlineOrders: onlineTodayOrders.length,
    },
    revenueSeries: buildSeries(rangeOrders, range.from, range.days),
    salesByCategory: buildCategoryRows(rangeOrders, lookup),
    salesByChannel: buildChannelRows(rangeOrders),
    bestSellers: buildBestSellers(rangeOrders, lookup),
    paymentDistribution: buildPaymentDistribution(rangeOrders),
    recentOrders: recentOrders.map((order) => toOrderDto(order) as OrderDto),
    lowStock: lowStockLevels.slice(0, 8).map((level) => ({
      id: level.ingredient.id,
      name: pickLocalized(language, level.ingredient.name, level.ingredient.nameAr),
      unit: level.ingredient.unit,
      currentStock: Number(level.currentStock),
      minStock: Number(level.minStock),
    })),
  };
}

export async function getSalesReport(
  query: {
    from?: string;
    to?: string;
    granularity?: 'day' | 'month';
  },
  branchId?: string,
  channel?: OrderChannel,
): Promise<ReportDto> {
  const language = currentLanguage();
  const range = resolveRange(query, 30);
  const { start, end } = rangeBounds(range.from, range.to);
  const [orders, lookup] = await Promise.all([
    loadOrders(start, end, branchId, channel),
    menuCategoryLookup(),
  ]);

  const revenue = orders.reduce((sum, order) => sum + netTotal(order), 0);
  const refunds = orders.reduce((sum, order) => sum + refundTotal(order), 0);
  const discounts = orders.reduce((sum, order) => sum + Number(order.discount), 0);
  const tax = orders.reduce((sum, order) => sum + Number(order.tax), 0);
  const deliveryFees = orders.reduce((sum, order) => sum + Number(order.deliveryFee), 0);
  const cost = orders.reduce((sum, order) => sum + orderCost(order), 0);
  const profit = orders.reduce((sum, order) => sum + orderProfit(order), 0);
  const netSales = orders.reduce(
    (sum, order) =>
      sum +
      Number(order.subtotal) -
      Number(order.discount) +
      Number(order.deliveryFee) -
      refundTotal(order),
    0,
  );
  const itemsSold = orders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  const cashierGroups = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const order of orders) {
    const existing = cashierGroups.get(order.cashierId) ?? {
      name: order.cashier.fullName,
      orders: 0,
      revenue: 0,
    };
    existing.orders += 1;
    existing.revenue += netTotal(order);
    cashierGroups.set(order.cashierId, existing);
  }
  const byCashier: CashierPerformanceRow[] = [...cashierGroups.entries()]
    .map(([userId, row]) => ({
      userId,
      name: row.name,
      orders: row.orders,
      revenue: row.revenue.toFixed(2),
      averageOrderValue: (row.orders > 0 ? row.revenue / row.orders : 0).toFixed(2),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));

  const discountGroups = new Map<string, { orders: number; amount: number }>();
  for (const order of orders) {
    if (Number(order.discount) <= 0) continue;
    const label =
      pickLocalizedNullable(language, order.discountLabel, order.discountLabelAr) ??
      (language === 'ar' ? 'خصم يدوي' : 'Manual discount');
    const existing = discountGroups.get(label) ?? { orders: 0, amount: 0 };
    existing.orders += 1;
    existing.amount += Number(order.discount);
    discountGroups.set(label, existing);
  }

  const consumptionRows = await prisma.inventoryMovement.groupBy({
    by: ['ingredientId', 'type'],
    where: {
      type: { in: ['SALE_DEDUCTION', 'CANCELLATION_RETURN'] },
      createdAt: { gte: start, lt: end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { quantity: true },
  });
  // Deductions are negative and cancellation returns are positive; summing the
  // signed ledger and flipping the sign yields true net consumption.
  const consumedByIngredient = new Map<string, number>();
  for (const row of consumptionRows) {
    const signed = Number(row._sum.quantity ?? 0);
    consumedByIngredient.set(
      row.ingredientId,
      (consumedByIngredient.get(row.ingredientId) ?? 0) - signed,
    );
  }
  const ingredientIds = [...consumedByIngredient.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([ingredientId]) => ingredientId);
  const ingredients =
    ingredientIds.length > 0
      ? await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : [];
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const inventoryConsumption = [...consumedByIngredient.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([ingredientId, quantity]) => {
      const ingredient = ingredientById.get(ingredientId);
      const unitCost = Number(ingredient?.costPerUnit ?? 0);
      return {
        ingredientId,
        name: ingredient
          ? pickLocalized(language, ingredient.name, ingredient.nameAr)
          : language === 'ar'
            ? 'غير معروف'
            : 'Unknown',
        unit: ingredient?.unit ?? ('KG' as const),
        quantity: Math.round(quantity * 1000) / 1000,
        cost: (quantity * unitCost).toFixed(2),
      };
    })
    .sort((a, b) => Number(b.cost) - Number(a.cost));

  const typeGroups = new Map<string, { orders: number; units: number; revenue: number }>();
  for (const order of orders) {
    const existing = typeGroups.get(order.type) ?? { orders: 0, units: 0, revenue: 0 };
    existing.orders += 1;
    existing.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
    existing.revenue += netTotal(order);
    typeGroups.set(order.type, existing);
  }
  const ordersByType: ReportRow[] = [...typeGroups.entries()].map(([type, row]) => ({
    key: type,
    label:
      language === 'ar'
        ? (ORDER_TYPE_LABELS_AR[type] ?? type)
        : ORDER_TYPE_LABELS[type as keyof typeof ORDER_TYPE_LABELS],
    orders: row.orders,
    units: row.units,
    revenue: row.revenue.toFixed(2),
  }));

  return {
    range,
    summary: {
      revenue: revenue.toFixed(2),
      orders: orders.length,
      itemsSold,
      averageOrderValue: (orders.length > 0 ? revenue / orders.length : 0).toFixed(2),
      discounts: discounts.toFixed(2),
      tax: tax.toFixed(2),
      deliveryFees: deliveryFees.toFixed(2),
      cost: cost.toFixed(2),
      profit: profit.toFixed(2),
      marginPct: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : null,
    },
    daily: buildSeries(orders, range.from, range.days),
    byCategory: buildCategoryRows(orders, lookup),
    bestSellers: buildBestSellers(orders, lookup, 12),
    byCashier,
    payments: buildPaymentDistribution(orders),
    discounts: [...discountGroups.entries()]
      .map(([label, row]) => ({ label, orders: row.orders, amount: row.amount.toFixed(2) }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
    inventoryConsumption,
    ordersByType,
    byChannel: buildChannelRows(orders),
    refunds: refunds.toFixed(2),
  };
}

export type { PaymentDistributionRow };
