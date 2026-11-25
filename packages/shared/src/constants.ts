/** Domain enumerations and labels shared by the API and the desktop client. */

export const BRAND = {
  name: 'Corner',
  fullName: 'Corner Pizza',
  tagline: 'Fresh from the oven, made to be shared.',
} as const;

export const ORDER_TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Dine-in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

/** Where the order was captured. `ONLINE` orders come from the storefront API. */
/** POS = walk-in/phone at the till, ONLINE = our website, TALABAT = keyed in from the Talabat tablet/portal. */
export const ORDER_CHANNELS = ['POS', 'ONLINE', 'TALABAT'] as const;
/** Channels a staff member may choose when ringing up an order. */
export const STAFF_ORDER_CHANNELS = ['POS', 'TALABAT'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  POS: 'In-store',
  ONLINE: 'Online',
  TALABAT: 'Talabat',
};

/** API-facing order statuses are lowercase (e.g. `preparing`). */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'New',
  confirmed: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Customer-facing prep timeline shown on the staff order detail sheet. */
export const ORDER_PROGRESS_STEPS = [
  { status: 'pending', label: 'Order received' },
  { status: 'confirmed', label: 'Order accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'completed', label: 'Completed' },
] as const satisfies readonly { status: OrderStatus; label: string }[];

/** Legal status transitions. Terminal states allow no further changes. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'preparing'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

/** Only the dedicated cancellation endpoint may move an order to `cancelled`. */
export const CANCELLABLE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready'] as const;
export type CancellableOrderStatus = (typeof CANCELLABLE_ORDER_STATUSES)[number];

export function isCancellableOrderStatus(status: OrderStatus): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses the kitchen can move an order into (never cancel or rewind). */
export const KITCHEN_ORDER_STATUSES = ['confirmed', 'preparing', 'ready', 'completed'] as const;
export type KitchenStatus = (typeof KITCHEN_ORDER_STATUSES)[number];

/**
 * The kitchen follows a strict linear workflow; it cannot skip preparation
 * steps or cancel an order. Administrator and cashier flows keep the more
 * permissive matrix above.
 */
export const KITCHEN_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransitionKitchenOrder(from: OrderStatus, to: OrderStatus): boolean {
  return KITCHEN_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  WALLET: 'Mobile wallet',
};

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'PENDING_PAYMENT',
  'PAID_ONLINE',
  'PAYMENT_FAILED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Open tab',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
  PENDING_PAYMENT: 'Awaiting payment',
  PAID_ONLINE: 'Paid online',
  PAYMENT_FAILED: 'Payment failed',
};

/** Online gateway intents are tracked separately from the POS payment ledger. */
export const ONLINE_PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type OnlinePaymentStatus = (typeof ONLINE_PAYMENT_STATUSES)[number];

/** How an online customer pays: cash at the door or card through the gateway. */
export const ONLINE_PAYMENT_METHODS = ['CASH', 'CARD'] as const;
export type OnlinePaymentMethod = (typeof ONLINE_PAYMENT_METHODS)[number];

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const CASH_MOVEMENT_TYPES = ['CASH_IN', 'CASH_OUT'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CASH_MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  CASH_IN: 'Cash in',
  CASH_OUT: 'Cash out',
};

export const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  NEEDS_CLEANING: 'Needs cleaning',
};

export const DELIVERY_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: 'Unassigned',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export const SETTLEMENT_STATUSES = ['OPEN', 'SETTLED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const STOCKTAKE_STATUSES = ['DRAFT', 'COMPLETED', 'CANCELLED'] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export const TRANSFER_STATUSES = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const STOCK_ALERT_TYPES = ['LOW', 'OUT'] as const;
export type StockAlertType = (typeof STOCK_ALERT_TYPES)[number];

export const STOCK_ALERT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type StockAlertStatus = (typeof STOCK_ALERT_STATUSES)[number];

export const STOCK_POLICIES = ['BLOCK', 'WARN'] as const;
export type StockPolicy = (typeof STOCK_POLICIES)[number];

/** Seed/migration id of the original shop; new installs start here. */
export const DEFAULT_BRANCH_ID = 'branch-main';

export const MENU_KINDS = [
  'PIZZA',
  'SIDE',
  'APPETIZER',
  'DESSERT',
  'DRINK',
  'SAUCE',
] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

export const MENU_KIND_LABELS: Record<MenuKind, string> = {
  PIZZA: 'Pizza',
  SIDE: 'Side',
  APPETIZER: 'Appetizer',
  DESSERT: 'Dessert',
  DRINK: 'Drink',
  SAUCE: 'Sauce',
};

export const INGREDIENT_UNITS = ['KG', 'G', 'L', 'ML', 'PIECE', 'PACK'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const INGREDIENT_UNIT_LABELS: Record<IngredientUnit, string> = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'ml',
  PIECE: 'pcs',
  PACK: 'pack',
};

export const INVENTORY_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE_DEDUCTION',
  'ADJUSTMENT',
  'WASTE',
  'RETURN',
  'CANCELLATION_RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'STOCKTAKE',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  PURCHASE: 'Purchase / restock',
  SALE_DEDUCTION: 'Order deduction',
  ADJUSTMENT: 'Stock adjustment',
  WASTE: 'Waste',
  RETURN: 'Supplier return',
  CANCELLATION_RETURN: 'Order cancellation',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  STOCKTAKE: 'Stocktake adjustment',
};

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Restaurant defaults. The live values live in RestaurantSettings. */
export const BUSINESS_DEFAULTS = {
  timezone: 'Africa/Cairo',
  locale: 'en-EG',
  currency: 'EGP',
  taxRate: '14.00',
  deliveryFee: '25.00',
  maxCashierDiscountPct: '20.00',
  onlineOpenTime: '10:00',
  onlineCloseTime: '23:30',
} as const;

/** Public storefront paths, shared so docs and the desktop can link to them. */
export const PUBLIC_API_PREFIX = '/api/public';

// ---------------------------------------------------------------------------
// HR & payroll
// ---------------------------------------------------------------------------

export const EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const SALARY_TYPES = ['MONTHLY', 'DAILY'] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'DAY_OFF'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ADJUSTMENT_CATEGORIES = [
  'LATE_ARRIVAL',
  'ABSENCE',
  'OTHER_DEDUCTION',
  'PERFORMANCE_BONUS',
  'OVERTIME',
  'OTHER_BONUS',
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];

export const ADJUSTMENT_CATEGORY_LABELS: Record<AdjustmentCategory, string> = {
  LATE_ARRIVAL: 'Late arrival deduction',
  ABSENCE: 'Absence deduction',
  OTHER_DEDUCTION: 'Other deduction',
  PERFORMANCE_BONUS: 'Performance bonus',
  OVERTIME: 'Overtime',
  OTHER_BONUS: 'Other bonus',
};

export const DEDUCTION_CATEGORIES: readonly AdjustmentCategory[] = [
  'LATE_ARRIVAL',
  'ABSENCE',
  'OTHER_DEDUCTION',
];

export const BONUS_CATEGORIES: readonly AdjustmentCategory[] = [
  'PERFORMANCE_BONUS',
  'OVERTIME',
  'OTHER_BONUS',
];

export function isDeductionCategory(category: AdjustmentCategory): boolean {
  return DEDUCTION_CATEGORIES.includes(category);
}

export const PAYROLL_STATUSES = ['DRAFT', 'CLOSED'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_PAYMENT_STATUSES = ['UNPAID', 'PAID'] as const;
export type PayrollPaymentStatus = (typeof PAYROLL_PAYMENT_STATUSES)[number];

/** `YYYY-MM` payroll period keys. */
export const payrollMonthSchemaPattern = /^\d{4}-(0[1-9]|1[0-2])$/u;

export const HR_DEFAULTS = {
  workStart: '09:00',
  workEnd: '17:00',
  graceMinutes: 10,
  lateDeductionPerMinute: '5.00',
  absenceDeductionMultiplier: '1.00',
  /** 0 = Sunday … 6 = Saturday. Egyptian weekend by default. */
  weeklyDaysOff: [5, 6],
} as const;

// ---------------------------------------------------------------------------
// Operating expenses
// ---------------------------------------------------------------------------

/** Salaries are deducted from paid payroll, so they are deliberately absent. */
export const EXPENSE_CATEGORIES = [
  'RENT',
  'UTILITIES',
  'MAINTENANCE',
  'SUPPLIES',
  'MARKETING',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Rent',
  UTILITIES: 'Electricity & water',
  MAINTENANCE: 'Maintenance',
  SUPPLIES: 'Supplies',
  MARKETING: 'Marketing',
  OTHER: 'Other',
};

export const EXPENSE_CATEGORY_LABELS_AR: Record<ExpenseCategory, string> = {
  RENT: 'إيجار',
  UTILITIES: 'كهرباء ومياه',
  MAINTENANCE: 'صيانة',
  SUPPLIES: 'مستلزمات',
  MARKETING: 'تسويق',
  OTHER: 'أخرى',
};
