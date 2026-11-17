import type { Prisma, RestaurantSettings, User } from '@prisma/client';
import {
  pickLocalized,
  pickLocalizedNullable,
  type CategoryDto,
  type CustomerDto,
  type DiscountDto,
  type IngredientDto,
  type InventoryMovementDto,
  type KitchenOrderDto,
  type MenuItemDto,
  type OrderDto,
  type OrderStatus,
  type RecipeDto,
  type SettingsDto,
  type SupplierDto,
  type ToppingDto,
  type UserDto,
} from '@posshope/shared';
import { currentLanguage } from './request-language.js';

export const menuItemInclude = {
  category: true,
  sizes: { orderBy: { sortOrder: 'asc' } },
  recipes: {
    where: { isActive: true },
    include: {
      size: true,
      items: { include: { ingredient: true } },
    },
    orderBy: [{ version: 'desc' }],
  },
} satisfies Prisma.MenuItemInclude;

export const orderInclude = {
  cashier: { select: { id: true, fullName: true } },
  branch: { select: { name: true } },
  table: { select: { id: true, name: true } },
  deliveryDriver: { select: { id: true, fullName: true } },
  deliveryZone: { select: { id: true, name: true } },
  items: {
    include: { toppings: true, menuItem: { select: { prepMinutes: true } } },
    orderBy: { createdAt: 'asc' },
  },
  payments: { orderBy: { createdAt: 'asc' } },
  refunds: {
    include: { actor: { select: { fullName: true } }, creditNote: true },
    orderBy: { createdAt: 'asc' },
  },
  creditNotes: { orderBy: { issuedAt: 'asc' } },
  invoice: true,
} satisfies Prisma.OrderInclude;

/**
 * Kitchen tickets only need what the line cooks must prepare. Prices, payments
 * and customer contact details are intentionally left out of the query.
 */
export const kitchenOrderInclude = {
  items: {
    select: {
      id: true,
      menuItemName: true,
      menuItemNameAr: true,
      quantity: true,
      sizeName: true,
      sizeNameAr: true,
      specialInstructions: true,
      toppings: { select: { name: true, nameAr: true } },
      menuItem: { select: { prepMinutes: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.OrderInclude;

type MenuItemRow = Prisma.MenuItemGetPayload<{ include: typeof menuItemInclude }>;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type KitchenOrderRow = Prisma.OrderGetPayload<{ include: typeof kitchenOrderInclude }>;

type CustomerRow = Prisma.CustomerGetPayload<object> & {
  ordersCount?: number;
  totalSpent?: string;
  lastOrderAt?: Date | null;
};

function money(value: Prisma.Decimal | number | string): string {
  return Number(value).toFixed(2);
}

export function toApiStatus(status: string): OrderStatus {
  return status.toLowerCase() as OrderStatus;
}

export function toDbStatus(
  status: OrderStatus,
): 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED' {
  return status.toUpperCase() as
    'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
}

export function toUserDto(user: User & { branch?: { name: string } | null }): UserDto {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toCategoryDto(
  category: Prisma.CategoryGetPayload<{ include: { _count: { select: { items: true } } } }>,
): CategoryDto {
  const language = currentLanguage();
  return {
    id: category.id,
    name: pickLocalized(language, category.name, category.nameAr),
    nameEn: category.name,
    nameAr: category.nameAr,
    description: pickLocalizedNullable(language, category.description, category.descriptionAr),
    descriptionEn: category.description,
    descriptionAr: category.descriptionAr,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    itemCount: category._count.items,
  };
}

type RecipeRow = MenuItemRow['recipes'][number];

export function toRecipeDto(recipe: RecipeRow): RecipeDto {
  const language = currentLanguage();
  return {
    id: recipe.id,
    menuItemId: recipe.menuItemId,
    sizeId: recipe.sizeId,
    sizeName: recipe.size
      ? pickLocalized(language, recipe.size.name, recipe.size.nameAr)
      : null,
    version: recipe.version,
    isActive: recipe.isActive,
    effectiveFrom: recipe.effectiveFrom.toISOString(),
    effectiveTo: recipe.effectiveTo?.toISOString() ?? null,
    costPerUnit: Number(recipe.costPerUnit).toFixed(2),
    notes: recipe.notes,
    items: recipe.items.map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientName: pickLocalized(language, line.ingredient.name, line.ingredient.nameAr),
      unit: line.ingredient.unit,
      quantity: Number(line.quantity),
      costPerUnit: Number(line.ingredient.averageCost).toFixed(2),
    })),
  };
}

function baseRecipe(item: MenuItemRow): RecipeRow | undefined {
  return (
    item.recipes.find((recipe) => recipe.sizeId === null) ?? item.recipes[0] ?? undefined
  );
}

export function toMenuItemDto(
  item: MenuItemRow,
  includeCost = true,
  stockByIngredient?: Map<string, number>,
): MenuItemDto {
  const language = currentLanguage();
  const recipe = baseRecipe(item);
  const shortage =
    stockByIngredient && recipe
      ? recipe.items.find((line) => {
          const available = stockByIngredient.get(line.ingredientId) ?? 0;
          return available + 1e-9 < Number(line.quantity);
        })
      : undefined;
  const soldOutReason = !item.isAvailable
    ? language === 'ar'
      ? 'غير متوفر حاليًا'
      : 'Marked sold out'
    : shortage
      ? language === 'ar'
        ? `نفد المخزون: ${shortage.ingredient.nameAr ?? shortage.ingredient.name}`
        : `Out of stock: ${shortage.ingredient.name}`
      : null;
  return {
    id: item.id,
    sku: item.sku,
    name: pickLocalized(language, item.name, item.nameAr),
    nameEn: item.name,
    nameAr: item.nameAr,
    description: pickLocalizedNullable(language, item.description, item.descriptionAr),
    descriptionEn: item.description,
    descriptionAr: item.descriptionAr,
    imageUrl: item.imageUrl,
    categoryId: item.categoryId,
    categoryName: item.category
      ? pickLocalized(language, item.category.name, item.category.nameAr)
      : null,
    categoryNameEn: item.category?.name ?? null,
    categoryNameAr: item.category?.nameAr ?? null,
    kind: item.kind,
    basePrice: money(item.basePrice),
    costPrice: includeCost ? money(item.costPrice) : '0.00',
    prepMinutes: item.prepMinutes,
    isAvailable: item.isAvailable,
    isSoldOut: soldOutReason !== null,
    soldOutReason,
    isFeatured: item.isFeatured,
    hasSizes: item.hasSizes,
    sizes: item.sizes.map((size) => ({
      id: size.id,
      name: pickLocalized(language, size.name, size.nameAr),
      nameEn: size.name,
      nameAr: size.nameAr,
      price: money(size.price),
      ingredientMultiplier: Number(size.ingredientMultiplier),
      isDefault: size.isDefault,
      sortOrder: size.sortOrder,
    })),
    recipe: includeCost && recipe ? toRecipeDto(recipe) : null,
    recipes: includeCost ? item.recipes.map(toRecipeDto) : [],
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toToppingDto(topping: Prisma.ToppingGetPayload<object>): ToppingDto {
  const language = currentLanguage();
  return {
    id: topping.id,
    name: pickLocalized(language, topping.name, topping.nameAr),
    nameEn: topping.name,
    nameAr: topping.nameAr,
    price: money(topping.price),
    ingredientId: topping.ingredientId,
    ingredientQuantity: Number(topping.ingredientQuantity),
    isAvailable: topping.isAvailable,
    sortOrder: topping.sortOrder,
  };
}

export function toDiscountDto(discount: Prisma.DiscountGetPayload<object>): DiscountDto {
  const language = currentLanguage();
  return {
    id: discount.id,
    name: pickLocalized(language, discount.name, discount.nameAr),
    nameEn: discount.name,
    nameAr: discount.nameAr,
    type: discount.type,
    value: money(discount.value),
    isActive: discount.isActive,
    createdAt: discount.createdAt.toISOString(),
  };
}

export function toSupplierDto(supplier: Prisma.SupplierGetPayload<object>): SupplierDto {
  const language = currentLanguage();
  return {
    id: supplier.id,
    name: pickLocalized(language, supplier.name, supplier.nameAr),
    nameEn: supplier.name,
    nameAr: supplier.nameAr,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
  };
}

type IngredientRow = Prisma.IngredientGetPayload<{
  include: { supplier: true; category: true };
}>;

export interface IngredientStockLevel {
  currentStock: Prisma.Decimal | number | string;
  minStock: Prisma.Decimal | number | string;
  reorderPoint: Prisma.Decimal | number | string;
  maxStock?: Prisma.Decimal | number | string;
}

export function toIngredientDto(
  ingredient: IngredientRow,
  stock?: IngredientStockLevel | null,
): IngredientDto {
  const current = Number(stock?.currentStock ?? 0);
  const min = Number(stock?.minStock ?? 0);
  const reorder = Number(stock?.reorderPoint ?? 0);
  const max = Number(stock?.maxStock ?? 0);
  const cost = Number(ingredient.costPerUnit);
  const averageCost = Number(ingredient.averageCost);
  const language = currentLanguage();
  return {
    id: ingredient.id,
    sku: ingredient.sku,
    name: pickLocalized(language, ingredient.name, ingredient.nameAr),
    nameEn: ingredient.name,
    nameAr: ingredient.nameAr,
    unit: ingredient.unit,
    categoryId: ingredient.categoryId,
    categoryName: ingredient.category
      ? pickLocalized(language, ingredient.category.name, ingredient.category.nameAr)
      : null,
    storageLocation: ingredient.storageLocation,
    expiryDate: ingredient.expiryDate?.toISOString().slice(0, 10) ?? null,
    currentStock: current,
    minStock: min,
    reorderPoint: reorder,
    maxStock: max,
    costPerUnit: money(ingredient.costPerUnit),
    averageCost: averageCost.toFixed(2),
    stockValue: (current * (averageCost || cost)).toFixed(2),
    supplierId: ingredient.supplierId,
    supplierName: ingredient.supplier
      ? pickLocalized(language, ingredient.supplier.name, ingredient.supplier.nameAr)
      : null,
    isActive: ingredient.isActive,
    isLowStock: current <= min,
    isBelowReorderPoint: reorder > 0 && current <= reorder,
    updatedAt: ingredient.updatedAt.toISOString(),
  };
}

type MovementRow = Prisma.InventoryMovementGetPayload<{
  include: { ingredient: true; user: { select: { fullName: true } } };
}>;

export function toMovementDto(movement: MovementRow): InventoryMovementDto {
  const language = currentLanguage();
  return {
    id: movement.id,
    ingredientId: movement.ingredientId,
    ingredientName: pickLocalized(language, movement.ingredient.name, movement.ingredient.nameAr),
    unit: movement.ingredient.unit,
    type: movement.type,
    quantity: Number(movement.quantity),
    unitCost: movement.unitCost === null ? null : money(movement.unitCost),
    reference: movement.reference,
    note: movement.note,
    orderId: movement.orderId,
    userName: movement.user?.fullName ?? null,
    createdAt: movement.createdAt.toISOString(),
  };
}

export function toCustomerDto(customer: CustomerRow): CustomerDto {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    ordersCount: customer.ordersCount ?? 0,
    totalSpent: customer.totalSpent ?? '0.00',
    lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
  };
}

export function toOrderDto(order: OrderRow): OrderDto {
  const language = currentLanguage();
  const refundedTotal = order.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    channel: order.channel,
    status: toApiStatus(order.status),
    branchId: order.branchId,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    customerLat: order.customerLat,
    customerLng: order.customerLng,
    deliveryZoneId: order.deliveryZoneId,
    deliveryZoneName: order.deliveryZone?.name ?? null,
    tableId: order.tableId,
    tableNumber: order.table?.name ?? order.tableNumber,
    cashierId: order.cashierId,
    cashierName: order.cashier.fullName,
    shiftId: order.shiftId,
    deliveryDriverId: order.deliveryDriverId,
    deliveryDriverName: order.deliveryDriver?.fullName ?? null,
    deliveryStatus: order.deliveryStatus,
    subtotal: money(order.subtotal),
    discount: money(order.discount),
    discountLabel: pickLocalizedNullable(language, order.discountLabel, order.discountLabelAr),
    discountLabelEn: order.discountLabel,
    discountLabelAr: order.discountLabelAr,
    tax: money(order.tax),
    deliveryFee: money(order.deliveryFee),
    total: money(order.total),
    amountPaid: money(order.amountPaid),
    changeDue: money(order.changeDue),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    isCod: order.isCod,
    refundedTotal: refundedTotal.toFixed(2),
    notes: order.notes,
    items: order.items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: pickLocalized(language, item.menuItemName, item.menuItemNameAr),
      nameEn: item.menuItemName,
      nameAr: item.menuItemNameAr,
      imageUrl: item.imageUrl,
      sizeId: item.sizeId,
      sizeName: pickLocalizedNullable(language, item.sizeName, item.sizeNameAr),
      sizeNameEn: item.sizeName,
      sizeNameAr: item.sizeNameAr,
      quantity: item.quantity,
      prepMinutes: item.menuItem.prepMinutes,
      unitPrice: money(item.unitPrice),
      toppingsTotal: money(item.toppingsTotal),
      lineTotal: money(item.lineTotal),
      unitCost: money(item.unitCost),
      specialInstructions: item.specialInstructions,
      toppings: item.toppings.map((topping) => ({
        id: topping.id,
        toppingId: topping.toppingId,
        name: pickLocalized(language, topping.name, topping.nameAr),
        nameEn: topping.name,
        nameAr: topping.nameAr,
        price: money(topping.price),
      })),
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: money(payment.amount),
      reference: payment.reference,
      shiftId: payment.shiftId,
      createdAt: payment.createdAt.toISOString(),
    })),
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      refundNumber: refund.refundNumber,
      orderId: refund.orderId,
      method: refund.method,
      amount: money(refund.amount),
      reason: refund.reason,
      actorId: refund.actorId,
      actorName: refund.actor.fullName,
      shiftId: refund.shiftId,
      creditNote: refund.creditNote
        ? {
            id: refund.creditNote.id,
            creditNoteNumber: refund.creditNote.creditNoteNumber,
            orderId: refund.creditNote.orderId,
            refundId: refund.creditNote.refundId,
            amount: money(refund.creditNote.amount),
            reason: refund.creditNote.reason,
            issuedAt: refund.creditNote.issuedAt.toISOString(),
          }
        : null,
      createdAt: refund.createdAt.toISOString(),
    })),
    creditNotes: order.creditNotes.map((note) => ({
      id: note.id,
      creditNoteNumber: note.creditNoteNumber,
      orderId: note.orderId,
      refundId: note.refundId,
      amount: money(note.amount),
      reason: note.reason,
      issuedAt: note.issuedAt.toISOString(),
    })),
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          invoiceNumber: order.invoice.invoiceNumber,
          orderId: order.invoice.orderId,
          issuedAt: order.invoice.issuedAt.toISOString(),
        }
      : null,
    inventoryDeducted: order.inventoryDeducted,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    settledAt: order.settledAt?.toISOString() ?? null,
  };
}

export function toKitchenOrderDto(order: KitchenOrderRow): KitchenOrderDto {
  const language = currentLanguage();
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    channel: order.channel,
    status: toApiStatus(order.status),
    tableNumber: order.tableNumber,
    notes: order.notes,
    items: order.items.map((item) => ({
      id: item.id,
      name: pickLocalized(language, item.menuItemName, item.menuItemNameAr),
      quantity: item.quantity,
      sizeName: pickLocalizedNullable(language, item.sizeName, item.sizeNameAr),
      toppings: item.toppings.map((topping) =>
        pickLocalized(language, topping.name, topping.nameAr),
      ),
      specialInstructions: item.specialInstructions,
      prepMinutes: item.menuItem.prepMinutes,
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
  };
}

export function toSettingsDto(settings: RestaurantSettings): SettingsDto {
  const language = currentLanguage();
  return {
    name: pickLocalized(language, settings.name, settings.nameAr),
    nameEn: settings.name,
    nameAr: settings.nameAr,
    tagline: pickLocalizedNullable(language, settings.tagline, settings.taglineAr),
    taglineEn: settings.tagline,
    taglineAr: settings.taglineAr,
    address: pickLocalizedNullable(language, settings.address, settings.addressAr),
    addressEn: settings.address,
    addressAr: settings.addressAr,
    phone: settings.phone,
    email: settings.email,
    taxRate: money(settings.taxRate),
    deliveryFee: money(settings.deliveryFee),
    maxCashierDiscountPct: money(settings.maxCashierDiscountPct),
    receiptFooter: pickLocalizedNullable(
      language,
      settings.receiptFooter,
      settings.receiptFooterAr,
    ),
    receiptFooterEn: settings.receiptFooter,
    receiptFooterAr: settings.receiptFooterAr,
    currency: settings.currency,
    stockPolicy: settings.stockPolicy,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
