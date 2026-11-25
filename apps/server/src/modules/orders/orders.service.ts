import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_BRANCH_ID,
  buildPaginated,
  canTransitionOrder,
  fromMinorUnits,
  computeOrderTax,
  sumCurrency,
  toMinorUnits,
  type IngredientUnit,
  type OrderAddItemsInput,
  type OrderChannel,
  type OrderCreateInput,
  type OrderQuery,
  type OrderRefundInput,
  type OrderSettleInput,
  type OrderStatus,
  type PaymentMethod,
  type PublicQuoteDto,
  type PublicQuoteInput,
  type Role,
  type TaxLineInput,
} from '@posshope/shared';
import { prisma } from '../../prisma.js';
import type { PrismaLike } from '../../lib/audit.js';
import { recordAudit } from '../../lib/audit.js';
import { findOpenShift } from '../../lib/branches.js';
import { todayInBusinessTimezone, businessDayStart } from '../../lib/dates.js';
import {
  ConflictError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { toDbStatus, toOrderDto, orderInclude, toApiStatus } from '../../lib/mappers.js';
import { localizeErrorMessage } from '../../lib/localized-messages.js';
import { currentLanguage } from '../../lib/request-language.js';
import { getSettings } from '../../lib/settings.js';
import { resolveDeliveryFee } from '../delivery-zones/delivery-zones.service.js';
import { syncStockAlertsMany } from '../inventory/alerts.service.js';

interface Actor {
  id: string;
  role: Role;
  branchId?: string | null;
  terminalId?: string | null;
}

interface OrderContext {
  branchId: string;
  terminalId: string;
  /** Only the storefront sets this; staff orders take `input.channel` (POS or TALABAT). */
  channel?: OrderChannel;
  /** Online card orders stay unpaid until the gateway confirms capture. */
  onlineCard?: boolean;
  expectedZoneId?: string | null;
  expectedDeliveryFeeMinor?: number;
}

interface PreparedTopping {
  id: string;
  name: string;
  nameAr: string | null;
  price: string;
  ingredientId: string | null;
  ingredientQuantity: number;
  ingredientCost: number | null;
}

interface PreparedLine {
  menuItemId: string;
  menuItemName: string;
  menuItemNameAr: string | null;
  imageUrl: string | null;
  sizeId: string | null;
  sizeName: string | null;
  sizeNameAr: string | null;
  quantity: number;
  unitPrice: string;
  toppingPrice: string;
  lineTotal: string;
  taxInclusive: boolean;
  unitCost: string;
  multiplier: number;
  specialInstructions: string | null;
  toppings: PreparedTopping[];
  recipe: Array<{ ingredientId: string; quantity: number; costPerUnit: number }>;
}

interface PaymentPlan {
  rows: Array<{ method: PaymentMethod; amount: string; reference: string | null }>;
  amountPaidMinor: number;
  changeMinor: number;
  primaryMethod: PaymentMethod;
}

async function generateIdentifiers(client: PrismaLike = prisma): Promise<{
  orderNumber: string;
  invoiceNumber: string;
}> {
  const dayKey = todayInBusinessTimezone().replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    const orderNumber = `ORD-${dayKey}-${suffix}`;
    const invoiceNumber = `INV-${dayKey}-${suffix}`;
    const [existingOrder, existingInvoice] = await Promise.all([
      client.order.findUnique({ where: { orderNumber }, select: { id: true } }),
      client.invoice.findUnique({ where: { invoiceNumber }, select: { id: true } }),
    ]);
    if (!existingOrder && !existingInvoice) return { orderNumber, invoiceNumber };
  }
  throw new ConflictError('Could not allocate an order number, please retry');
}

async function generateRefundIdentifiers(
  client: PrismaLike,
): Promise<{ refundNumber: string; creditNoteNumber: string }> {
  const dayKey = todayInBusinessTimezone().replace(/-/gu, '');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    const refundNumber = `REF-${dayKey}-${suffix}`;
    const creditNoteNumber = `CN-${dayKey}-${suffix}`;
    const [existingRefund, existingNote] = await Promise.all([
      client.refund.findUnique({ where: { refundNumber }, select: { id: true } }),
      client.creditNote.findUnique({ where: { creditNoteNumber }, select: { id: true } }),
    ]);
    if (!existingRefund && !existingNote) return { refundNumber, creditNoteNumber };
  }
  throw new ConflictError('Could not allocate a refund number, please retry');
}

function moneyMinor(value: string): number {
  return toMinorUnits(value);
}

function resolveBranch(actor: Actor, context?: Partial<OrderContext>): string {
  return context?.branchId ?? actor.branchId ?? DEFAULT_BRANCH_ID;
}

function resolveTerminal(actor: Actor, context?: Partial<OrderContext>): string {
  return context?.terminalId ?? actor.terminalId ?? 'TERM-WEB';
}

async function findIdempotentOrder(
  idempotencyKey: string,
  actor: Actor,
): Promise<ReturnType<typeof toOrderDto> | null> {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: orderInclude,
  });
  if (!existing) return null;
  if (existing.cashierId !== actor.id) {
    throw new ConflictError('This idempotency key has already been used');
  }
  return toOrderDto(existing);
}

const STOCK_SCALE = 3;

interface StockRequisition {
  quantity: number;
  unitCost: number;
  note: string;
}

interface StockShortage {
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  required: string;
  available: string;
}

function toStockUnits(quantity: number): number {
  return Math.round(quantity * 10 ** STOCK_SCALE);
}

function formatStockUnits(units: number): string {
  return fromMinorUnits(units, STOCK_SCALE);
}

function stockShortageMessage(shortages: readonly StockShortage[]): string {
  const details = shortages
    .map(
      (shortage) =>
        `${shortage.ingredientName} (need ${shortage.required} ${shortage.unit}, have ${shortage.available} ${shortage.unit})`,
    )
    .join('; ');
  return `Insufficient stock for ${details}`;
}

function buildStockRequisitions(prepared: readonly PreparedLine[]): Map<string, StockRequisition> {
  const requisitions = new Map<string, StockRequisition>();
  const add = (ingredientId: string, quantity: number, unitCost: number, note: string): void => {
    const existing = requisitions.get(ingredientId);
    if (existing) existing.quantity += quantity;
    else requisitions.set(ingredientId, { quantity, unitCost, note });
  };

  for (const line of prepared) {
    for (const recipeLine of line.recipe) {
      add(
        recipeLine.ingredientId,
        recipeLine.quantity * line.multiplier * line.quantity,
        recipeLine.costPerUnit,
        line.menuItemName,
      );
    }
    for (const topping of line.toppings) {
      if (!topping.ingredientId) continue;
      add(
        topping.ingredientId,
        topping.ingredientQuantity * line.quantity,
        topping.ingredientCost ?? 0,
        `${line.menuItemName} + ${topping.name}`,
      );
    }
  }
  return requisitions;
}

interface StockPlanEntry {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  note: string;
}

function planFromRequisitions(
  requisitions: Map<string, StockRequisition>,
): StockPlanEntry[] {
  return [...requisitions.entries()].map(([ingredientId, entry]) => ({
    ingredientId,
    quantity: entry.quantity,
    unitCost: entry.unitCost,
    note: entry.note,
  }));
}

function requisitionsFromPlan(value: Prisma.JsonValue | null): Map<string, StockRequisition> {
  const map = new Map<string, StockRequisition>();
  if (!Array.isArray(value)) return map;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.ingredientId !== 'string') continue;
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    map.set(entry.ingredientId, {
      quantity,
      unitCost: Number(entry.unitCost) || 0,
      note: typeof entry.note === 'string' ? entry.note : '',
    });
  }
  return map;
}

/**
 * Deducts the stock snapshot captured when a deferred-payment order was
 * created (tabs, cash on delivery, online card). Idempotent: the order flag is
 * updated in the same transaction, so a duplicate payment event cannot double
 * deduct. WARN policy allows the sale and raises low/out alerts instead.
 */
export async function commitOrderStock(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      branchId: true,
      cashierId: true,
      inventoryDeducted: true,
      stockPlan: true,
    },
  });
  if (!order || order.inventoryDeducted) return;
  const requisitions = requisitionsFromPlan(order.stockPlan);
  const settings = await tx.restaurantSettings.findFirst({
    select: { stockPolicy: true },
  });
  await consumeStock(tx, requisitions, order.branchId, order.id, order.cashierId, {
    allowNegative: settings?.stockPolicy === 'WARN',
  });
  await tx.order.update({
    where: { id: order.id },
    data: { inventoryDeducted: true, stockPlan: Prisma.DbNull },
  });
}

type MenuItemRow = Prisma.MenuItemGetPayload<{
  include: {
    sizes: true;
    recipes: { include: { items: { include: { ingredient: true } } } };
  };
}>;

type ToppingRow = Prisma.ToppingGetPayload<{ include: { ingredient: true } }>;

async function loadMenuContext(
  menuItemIds: readonly string[],
  toppingIds: readonly string[],
): Promise<{ menuById: Map<string, MenuItemRow>; toppingById: Map<string, ToppingRow> }> {
  const [menuItems, toppingRows] = await Promise.all([
    prisma.menuItem.findMany({
      where: { id: { in: [...new Set(menuItemIds)] } },
      include: {
        sizes: true,
        recipes: {
          where: { isActive: true },
          include: { items: { include: { ingredient: true } } },
        },
      },
    }),
    toppingIds.length > 0
      ? prisma.topping.findMany({
          where: { id: { in: [...new Set(toppingIds)] } },
          include: { ingredient: true },
        })
      : Promise.resolve([] as ToppingRow[]),
  ]);
  return {
    menuById: new Map(menuItems.map((item) => [item.id, item])),
    toppingById: new Map(toppingRows.map((topping) => [topping.id, topping])),
  };
}

function prepareLines(
  lines: OrderCreateInput['items'],
  menuById: Map<string, MenuItemRow>,
  toppingById: Map<string, ToppingRow>,
): PreparedLine[] {
  return lines.map((line) => {
    const menuItem = menuById.get(line.menuItemId);
    if (!menuItem) throw new ValidationError('One or more menu items are no longer available');
    if (!menuItem.isAvailable)
      throw new ConflictError(`${menuItem.name} is currently marked as sold out`);

    let sizeId: string | null = null;
    let sizeName: string | null = null;
    let sizeNameAr: string | null = null;
    let multiplier = 1;
    let unitPrice: string;

    if (menuItem.hasSizes) {
      if (!line.sizeId) throw new ValidationError(`Choose a size for ${menuItem.name}`);
      const size = menuItem.sizes.find((candidate) => candidate.id === line.sizeId);
      if (!size) throw new ValidationError(`That size is not available for ${menuItem.name}`);
      sizeId = size.id;
      sizeName = size.name;
      sizeNameAr = size.nameAr;
      multiplier = Number(size.ingredientMultiplier);
      unitPrice = Number(size.price).toFixed(2);
    } else {
      if (line.sizeId) throw new ValidationError(`${menuItem.name} is not sold by size`);
      unitPrice = Number(menuItem.basePrice).toFixed(2);
    }

    const selectedToppings: PreparedTopping[] = [];
    const seen = new Set<string>();
    for (const toppingId of line.toppingIds) {
      if (seen.has(toppingId)) continue;
      seen.add(toppingId);
      const topping = toppingById.get(toppingId);
      if (!topping || !topping.isAvailable) {
        throw new ValidationError('One or more selected toppings are unavailable');
      }
      selectedToppings.push({
        id: topping.id,
        name: topping.name,
        nameAr: topping.nameAr,
        price: Number(topping.price).toFixed(2),
        ingredientId: topping.ingredientId,
        ingredientQuantity: Number(topping.ingredientQuantity),
        ingredientCost: topping.ingredient ? Number(topping.ingredient.costPerUnit) : null,
      });
    }

    const toppingPrice = sumCurrency(selectedToppings.map((topping) => topping.price));
    const lineTotal = sumCurrency(
      Array.from({ length: line.quantity }, () => sumCurrency([unitPrice, toppingPrice])),
    );

    const activeRecipes = menuItem.recipes.filter((recipe) => recipe.isActive);
    const chosenRecipe =
      activeRecipes.find((recipe) => recipe.sizeId === sizeId) ??
      activeRecipes.find((recipe) => recipe.sizeId === null);
    // A size-specific recipe overrides the base recipe entirely; the base
    // recipe is scaled by the size multiplier.
    const effectiveMultiplier = chosenRecipe?.sizeId === sizeId ? 1 : multiplier;
    const recipe = (chosenRecipe?.items ?? []).map((recipeLine) => ({
      ingredientId: recipeLine.ingredientId,
      quantity: Number(recipeLine.quantity),
      costPerUnit:
        Number(recipeLine.ingredient.averageCost) || Number(recipeLine.ingredient.costPerUnit),
    }));
    const recipeCost = recipe.reduce(
      (sum, recipeLine) => sum + recipeLine.quantity * recipeLine.costPerUnit,
      0,
    );
    const toppingCostTotal = selectedToppings.reduce(
      (sum, topping) => sum + topping.ingredientQuantity * (topping.ingredientCost ?? 0),
      0,
    );
    const unitCost = (recipeCost * effectiveMultiplier + toppingCostTotal).toFixed(2);

    return {
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      menuItemNameAr: menuItem.nameAr,
      imageUrl: menuItem.imageUrl,
      sizeId,
      sizeName,
      sizeNameAr,
      quantity: line.quantity,
      unitPrice,
      toppingPrice,
      lineTotal,
      taxInclusive: menuItem.taxInclusive,
      unitCost,
      multiplier: effectiveMultiplier,
      specialInstructions: line.specialInstructions ?? null,
      toppings: selectedToppings,
      recipe,
    };
  });
}

function lineCreateData(line: PreparedLine) {
  return {
    menuItemId: line.menuItemId,
    menuItemName: line.menuItemName,
    menuItemNameAr: line.menuItemNameAr,
    imageUrl: line.imageUrl,
    sizeId: line.sizeId,
    sizeName: line.sizeName,
    sizeNameAr: line.sizeNameAr,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    toppingsTotal: line.toppingPrice,
    lineTotal: line.lineTotal,
    taxInclusive: line.taxInclusive,
    unitCost: line.unitCost,
    specialInstructions: line.specialInstructions,
    toppings: {
      create: line.toppings.map((topping) => ({
        toppingId: topping.id,
        name: topping.name,
        nameAr: topping.nameAr,
        price: topping.price,
      })),
    },
  };
}

function taxLines(lines: readonly PreparedLine[]): TaxLineInput[] {
  return lines.map((line) => ({
    amountMinor: moneyMinor(line.lineTotal),
    taxInclusive: line.taxInclusive,
  }));
}

function paymentPlan(
  payments: readonly { method: PaymentMethod; amount: string; reference?: string | null }[],
  totalMinor: number,
): PaymentPlan {
  const cashPayment = payments.find((payment) => payment.method === 'CASH') ?? null;
  const cashTenderedMinor = cashPayment ? toMinorUnits(cashPayment.amount) : 0;
  const nonCashPayments = payments.filter((payment) => payment.method !== 'CASH');
  const nonCashMinor = nonCashPayments.reduce(
    (sum, payment) => sum + toMinorUnits(payment.amount),
    0,
  );
  if (nonCashMinor > totalMinor) {
    throw new ValidationError('Card and wallet amounts exceed the order total');
  }
  const appliedCashMinor = totalMinor - nonCashMinor;
  if (cashPayment) {
    if (cashTenderedMinor < appliedCashMinor) {
      throw new ValidationError('Cash received is less than the remaining order total');
    }
    if (appliedCashMinor === 0) {
      throw new ValidationError('Card and wallet amounts already cover the order total');
    }
  } else if (nonCashMinor !== totalMinor) {
    throw new ValidationError('Payments must add up to the order total');
  }
  const amountPaidMinor = cashTenderedMinor + nonCashMinor;
  const changeMinor = amountPaidMinor - totalMinor;
  const primaryMethod = payments[0]?.method ?? 'CASH';
  const rows: PaymentPlan['rows'] = [
    ...nonCashPayments.map((payment) => ({
      method: payment.method,
      amount: fromMinorUnits(toMinorUnits(payment.amount)),
      reference: payment.reference ?? null,
    })),
    ...(cashPayment
      ? [
          {
            method: 'CASH' as const,
            amount: fromMinorUnits(appliedCashMinor),
            reference: cashPayment.reference ?? null,
          },
        ]
      : []),
  ];
  return { rows, amountPaidMinor, changeMinor, primaryMethod };
}

function derivePaymentStatus(
  paidMinor: number,
  refundedMinor: number,
): 'UNPAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' {
  if (paidMinor <= 0) return 'UNPAID';
  if (refundedMinor <= 0) return 'PAID';
  if (refundedMinor >= paidMinor) return 'REFUNDED';
  return 'PARTIALLY_REFUNDED';
}

/**
 * Branch-scoped stock consumption. The availability pass gives a friendlier
 * error, while the conditional `updateMany` decrement is what actually
 * guarantees two concurrent checkouts can never drive stock negative.
 */
async function consumeStock(
  tx: Prisma.TransactionClient,
  requisitions: Map<string, StockRequisition>,
  branchId: string,
  orderId: string,
  userId: string,
  options?: { allowNegative?: boolean },
): Promise<void> {
  const ingredientIds = [...requisitions.keys()].sort();
  if (ingredientIds.length === 0) return;
  const allowNegative = options?.allowNegative === true;

  const [levels, ingredients] = await Promise.all([
    tx.ingredientStock.findMany({
      where: { branchId, ingredientId: { in: ingredientIds } },
      select: { ingredientId: true, currentStock: true },
    }),
    tx.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true, name: true, unit: true },
    }),
  ]);
  const levelByIngredient = new Map(levels.map((level) => [level.ingredientId, level]));
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const shortages: StockShortage[] = [];
  for (const ingredientId of ingredientIds) {
    const requiredUnits = toStockUnits(requisitions.get(ingredientId)!.quantity);
    if (requiredUnits <= 0) continue;
    const availableUnits = toStockUnits(
      Number(levelByIngredient.get(ingredientId)?.currentStock ?? 0),
    );
    if (availableUnits >= requiredUnits) continue;
    const ingredient = ingredientById.get(ingredientId);
    shortages.push({
      ingredientId,
      ingredientName: ingredient?.name ?? 'Unknown ingredient',
      unit: ingredient?.unit ?? 'PIECE',
      required: formatStockUnits(requiredUnits),
      available: formatStockUnits(availableUnits),
    });
  }
  if (shortages.length > 0 && !allowNegative) {
    throw new InsufficientStockError(stockShortageMessage(shortages), { shortages });
  }

  for (const ingredientId of ingredientIds) {
    const requiredUnits = toStockUnits(requisitions.get(ingredientId)!.quantity);
    if (requiredUnits <= 0) continue;
    const required = formatStockUnits(requiredUnits);
    if (allowNegative) {
      await tx.ingredientStock.upsert({
        where: { ingredientId_branchId: { ingredientId, branchId } },
        create: {
          ingredientId,
          branchId,
          currentStock: formatStockUnits(-requiredUnits),
        },
        update: { currentStock: { decrement: required } },
      });
      continue;
    }
    const claimed = await tx.ingredientStock.updateMany({
      where: { ingredientId, branchId, currentStock: { gte: required } },
      data: { currentStock: { decrement: required } },
    });
    if (claimed.count === 0) {
      const current = await tx.ingredientStock.findUnique({
        where: { ingredientId_branchId: { ingredientId, branchId } },
        select: { currentStock: true },
      });
      const ingredient = ingredientById.get(ingredientId);
      const shortage: StockShortage = {
        ingredientId,
        ingredientName: ingredient?.name ?? 'Unknown ingredient',
        unit: ingredient?.unit ?? 'PIECE',
        required,
        available: formatStockUnits(current ? toStockUnits(Number(current.currentStock)) : 0),
      };
      throw new InsufficientStockError(stockShortageMessage([shortage]), {
        shortages: [shortage],
      });
    }
  }

  const movementRows = ingredientIds.flatMap((ingredientId) => {
    const entry = requisitions.get(ingredientId)!;
    const requiredUnits = toStockUnits(entry.quantity);
    if (requiredUnits <= 0) return [];
    return [
      {
        ingredientId,
        branchId,
        orderId,
        type: 'SALE_DEDUCTION' as const,
        quantity: formatStockUnits(-requiredUnits),
        unitCost: entry.unitCost.toFixed(2),
        note: entry.note,
        userId,
      },
    ];
  });
  if (movementRows.length > 0) {
    await tx.inventoryMovement.createMany({ data: movementRows });
  }
  await syncStockAlertsMany(
    tx,
    ingredientIds.map((ingredientId) => ({ ingredientId, branchId })),
  );
}

async function restoreOrderStock(
  tx: Prisma.TransactionClient,
  order: { id: string; orderNumber: string; branchId: string },
  movements: ReadonlyArray<{
    ingredientId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal | null;
  }>,
  userId: string,
): Promise<{ ingredients: number; quantity: number }> {
  const restore = new Map<string, { quantity: number; unitCost: number | null }>();
  for (const movement of movements) {
    const quantity = Math.abs(Number(movement.quantity));
    if (quantity <= 0) continue;
    const existing = restore.get(movement.ingredientId);
    if (existing) existing.quantity += quantity;
    else
      restore.set(movement.ingredientId, {
        quantity,
        unitCost: movement.unitCost === null ? null : Number(movement.unitCost),
      });
  }
  if (restore.size === 0) return { ingredients: 0, quantity: 0 };

  // Acquire stock rows in the same ingredient-id order as consumeStock so
  // concurrent creates and restores can never deadlock on each other.
  const restoreIds = [...restore.keys()].sort();
  await tx.inventoryMovement.createMany({
    data: restoreIds.map((ingredientId) => {
      const entry = restore.get(ingredientId)!;
      return {
        ingredientId,
        branchId: order.branchId,
        orderId: order.id,
        type: 'CANCELLATION_RETURN' as const,
        quantity: entry.quantity.toFixed(3),
        unitCost: entry.unitCost === null ? null : entry.unitCost.toFixed(2),
        note: `Cancelled order ${order.orderNumber}`,
        userId,
      };
    }),
  });

  let total = 0;
  for (const ingredientId of restoreIds) {
    const entry = restore.get(ingredientId)!;
    total += entry.quantity;
    await tx.ingredientStock.upsert({
      where: { ingredientId_branchId: { ingredientId, branchId: order.branchId } },
      create: {
        ingredientId,
        branchId: order.branchId,
        currentStock: entry.quantity.toFixed(3),
      },
      update: { currentStock: { increment: entry.quantity.toFixed(3) } },
    });
  }
  await syncStockAlertsMany(
    tx,
    restoreIds.map((ingredientId) => ({ ingredientId, branchId: order.branchId })),
  );
  return { ingredients: restore.size, quantity: total };
}

interface RefundLine {
  method: PaymentMethod;
  amountMinor: number;
  paymentId: string | null;
}

async function createRefundRecord(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    branchId: string;
    shiftId: string | null;
    line: RefundLine;
    reason: string;
    actorId: string;
  },
): Promise<void> {
  const { refundNumber, creditNoteNumber } = await generateRefundIdentifiers(tx);
  const refund = await tx.refund.create({
    data: {
      refundNumber,
      orderId: params.orderId,
      paymentId: params.line.paymentId,
      branchId: params.branchId,
      shiftId: params.shiftId,
      method: params.line.method,
      amount: fromMinorUnits(params.line.amountMinor),
      reason: params.reason,
      actorId: params.actorId,
    },
  });
  await tx.creditNote.create({
    data: {
      creditNoteNumber,
      refundId: refund.id,
      orderId: params.orderId,
      amount: fromMinorUnits(params.line.amountMinor),
      reason: params.reason,
    },
  });
}

/**
 * Prices a storefront cart without creating anything.
 *
 * Uses exactly the same line preparation, tax and delivery-fee logic as
 * `createOrder`, so the figures a customer reviews are the figures they will
 * be charged. Delivery problems (no pin yet, out of zone, below the zone
 * minimum) are reported in `deliveryIssue` instead of failing the whole quote,
 * because the cart is priced before the customer has chosen an address.
 */
export async function quoteOrder(input: PublicQuoteInput): Promise<PublicQuoteDto> {
  const settings = await getSettings();
  const { menuById, toppingById } = await loadMenuContext(
    input.items.map((item) => item.menuItemId),
    input.items.flatMap((item) => item.toppingIds),
  );
  const prepared = prepareLines(input.items, menuById, toppingById);
  const arabic = currentLanguage() === 'ar';

  const subtotalMinor = prepared.reduce((sum, line) => sum + moneyMinor(line.lineTotal), 0);

  let deliveryFeeMinor: number | null = 0;
  let deliveryZoneId: string | null = null;
  let deliveryIssue: string | null = null;
  if (input.fulfillment === 'DELIVERY') {
    try {
      const resolved = await resolveDeliveryFee({
        branchId: input.branchId,
        point:
          input.customerLat != null && input.customerLng != null
            ? { lat: input.customerLat, lng: input.customerLng }
            : null,
        subtotalMinor,
        fallbackFee: settings.deliveryFee,
      });
      deliveryFeeMinor = resolved.deliveryFeeMinor;
      deliveryZoneId = resolved.zoneId;
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      deliveryFeeMinor = null;
      deliveryIssue = localizeErrorMessage(error.message, currentLanguage());
    }
  }

  const totals = computeOrderTax({
    lines: taxLines(prepared),
    taxRate: Number(settings.taxRate),
    deliveryFeeMinor: deliveryFeeMinor ?? 0,
  });

  return {
    currency: settings.currency,
    lines: prepared.map((line) => ({
      menuItemId: line.menuItemId,
      sizeId: line.sizeId,
      name: arabic && line.menuItemNameAr ? line.menuItemNameAr : line.menuItemName,
      sizeName: arabic && line.sizeNameAr ? line.sizeNameAr : line.sizeName,
      toppings: line.toppings.map((topping) =>
        arabic && topping.nameAr ? topping.nameAr : topping.name,
      ),
      quantity: line.quantity,
      unitPrice: sumCurrency([line.unitPrice, line.toppingPrice]),
      lineTotal: line.lineTotal,
    })),
    subtotal: fromMinorUnits(subtotalMinor),
    taxRate: Number(settings.taxRate).toFixed(2),
    tax: fromMinorUnits(totals.taxMinor),
    taxIncluded: fromMinorUnits(totals.includedTaxMinor),
    deliveryFee: deliveryFeeMinor === null ? null : fromMinorUnits(deliveryFeeMinor),
    deliveryZoneId,
    deliveryIssue,
    total: fromMinorUnits(totals.totalMinor),
  };
}

export async function createOrder(
  input: OrderCreateInput,
  actor: Actor,
  context?: Partial<OrderContext>,
): Promise<ReturnType<typeof toOrderDto>> {
  if (input.idempotencyKey) {
    const replay = await findIdempotentOrder(input.idempotencyKey, actor);
    if (replay) return replay;
  }

  const branchId = resolveBranch(actor, context);
  const terminalId = resolveTerminal(actor, context);
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, isActive: true },
  });
  if (!branch || !branch.isActive) throw new ValidationError('Select an active branch');

  const settings = await getSettings();
  const { menuById, toppingById } = await loadMenuContext(
    input.items.map((item) => item.menuItemId),
    input.items.flatMap((item) => item.toppingIds),
  );
  const prepared = prepareLines(input.items, menuById, toppingById);

  let table: {
    id: string;
    name: string;
    status: string;
    branchId: string;
    isActive: boolean;
  } | null = null;
  if (input.tableId) {
    if (input.type !== 'DINE_IN') {
      throw new ValidationError('Tables can only be assigned to dine-in orders');
    }
    table = await prisma.diningTable.findUnique({
      where: { id: input.tableId },
      select: { id: true, name: true, status: true, branchId: true, isActive: true },
    });
    if (!table || !table.isActive || table.branchId !== branchId) {
      throw new ValidationError('Select a valid table for this branch');
    }
    if (table.status !== 'AVAILABLE') {
      throw new ConflictError(`${table.name} is not available right now`);
    }
  }

  let customer: { id: string; name: string; phone: string | null; address: string | null } | null =
    null;
  if (input.customerId) {
    customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, phone: true, address: true },
    });
    if (!customer) throw new ValidationError('Select a valid customer');
  }

  let discount = null as null | {
    id: string;
    name: string;
    nameAr: string | null;
    type: 'PERCENT' | 'FIXED';
    value: Prisma.Decimal;
    isActive: boolean;
  };
  if (input.discountId) {
    discount = await prisma.discount.findUnique({
      where: { id: input.discountId },
      select: { id: true, name: true, nameAr: true, type: true, value: true, isActive: true },
    });
    if (!discount || !discount.isActive)
      throw new ValidationError('That discount is no longer available');
  }

  const requisitions = buildStockRequisitions(prepared);

  const subtotalMinor = prepared.reduce((sum, line) => sum + moneyMinor(line.lineTotal), 0);
  let discountMinor = 0;
  if (discount) {
    discountMinor =
      discount.type === 'PERCENT'
        ? Math.round((subtotalMinor * Number(discount.value)) / 100)
        : Math.min(moneyMinor(Number(discount.value).toFixed(2)), subtotalMinor);
    if (actor.role === 'CASHIER') {
      const capMinor = Math.round((subtotalMinor * Number(settings.maxCashierDiscountPct)) / 100);
      if (discountMinor > capMinor) {
        throw new ForbiddenError(
          `This discount exceeds your authorised limit of ${Number(settings.maxCashierDiscountPct).toFixed(2)}%`,
        );
      }
    }
  }
  let deliveryMinor = 0;
  let deliveryZoneId: string | null = null;
  if (input.type === 'DELIVERY') {
    const resolved = await resolveDeliveryFee({
      branchId,
      point:
        input.customerLat != null && input.customerLng != null
          ? { lat: input.customerLat, lng: input.customerLng }
          : null,
      subtotalMinor,
      fallbackFee: settings.deliveryFee,
    });
    if (
      context?.expectedZoneId !== undefined &&
      context.expectedZoneId !== resolved.zoneId
    ) {
      throw new ConflictError(
        'The delivery zone changed while you were ordering. Refresh the quote and try again',
      );
    }
    if (
      context?.expectedDeliveryFeeMinor !== undefined &&
      context.expectedDeliveryFeeMinor !== resolved.deliveryFeeMinor
    ) {
      throw new ConflictError(
        'The delivery fee changed while you were ordering. Refresh the quote and try again',
      );
    }
    deliveryMinor = resolved.deliveryFeeMinor;
    deliveryZoneId = resolved.zoneId;
  }
  const totals = computeOrderTax({
    lines: taxLines(prepared),
    discountMinor,
    taxRate: Number(settings.taxRate),
    deliveryFeeMinor: deliveryMinor,
  });
  const taxMinor = totals.taxMinor;
  const totalMinor = totals.totalMinor;

  const onlineCard = context?.onlineCard === true;
  const deferredPayment = input.payLater || input.isCod || onlineCard;
  const deductNow = !deferredPayment;
  const plan = deferredPayment ? null : paymentPlan(input.payments, totalMinor);
  const openShift = deferredPayment ? null : await findOpenShift(branchId, terminalId);
  const { orderNumber, invoiceNumber } = await generateIdentifiers();

  const createData: Prisma.OrderCreateInput = {
    orderNumber,
    idempotencyKey: input.idempotencyKey ?? null,
    type: input.type,
    channel: context?.channel ?? input.channel ?? 'POS',
    status: 'PENDING',
    branch: { connect: { id: branchId } },
    ...(table ? { table: { connect: { id: table.id } } } : {}),
    ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
    customerName: customer?.name ?? input.customerName ?? null,
    customerPhone: customer?.phone ?? input.customerPhone ?? null,
    customerAddress: input.customerAddress ?? customer?.address ?? null,
    customerLat: input.customerLat ?? null,
    customerLng: input.customerLng ?? null,
    ...(deliveryZoneId ? { deliveryZone: { connect: { id: deliveryZoneId } } } : {}),
    tableNumber: table?.name ?? input.tableNumber ?? null,
    cashier: { connect: { id: actor.id } },
    ...(openShift ? { shift: { connect: { id: openShift.id } } } : {}),
    subtotal: fromMinorUnits(subtotalMinor),
    discount: fromMinorUnits(discountMinor),
    discountLabel: discount?.name ?? null,
    discountLabelAr: discount?.nameAr ?? null,
    ...(discount ? { discountRel: { connect: { id: discount.id } } } : {}),
    tax: fromMinorUnits(taxMinor),
    taxIncluded: fromMinorUnits(totals.includedTaxMinor),
    deliveryFee: fromMinorUnits(deliveryMinor),
    total: fromMinorUnits(totalMinor),
    amountPaid: fromMinorUnits(plan?.amountPaidMinor ?? 0),
    changeDue: fromMinorUnits(plan?.changeMinor ?? 0),
    paymentMethod: plan?.primaryMethod ?? (onlineCard ? 'CARD' : 'CASH'),
    paymentStatus: onlineCard ? 'PENDING_PAYMENT' : deferredPayment ? 'UNPAID' : 'PAID',
    isCod: input.isCod,
    ...(input.type === 'DELIVERY' ? { deliveryStatus: 'PENDING' as const } : {}),
    notes: input.notes ?? null,
    externalRef: input.externalRef ?? null,
    inventoryDeducted: deductNow,
    ...(deductNow
      ? {}
      : { stockPlan: planFromRequisitions(requisitions) as unknown as Prisma.InputJsonValue }),
    items: {
      create: prepared.map((line) => lineCreateData(line)),
    },
  };

  let order!: Parameters<typeof toOrderDto>[0];
  try {
    order = await prisma.$transaction(async (tx) => {
      if (table) {
        const claimedTable = await tx.diningTable.updateMany({
          where: { id: table.id, status: 'AVAILABLE' },
          data: { status: 'OCCUPIED' },
        });
        if (claimedTable.count === 0) {
          throw new ConflictError('That table was just taken. Pick another table.');
        }
      }

      const created = await tx.order.create({ data: createData, include: { items: true } });

      if (plan) {
        await tx.payment.createMany({
          data: plan.rows.map((row) => ({
            orderId: created.id,
            ...row,
            ...(openShift ? { shiftId: openShift.id } : {}),
          })),
        });
        await tx.invoice.create({
          data: { orderId: created.id, invoiceNumber, issuedAt: created.createdAt },
        });
      }

      if (deductNow) {
        await consumeStock(tx, requisitions, branchId, created.id, actor.id, {
          allowNegative: settings.stockPolicy === 'WARN',
        });
      }

      await recordAudit(
        {
          action: input.payLater ? 'order.tab.opened' : 'order.created',
          entityType: 'Order',
          entityId: created.id,
          after: {
            orderNumber: created.orderNumber,
            total: created.total.toString(),
            type: created.type,
            channel: created.channel,
            paymentStatus: created.paymentStatus,
            branchId,
            tableNumber: table?.name ?? input.tableNumber ?? null,
          },
          userId: actor.id,
          terminalId,
        },
        tx,
      );

      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude });
    });
  } catch (error) {
    // A concurrent retry with the same key loses the unique race; return the
    // winner's order instead of surfacing a duplicate error.
    if (
      input.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const replay = await findIdempotentOrder(input.idempotencyKey, actor);
      if (replay) return replay;
    }
    throw error;
  }

  return toOrderDto(order);
}

async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE`;
}

export async function addOrderItems(
  orderId: string,
  input: OrderAddItemsInput,
  actor: Actor,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);
  if (order.status === 'CANCELLED') {
    throw new ConflictError('Cancelled orders cannot be modified');
  }
  if (order.paymentStatus !== 'UNPAID') {
    throw new ConflictError('Only open tabs can receive extra items');
  }

  const settings = await getSettings();
  const { menuById, toppingById } = await loadMenuContext(
    input.items.map((item) => item.menuItemId),
    input.items.flatMap((item) => item.toppingIds),
  );
  const prepared = prepareLines(input.items, menuById, toppingById);
  const requisitions = buildStockRequisitions(prepared);
  const addedSubtotalMinor = prepared.reduce((sum, line) => sum + moneyMinor(line.lineTotal), 0);

  const updated = await prisma.$transaction(async (tx) => {
    // Serialize tab edits so parallel additions never lose a subtotal update.
    await lockOrderRow(tx, order.id);
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (current.status === 'CANCELLED') {
      throw new ConflictError('Cancelled orders cannot be modified');
    }
    if (current.paymentStatus !== 'UNPAID') {
      throw new ConflictError('Only open tabs can receive extra items');
    }

    const newSubtotalMinor = moneyMinor(Number(current.subtotal).toFixed(2)) + addedSubtotalMinor;
    const discountMinor = Math.min(moneyMinor(Number(current.discount).toFixed(2)), newSubtotalMinor);
    const deliveryMinor = moneyMinor(Number(current.deliveryFee).toFixed(2));
    // Re-price the whole tab so inclusive and exclusive lines are taxed by
    // the same rules as checkout.
    const existingLines = await tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { lineTotal: true, taxInclusive: true },
    });
    const totals = computeOrderTax({
      lines: [
        ...existingLines.map((line) => ({
          amountMinor: moneyMinor(Number(line.lineTotal).toFixed(2)),
          taxInclusive: line.taxInclusive,
        })),
        ...taxLines(prepared),
      ],
      discountMinor,
      taxRate: Number(settings.taxRate),
      deliveryFeeMinor: deliveryMinor,
    });
    const taxMinor = totals.taxMinor;
    const totalMinor = totals.totalMinor;

    const claimed = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
      data: {
        subtotal: fromMinorUnits(newSubtotalMinor),
        discount: fromMinorUnits(discountMinor),
        tax: fromMinorUnits(taxMinor),
        taxIncluded: fromMinorUnits(totals.includedTaxMinor),
        total: fromMinorUnits(totalMinor),
        // New items must reach the kitchen even if the tab was already served.
        ...(current.status !== 'PENDING' ? { status: 'PENDING' as const, completedAt: null } : {}),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictError('This tab was settled or cancelled. Refresh and try again.');
    }

    for (const line of prepared) {
      await tx.orderItem.create({ data: { orderId: order.id, ...lineCreateData(line) } });
    }

    if (current.inventoryDeducted) {
      await consumeStock(tx, requisitions, current.branchId, order.id, actor.id, {
        allowNegative: settings.stockPolicy === 'WARN',
      });
    } else {
      // The tab is not paid yet, so stock is not touched; extend the snapshot
      // that will be committed when the tab is settled.
      const plan = requisitionsFromPlan(current.stockPlan);
      for (const [ingredientId, entry] of requisitions) {
        const existing = plan.get(ingredientId);
        if (existing) {
          existing.quantity += entry.quantity;
          existing.unitCost = entry.unitCost;
          existing.note = entry.note;
        } else {
          plan.set(ingredientId, { ...entry });
        }
      }
      await tx.order.update({
        where: { id: order.id },
        data: { stockPlan: planFromRequisitions(plan) as unknown as Prisma.InputJsonValue },
      });
    }

    await recordAudit(
      {
        action: 'order.items.added',
        entityType: 'Order',
        entityId: order.id,
        after: { items: prepared.length, total: fromMinorUnits(totalMinor) },
        userId: actor.id,
        terminalId: actor.terminalId ?? null,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  return toOrderDto(updated);
}

export async function settleOrder(
  orderId: string,
  input: OrderSettleInput,
  actor: Actor,
  context?: Partial<OrderContext>,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);
  if (order.status === 'CANCELLED') {
    throw new ConflictError('Cancelled orders cannot be settled');
  }
  if (order.paymentStatus !== 'UNPAID') {
    throw new ConflictError('This order has already been settled');
  }

  const totalMinor = moneyMinor(Number(order.total).toFixed(2));
  const plan = paymentPlan(input.payments, totalMinor);
  const terminalId = resolveTerminal(actor, context);
  const openShift = await findOpenShift(order.branchId, terminalId);
  const shiftId = openShift?.id ?? null;
  const invoiceNumber = `INV-${order.orderNumber.slice(4)}`;

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
      data: {
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        amountPaid: fromMinorUnits(plan.amountPaidMinor),
        changeDue: fromMinorUnits(plan.changeMinor),
        paymentMethod: plan.primaryMethod,
        completedAt: order.completedAt ?? new Date(),
        settledAt: new Date(),
        ...(shiftId ? { shiftId } : {}),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictError('This tab was just settled by someone else');
    }

    await tx.payment.createMany({
      data: plan.rows.map((row) => ({
        orderId: order.id,
        ...row,
        ...(shiftId ? { shiftId } : {}),
      })),
    });
    await tx.invoice.upsert({
      where: { orderId: order.id },
      update: {},
      create: { orderId: order.id, invoiceNumber, issuedAt: new Date() },
    });
    await commitOrderStock(tx, order.id);
    if (order.tableId) {
      await tx.diningTable.updateMany({
        where: { id: order.tableId },
        data: { status: 'NEEDS_CLEANING' },
      });
    }

    await recordAudit(
      {
        action: 'order.settled',
        entityType: 'Order',
        entityId: order.id,
        before: { paymentStatus: 'UNPAID' },
        after: {
          paymentStatus: 'PAID',
          total: fromMinorUnits(totalMinor),
          methods: plan.rows.map((row) => row.method),
        },
        userId: actor.id,
        terminalId,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  return toOrderDto(updated);
}

export async function refundOrder(
  orderId: string,
  input: OrderRefundInput,
  actor: Actor,
  context?: Partial<OrderContext>,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);
  if (order.status === 'CANCELLED') {
    throw new ConflictError('Cancelled orders are refunded through the cancellation flow');
  }

  const amountMinor = moneyMinor(input.amount);
  const terminalId = resolveTerminal(actor, context);
  const openShift = await findOpenShift(order.branchId, terminalId);
  const shiftId = openShift?.id ?? order.shiftId ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    // Serialize refunds for this order: without the lock two requests each see
    // the full remaining balance and both refund it, and a full refund restores
    // inventory twice.
    await lockOrderRow(tx, order.id);
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (current.status === 'CANCELLED') {
      throw new ConflictError('Cancelled orders are refunded through the cancellation flow');
    }

    const [payments, refunds] = await Promise.all([
      tx.payment.findMany({
        where: { orderId: order.id },
        select: { id: true, method: true, amount: true },
        orderBy: { createdAt: 'asc' },
      }),
      tx.refund.findMany({
        where: { orderId: order.id },
        select: { method: true, amount: true },
      }),
    ]);

    const paidMinor = payments.reduce(
      (sum, payment) => sum + moneyMinor(payment.amount.toString()),
      0,
    );
    const refundedMinor = refunds.reduce(
      (sum, refund) => sum + moneyMinor(refund.amount.toString()),
      0,
    );
    if (paidMinor <= 0) throw new ConflictError('This order has no captured payment to refund');
    const remainingMinor = paidMinor - refundedMinor;
    if (remainingMinor <= 0) throw new ConflictError('This order is already fully refunded');
    if (amountMinor > remainingMinor) {
      throw new ValidationError(
        `The refund exceeds the remaining balance of ${fromMinorUnits(remainingMinor)}`,
      );
    }

    const paidForMethod = payments
      .filter((payment) => payment.method === input.method)
      .reduce((sum, payment) => sum + moneyMinor(payment.amount.toString()), 0);
    const refundedForMethod = refunds
      .filter((refund) => refund.method === input.method)
      .reduce((sum, refund) => sum + moneyMinor(refund.amount.toString()), 0);
    if (amountMinor > paidForMethod - refundedForMethod) {
      throw new ValidationError(`The refund exceeds the amount paid with ${input.method}`);
    }

    const paymentId = payments.find((payment) => payment.method === input.method)?.id ?? null;
    await createRefundRecord(tx, {
      orderId: order.id,
      branchId: order.branchId,
      shiftId,
      line: { method: input.method, amountMinor, paymentId },
      reason: input.reason,
      actorId: actor.id,
    });

    const paymentStatus = derivePaymentStatus(paidMinor, refundedMinor + amountMinor);
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });

    // A full refund reverses the sale entirely, so the ingredients return to
    // stock once (guarded by inventoryRestored against duplicate refunds).
    if (
      refundedMinor + amountMinor >= paidMinor &&
      current.inventoryDeducted &&
      !current.inventoryRestored
    ) {
      const movements = await tx.inventoryMovement.findMany({
        where: { orderId: order.id, type: 'SALE_DEDUCTION' },
        select: { ingredientId: true, quantity: true, unitCost: true },
      });
      if (movements.length > 0) {
        await restoreOrderStock(
          tx,
          { id: order.id, orderNumber: order.orderNumber, branchId: order.branchId },
          movements,
          actor.id,
        );
      }
      await tx.order.update({
        where: { id: order.id },
        data: { inventoryRestored: true },
      });
    }

    await recordAudit(
      {
        action: 'order.refunded',
        entityType: 'Order',
        entityId: order.id,
        before: { paymentStatus: current.paymentStatus, refunded: fromMinorUnits(refundedMinor) },
        after: {
          paymentStatus,
          refunded: fromMinorUnits(refundedMinor + amountMinor),
          method: input.method,
          reason: input.reason,
        },
        userId: actor.id,
        terminalId,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  return toOrderDto(updated);
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  actor: Actor,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);

  if (nextStatus === 'cancelled') {
    throw new ConflictError('Use the cancellation endpoint to cancel an order');
  }
  const currentStatus = toApiStatus(order.status);
  if (currentStatus === nextStatus) {
    throw new ConflictError('The order is already in that status');
  }
  if (!canTransitionOrder(currentStatus, nextStatus)) {
    throw new ConflictError(`Cannot move an order from ${currentStatus} to ${nextStatus}`);
  }
  if (nextStatus === 'completed' && order.paymentStatus === 'UNPAID') {
    throw new ConflictError('Settle the open tab before completing it');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: toDbStatus(nextStatus),
        ...(nextStatus === 'completed' ? { completedAt: new Date() } : {}),
      },
    });
    if (result.count === 0) {
      throw new ConflictError(
        'The order changed while you were updating it. Refresh and try again.',
      );
    }
    if (nextStatus === 'completed') {
      const invoiceNumber = `INV-${order.orderNumber.slice(4)}`;
      await tx.invoice.upsert({
        where: { orderId: order.id },
        update: {},
        create: { orderId: order.id, invoiceNumber, issuedAt: new Date() },
      });
      if (order.tableId) {
        await tx.diningTable.updateMany({
          where: { id: order.tableId },
          data: { status: 'NEEDS_CLEANING' },
        });
      }
    }
    await recordAudit(
      {
        action: 'order.status.updated',
        entityType: 'Order',
        entityId: order.id,
        before: { status: currentStatus },
        after: { status: nextStatus },
        userId: actor.id,
        terminalId: actor.terminalId ?? null,
      },
      tx,
    );
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  return toOrderDto(updated);
}

export async function cancelOrder(
  orderId: string,
  reason: string,
  actor: Actor,
  context?: Partial<OrderContext>,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      inventoryMovements: { where: { type: 'SALE_DEDUCTION' } },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);

  const currentStatus = toApiStatus(order.status);
  if (currentStatus === 'cancelled') throw new ConflictError('This order is already cancelled');
  if (currentStatus === 'completed') {
    throw new ConflictError('Completed orders cannot be cancelled; issue a refund instead');
  }

  const terminalId = resolveTerminal(actor, context);
  const openShift = await findOpenShift(order.branchId, terminalId);
  const shiftId = openShift?.id ?? order.shiftId ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        status: order.status,
        inventoryRestored: false,
      },
      data: {
        status: 'CANCELLED',
        notes: [order.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n'),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictError('This order was already processed. Refresh and try again.');
    }

    if (order.inventoryDeducted) {
      await restoreOrderStock(
        tx,
        { id: order.id, orderNumber: order.orderNumber, branchId: order.branchId },
        order.inventoryMovements,
        actor.id,
      );
      await tx.order.update({ where: { id: order.id }, data: { inventoryRestored: true } });
    }

    const [payments, refunds] = await Promise.all([
      tx.payment.findMany({
        where: { orderId: order.id },
        select: { id: true, method: true, amount: true },
        orderBy: { createdAt: 'asc' },
      }),
      tx.refund.findMany({
        where: { orderId: order.id },
        select: { method: true, amount: true },
      }),
    ]);

    const paidMinor = payments.reduce(
      (sum, payment) => sum + moneyMinor(payment.amount.toString()),
      0,
    );
    const refundedMinor = refunds.reduce(
      (sum, refund) => sum + moneyMinor(refund.amount.toString()),
      0,
    );

    const paidByMethod = new Map<PaymentMethod, { amount: number; paymentId: string | null }>();
    for (const payment of payments) {
      const entry = paidByMethod.get(payment.method);
      const amount = moneyMinor(payment.amount.toString());
      if (entry) entry.amount += amount;
      else paidByMethod.set(payment.method, { amount, paymentId: payment.id });
    }
    for (const refund of refunds) {
      const entry = paidByMethod.get(refund.method);
      if (entry) entry.amount -= moneyMinor(refund.amount.toString());
    }

    let newlyRefundedMinor = 0;
    let refundLines = 0;
    for (const [method, entry] of paidByMethod.entries()) {
      if (entry.amount <= 0) continue;
      await createRefundRecord(tx, {
        orderId: order.id,
        branchId: order.branchId,
        shiftId,
        line: { method, amountMinor: entry.amount, paymentId: entry.paymentId },
        reason: `Cancellation: ${reason}`,
        actorId: actor.id,
      });
      newlyRefundedMinor += entry.amount;
      refundLines += 1;
    }

    const paymentStatus = derivePaymentStatus(paidMinor, refundedMinor + newlyRefundedMinor);
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });

    if (order.tableId) {
      await tx.diningTable.updateMany({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
    }

    await recordAudit(
      {
        action: 'order.cancelled',
        entityType: 'Order',
        entityId: order.id,
        before: { status: currentStatus, paymentStatus: order.paymentStatus },
        after: {
          status: 'cancelled',
          paymentStatus,
          reason,
          refunded: fromMinorUnits(newlyRefundedMinor),
          refunds: refundLines,
          stockRestored: order.inventoryDeducted,
        },
        userId: actor.id,
        terminalId,
      },
      tx,
    );

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });

  return toOrderDto(updated);
}

function assertCanAccess(
  order: { cashierId: string; branchId: string; channel: OrderChannel },
  actor: Actor,
): void {
  if (actor.role === 'CASHIER' && order.cashierId !== actor.id && order.channel !== 'ONLINE') {
    throw new ForbiddenError('You can only access your own orders');
  }
  if (actor.role !== 'ADMIN' && actor.branchId && order.branchId !== actor.branchId) {
    throw new ForbiddenError('This order belongs to another branch');
  }
}

export async function listOrders(
  query: OrderQuery,
  actor: Actor,
): Promise<ReturnType<typeof buildPaginated>> {
  const conditions: Prisma.OrderWhereInput[] = [];

  if (actor.role === 'ADMIN') {
    if (query.branchId) conditions.push({ branchId: query.branchId });
  } else {
    conditions.push({ branchId: actor.branchId ?? DEFAULT_BRANCH_ID });
    if (actor.role === 'CASHIER') {
      // Storefront orders belong to the branch, not to an individual cashier.
      conditions.push(
        query.channel === 'POS'
          ? { cashierId: actor.id }
          : { OR: [{ cashierId: actor.id }, { channel: 'ONLINE' }] },
      );
    }
  }

  if (query.status) conditions.push({ status: toDbStatus(query.status) });
  if (query.type) conditions.push({ type: query.type });
  if (query.channel) conditions.push({ channel: query.channel });
  if (query.cashierId && actor.role === 'ADMIN') conditions.push({ cashierId: query.cashierId });
  if (query.tableId) conditions.push({ tableId: query.tableId });
  if (query.q) {
    conditions.push({
      OR: [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
        { customerPhone: { contains: query.q, mode: 'insensitive' } },
        { externalRef: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.openTabs) {
    conditions.push({ paymentStatus: 'UNPAID' });
    conditions.push({ status: { not: 'CANCELLED' } });
  }

  if (query.today) {
    const today = todayInBusinessTimezone();
    conditions.push({ createdAt: { gte: businessDayStart(today) } });
  } else if (query.from || query.to) {
    conditions.push({
      createdAt: {
        ...(query.from ? { gte: businessDayStart(query.from) } : {}),
        ...(query.to ? { lt: new Date(businessDayStart(query.to).getTime() + 86_400_000) } : {}),
      },
    });
  }

  const where: Prisma.OrderWhereInput = { AND: conditions };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return buildPaginated(rows.map(toOrderDto), total, query.page, query.pageSize);
}

export async function getOrder(
  orderId: string,
  actor: Actor,
): Promise<ReturnType<typeof toOrderDto>> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new NotFoundError('Order not found');
  assertCanAccess(order, actor);
  return toOrderDto(order);
}

/** Helper for invoice listings: filters invoices by number / order number / customer. */
export function invoiceWhere(query: {
  q?: string;
  from?: string;
  to?: string;
}): Prisma.InvoiceWhereInput {
  return {
    ...(query.q
      ? {
          OR: [
            { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
            { order: { orderNumber: { contains: query.q, mode: 'insensitive' } } },
            { order: { customerName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          issuedAt: {
            ...(query.from ? { gte: businessDayStart(query.from) } : {}),
            ...(query.to
              ? { lt: new Date(businessDayStart(query.to).getTime() + 86_400_000) }
              : {}),
          },
        }
      : {}),
  };
}

export type { PaymentMethod };
