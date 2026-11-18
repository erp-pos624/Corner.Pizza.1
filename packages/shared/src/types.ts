/** DTOs returned by the API and consumed by the desktop client. */
import type {
  AdjustmentCategory,
  AttendanceStatus,
  CashMovementType,
  DeliveryStatus,
  DiscountType,
  EmploymentStatus,
  ExpenseCategory,
  IngredientUnit,
  InventoryMovementType,
  MenuKind,
  OnlinePaymentMethod,
  OnlinePaymentStatus,
  OrderChannel,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PayrollPaymentStatus,
  PayrollStatus,
  PurchaseOrderStatus,
  SalaryType,
  ShiftStatus,
  StockAlertStatus,
  StockAlertType,
  StockPolicy,
  StocktakeStatus,
  TableStatus,
  TransferStatus,
} from './constants.js';
import type { Role } from './permissions.js';
import type { Paginated } from './schemas/common.js';

export type { Paginated };

export interface AuthUserDto {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  branchId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface UserDto extends AuthUserDto {
  email: string | null;
  branchName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDto {
  id: string;
  /** Localized display value for the language the request asked for. */
  name: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface MenuItemSizeDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  price: string;
  ingredientMultiplier: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface RecipeItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
  costPerUnit: string;
}

export interface RecipeDto {
  id: string;
  menuItemId: string;
  sizeId: string | null;
  sizeName: string | null;
  version: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Ingredient cost of one portion for this recipe. */
  costPerUnit: string;
  notes: string | null;
  items: RecipeItemDto[];
}

export interface MenuItemDto {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string | null;
  categoryNameEn: string | null;
  categoryNameAr: string | null;
  kind: MenuKind;
  basePrice: string;
  costPrice: string;
  prepMinutes: number;
  isAvailable: boolean;
  /** Derived from recipe stock for the selected branch. */
  isSoldOut: boolean;
  soldOutReason: string | null;
  isFeatured: boolean;
  hasSizes: boolean;
  sizes: MenuItemSizeDto[];
  /** Base recipe (sizeId null), kept for the existing editor. */
  recipe: RecipeDto | null;
  /** Every active recipe: base plus per-size overrides. */
  recipes: RecipeDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ToppingDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  price: string;
  ingredientId: string | null;
  ingredientQuantity: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface DiscountDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  type: DiscountType;
  value: string;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  expenseDate: string;
  branchId: string | null;
  branchName: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummaryDto {
  total: string;
  count: number;
  byCategory: Array<{ category: ExpenseCategory; amount: string; count: number }>;
}

export interface IngredientCategoryDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  sortOrder: number;
  isActive: boolean;
  ingredientCount: number;
}

export interface IngredientDto {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  unit: IngredientUnit;
  categoryId: string | null;
  categoryName: string | null;
  storageLocation: string | null;
  expiryDate: string | null;
  currentStock: number;
  minStock: number;
  reorderPoint: number;
  maxStock: number;
  /** Latest purchase price. */
  costPerUnit: string;
  /** Moving weighted average cost used for recipe costing. */
  averageCost: string;
  stockValue: string;
  supplierId: string | null;
  supplierName: string | null;
  isActive: boolean;
  isLowStock: boolean;
  isBelowReorderPoint: boolean;
  updatedAt: string;
}

export interface InventoryMovementDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  type: InventoryMovementType;
  quantity: number;
  unitCost: string | null;
  reference: string | null;
  note: string | null;
  orderId: string | null;
  userName: string | null;
  createdAt: string;
}

export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  ordersCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface OrderItemToppingDto {
  id: string;
  toppingId: string | null;
  name: string;
  nameEn: string;
  nameAr: string | null;
  price: string;
}

export interface OrderItemDto {
  id: string;
  menuItemId: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  imageUrl: string | null;
  sizeId: string | null;
  sizeName: string | null;
  sizeNameEn: string | null;
  sizeNameAr: string | null;
  quantity: number;
  prepMinutes: number;
  unitPrice: string;
  toppingsTotal: string;
  lineTotal: string;
  unitCost: string;
  specialInstructions: string | null;
  toppings: OrderItemToppingDto[];
}

export interface PaymentDto {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  shiftId: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  orderId: string;
  issuedAt: string;
}

export interface RefundDto {
  id: string;
  refundNumber: string;
  orderId: string;
  method: PaymentMethod;
  amount: string;
  reason: string;
  actorId: string;
  actorName: string;
  shiftId: string | null;
  creditNote: CreditNoteDto | null;
  createdAt: string;
}

export interface CreditNoteDto {
  id: string;
  creditNoteNumber: string;
  orderId: string;
  refundId: string;
  amount: string;
  reason: string;
  issuedAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  type: OrderType;
  channel: OrderChannel;
  status: OrderStatus;
  branchId: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  tableId: string | null;
  tableNumber: string | null;
  cashierId: string;
  cashierName: string;
  shiftId: string | null;
  deliveryDriverId: string | null;
  deliveryDriverName: string | null;
  deliveryStatus: DeliveryStatus | null;
  subtotal: string;
  discount: string;
  discountLabel: string | null;
  discountLabelEn: string | null;
  discountLabelAr: string | null;
  tax: string;
  deliveryFee: string;
  total: string;
  amountPaid: string;
  changeDue: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  isCod: boolean;
  refundedTotal: string;
  notes: string | null;
  items: OrderItemDto[];
  payments: PaymentDto[];
  refunds: RefundDto[];
  creditNotes: CreditNoteDto[];
  invoice: InvoiceDto | null;
  inventoryDeducted: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  settledAt: string | null;
}

export interface KitchenOrderItemDto {
  id: string;
  name: string;
  quantity: number;
  sizeName: string | null;
  toppings: string[];
  specialInstructions: string | null;
  prepMinutes: number;
}

/** Deliberately excludes prices, payments and customer contact details. */
export interface KitchenOrderDto {
  id: string;
  orderNumber: string;
  type: OrderType;
  channel: OrderChannel;
  status: OrderStatus;
  tableNumber: string | null;
  notes: string | null;
  items: KitchenOrderItemDto[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface KitchenQueueDto {
  generatedAt: string;
  orders: KitchenOrderDto[];
}

export interface SettingsDto {
  name: string;
  nameEn: string;
  nameAr: string | null;
  tagline: string | null;
  taglineEn: string | null;
  taglineAr: string | null;
  address: string | null;
  addressEn: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
  taxRate: string;
  deliveryFee: string;
  maxCashierDiscountPct: string;
  receiptFooter: string | null;
  receiptFooterEn: string | null;
  receiptFooterAr: string | null;
  currency: string;
  /** BLOCK prevents selling below zero stock; WARN allows it but raises alerts. */
  stockPolicy: StockPolicy;

  updatedAt: string;
}

export interface DashboardOverview {
  todayRevenue: string;
  todayOrders: number;
  averageOrderValue: string;
  totalProducts: number;
  activeProducts: number;
  totalCustomers: number;
  pendingOrders: number;
  lowStockIngredients: number;
  todayProfit: string;
  revenueChangePct: number | null;
  onlineRevenue: string;
  onlineOrders: number;
}

export interface RevenuePoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
}

export interface CategorySalesRow {
  categoryId: string;
  name: string;
  revenue: string;
  units: number;
  orders: number;
}

export interface BestSellerRow {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  units: number;
  revenue: string;
}

export interface PaymentDistributionRow {
  method: PaymentMethod;
  amount: string;
  count: number;
  percent: number;
}

export interface LowStockRow {
  id: string;
  name: string;
  unit: IngredientUnit;
  currentStock: number;
  minStock: number;
}

export interface DashboardDto {
  generatedAt: string;
  rangeDays: number;
  overview: DashboardOverview;
  revenueSeries: RevenuePoint[];
  salesByCategory: CategorySalesRow[];
  salesByChannel: ReportRow[];
  bestSellers: BestSellerRow[];
  paymentDistribution: PaymentDistributionRow[];
  recentOrders: OrderDto[];
  lowStock: LowStockRow[];
}

export interface ReportSummary {
  revenue: string;
  orders: number;
  itemsSold: number;
  averageOrderValue: string;
  discounts: string;
  tax: string;
  deliveryFees: string;
  cost: string;
  /** Gross profit: revenue − discounts − ingredient cost + delivery. */
  profit: string;
  marginPct: number | null;
  /** Paid payroll net salaries inside the range. */
  salaries: string;
  /** Operating expenses recorded inside the range. */
  expenses: string;
  /** Net profit: gross profit − salaries − operating expenses. */
  netProfit: string;
  netMarginPct: number | null;
}

export interface CashierPerformanceRow {
  userId: string;
  name: string;
  orders: number;
  revenue: string;
  averageOrderValue: string;
}

export interface ReportRow {
  key: string;
  label: string;
  orders: number;
  units: number;
  revenue: string;
}

export interface ReportDto {
  range: { from: string; to: string; days: number };
  summary: ReportSummary;
  daily: RevenuePoint[];
  byCategory: CategorySalesRow[];
  bestSellers: BestSellerRow[];
  byCashier: CashierPerformanceRow[];
  payments: PaymentDistributionRow[];
  discounts: Array<{ label: string; orders: number; amount: string }>;
  inventoryConsumption: Array<{
    ingredientId: string;
    name: string;
    unit: IngredientUnit;
    quantity: number;
    cost: string;
  }>;
  ordersByType: ReportRow[];
  byChannel: ReportRow[];
  refunds: string;
  expensesByCategory: Array<{ category: ExpenseCategory; amount: string; count: number }>;
}

export interface AuditEntryDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  terminalId: string | null;
  createdAt: string;
  user: { id: string; fullName: string; username: string } | null;
}

// ---------------------------------------------------------------------------
// Branches, shifts & cash drawer
// ---------------------------------------------------------------------------

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  onlineOrderingEnabled: boolean;
  onlineOpenTime: string | null;
  onlineCloseTime: string | null;
  createdAt: string;
}

export interface DeliveryZoneDto {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  centerLat: number;
  centerLng: number;
  radiusInMeters: number;
  deliveryFee: string;
  minOrderAmount: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Result of checking a customer point against a branch's active zones. */
export interface DeliveryZoneCheckDto {
  branchId: string;
  /** False only when zones exist but the point falls outside every circle. */
  inside: boolean;
  zone: DeliveryZoneDto | null;
  distanceMeters: number | null;
  nearestZoneName: string | null;
  nearestDistanceMeters: number | null;
  /** Zone fee when matched, otherwise the branch's legacy flat fee. */
  deliveryFee: string;
  minOrderAmount: string;
  activeZones: number;
  /** True when no zones are configured and the flat delivery fee applies. */
  usesFallbackFee: boolean;
}

// ---------------------------------------------------------------------------
// Online storefront
// ---------------------------------------------------------------------------

export type OnlineClosedReason = 'DISABLED' | 'OUTSIDE_HOURS' | 'BRANCH_INACTIVE';

export interface OnlineStoreSettingsDto {
  branchId: string;
  branchName: string;
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
  isOpenNow: boolean;
  acceptingOrders: boolean;
  closedReason: OnlineClosedReason | null;
  updatedAt: string;
}

export interface OnlineStoreTodayStatsDto {
  orders: number;
  revenue: string;
  pendingPayment: number;
}

export interface OnlineStoreOverviewDto {
  settings: OnlineStoreSettingsDto;
  today: OnlineStoreTodayStatsDto;
  recentOrders: OrderDto[];
}

export interface PublicBranchDto {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineOrderingEnabled: boolean;
  onlineOpenTime: string | null;
  onlineCloseTime: string | null;
  isOpenNow: boolean;
  acceptingOrders: boolean;
  closedReason: OnlineClosedReason | null;
}

/** Restaurant identity from dashboard Settings, localized for the storefront. */
export interface PublicSettingsDto {
  name: string;
  nameEn: string;
  nameAr: string | null;
  address: string | null;
  addressEn: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
}

export interface PublicCategoryDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
}

export interface PublicMenuSizeDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  price: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface PublicMenuItemDto {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  imageUrl: string | null;
  categoryId: string;
  kind: MenuKind;
  basePrice: string;
  prepMinutes: number;
  isFeatured: boolean;
  hasSizes: boolean;
  sizes: PublicMenuSizeDto[];
  isSoldOut: boolean;
  soldOutReason: string | null;
  /** Recipe ingredient names, localized. Empty when the item has no recipe. */
  ingredients: string[];
}

export interface PublicToppingDto {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string | null;
  price: string;
}

export interface PublicMenuDto {
  generatedAt: string;
  branch: PublicBranchDto;
  currency: string;
  acceptingOrders: boolean;
  closedReason: OnlineClosedReason | null;
  categories: PublicCategoryDto[];
  items: PublicMenuItemDto[];
  toppings: PublicToppingDto[];
  /** Tax percentage applied at checkout, e.g. "14.00". */
  taxRate: string;
  /** Best sellers over the last 30 days at this branch, most ordered first. */
  popularItemIds: string[];
}

export interface PublicZoneDto {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusInMeters: number;
  deliveryFee: string;
  minOrderAmount: string;
}

/** Public zone check result; adds the resolved point and zone catalogue. */
export interface PublicDeliveryCheckDto extends DeliveryZoneCheckDto {
  lat: number | null;
  lng: number | null;
  resolvedAddress: string | null;
  requiresGeolocation: boolean;
  zones: PublicZoneDto[];
}

export interface OnlinePaymentDto {
  id: string;
  provider: string;
  providerRef: string | null;
  reference: string;
  status: OnlinePaymentStatus;
  amount: string;
  currency: string;
  checkoutUrl: string | null;
  failureReason: string | null;
  /** True when the gateway keys are absent and the intent stays local. */
  simulated: boolean;
  paidAt: string | null;
  createdAt: string;
}

export interface PublicOrderItemDto {
  name: string;
  sizeName: string | null;
  quantity: number;
  lineTotal: string;
}

export interface PublicOrderDto {
  orderNumber: string;
  type: OrderType;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: OnlinePaymentMethod;
  currency: string;
  subtotal: string;
  tax: string;
  deliveryFee: string;
  total: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  estimatedPrepMinutes: number;
  items: PublicOrderItemDto[];
  payment: OnlinePaymentDto | null;
  /** Dispatch progress for delivery orders; null for pickup. */
  deliveryStatus: DeliveryStatus | null;
  createdAt: string;
}

export interface CashMovementDto {
  id: string;
  type: CashMovementType;
  amount: string;
  reason: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface ShiftTotals {
  ordersCount: number;
  grossSales: string;
  cashPayments: string;
  cardPayments: string;
  walletPayments: string;
  cashIn: string;
  cashOut: string;
  cashRefunds: string;
  refundsTotal: string;
  discounts: string;
  tax: string;
  deliveryFees: string;
  openingFloat: string;
  expectedCash: string;
  countedCash: string | null;
  variance: string | null;
}

export interface ShiftDto {
  id: string;
  shiftNumber: string;
  branchId: string;
  branchName: string;
  terminalId: string;
  openedById: string;
  openedByName: string;
  closedById: string | null;
  closedByName: string | null;
  openingFloat: string;
  countedCash: string | null;
  expectedCash: string | null;
  variance: string | null;
  status: ShiftStatus;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  totals: ShiftTotals;
  cashMovements: CashMovementDto[];
  zReport: ZReportDto | null;
}

export interface ZReportDto {
  id: string;
  reportNumber: string;
  shiftId: string;
  branchId: string;
  terminalId: string;
  businessDate: string;
  totals: ShiftTotals;
  lockedAt: string;
}

// ---------------------------------------------------------------------------
// Tables & delivery
// ---------------------------------------------------------------------------

export interface DiningTableDto {
  id: string;
  branchId: string;
  name: string;
  seats: number;
  status: TableStatus;
  isActive: boolean;
  openOrderId: string | null;
  openOrderNumber: string | null;
  openOrderTotal: string | null;
  openOrderOpenedAt: string | null;
}

export interface DeliveryOrderDto {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  total: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  isCod: boolean;
  deliveryStatus: DeliveryStatus | null;
  driverId: string | null;
  driverName: string | null;
  notes: string | null;
  createdAt: string;
  itemsCount: number;
}

export interface DriverSettlementDto {
  id: string;
  settlementNumber: string;
  driverId: string;
  driverName: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  grossSales: string;
  cashCollected: string;
  cardCollected: string;
  deliveryFees: string;
  amountHandedOver: string;
  variance: string;
  status: 'OPEN' | 'SETTLED';
  notes: string | null;
  settledAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Stocktakes & transfers
// ---------------------------------------------------------------------------

export interface StocktakeItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  expectedQty: number;
  countedQty: number;
  variance: number;
}

export interface StocktakeDto {
  id: string;
  reference: string;
  branchId: string;
  status: StocktakeStatus;
  notes: string | null;
  createdById: string;
  createdByName: string;
  completedAt: string | null;
  createdAt: string;
  items: StocktakeItemDto[];
}

export interface StockTransferItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
}

export interface StockTransferDto {
  id: string;
  reference: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  status: TransferStatus;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  receivedAt: string | null;
  items: StockTransferItemDto[];
}

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

export interface PurchaseOrderItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
  unitPrice: string;
  discount: string;
  taxRate: number;
  receivedQuantity: number;
  /** quantity * unitPrice - discount */
  lineTotal: string;
}

export interface PurchaseOrderDto {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  expectedAt: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  createdByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItemDto[];
  receiptCount: number;
  receivedTotal: string;
}

export interface PurchaseReceiptItemDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
  unitCost: string;
  lineTotal: string;
}

export interface PurchaseReceiptDto {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierInvoiceNo: string | null;
  notes: string | null;
  branchId: string;
  branchName: string;
  receivedByName: string;
  receivedAt: string;
  items: PurchaseReceiptItemDto[];
  total: string;
}

// ---------------------------------------------------------------------------
// Stock alerts & inventory reporting
// ---------------------------------------------------------------------------

export interface StockAlertDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  branchId: string;
  branchName: string;
  type: StockAlertType;
  status: StockAlertStatus;
  currentStock: number;
  threshold: number;
  unit: IngredientUnit;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReplenishmentSuggestionDto {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  branchId: string;
  branchName: string;
  unit: IngredientUnit;
  currentStock: number;
  reorderPoint: number;
  maxStock: number;
  suggestedQty: number;
  supplierId: string | null;
  supplierName: string | null;
}

export interface InventorySummaryDto {
  itemCount: number;
  lowCount: number;
  outCount: number;
  inventoryValue: string;
  openAlerts: number;
  purchasesValue: string;
  purchasesCount: number;
  consumptionValue: string;
  wasteValue: string;
}

export interface StoreSummaryDto {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  address: string | null;
  isActive: boolean;
  ingredientCount: number;
  lowCount: number;
  outCount: number;
  stockValue: string;
}

export interface StoreStockRowDto {
  branchId: string;
  branchName: string;
  branchCode: string;
  branchActive: boolean;
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  unit: IngredientUnit;
  currentStock: number;
  minStock: number;
  reorderPoint: number;
  maxStock: number;
  averageCost: string;
  stockValue: string;
  isLow: boolean;
  isOut: boolean;
}

export interface InventoryValuationRowDto {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  unit: IngredientUnit;
  currentStock: number;
  averageCost: string;
  stockValue: string;
  lastCost: string;
}

export interface InventoryConsumptionRowDto {
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
  cost: string;
}

export interface InventoryPurchaseRowDto {
  id: string;
  orderNumber: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  total: string;
  createdAt: string;
  receivedAt: string | null;
}

export interface InventoryWasteRowDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantity: number;
  cost: string | null;
  reason: string | null;
  createdAt: string;
  userName: string | null;
}

export interface RecipeCostRowDto {
  menuItemId: string;
  menuItemName: string;
  sizeId: string | null;
  sizeName: string | null;
  version: number;
  ingredientCost: string;
  sellingPrice: string;
  marginPct: number;
}

export interface InventoryReportsDto {
  summary: InventorySummaryDto;
  valuation: InventoryValuationRowDto[];
  consumption: InventoryConsumptionRowDto[];
  purchases: InventoryPurchaseRowDto[];
  waste: InventoryWasteRowDto[];
  recipeCosts: RecipeCostRowDto[];
}

// ---------------------------------------------------------------------------
// HR & payroll
// ---------------------------------------------------------------------------

export interface EmployeeDto {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  jobTitle: string;
  branchId: string | null;
  branchName: string | null;
  hireDate: string;
  basicSalary: string;
  salaryType: SalaryType;
  status: EmploymentStatus;
  createdAt: string;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  note: string | null;
  updatedAt: string;
}

export interface AdjustmentDto {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  category: AdjustmentCategory;
  amount: string;
  date: string;
  reason: string;
  payrollMonth: string;
  createdAt: string;
}

export interface PayrollAdjustmentSnapshot {
  id: string;
  category: AdjustmentCategory;
  amount: string;
  reason: string;
  date: string;
}

export interface PayrollBreakdown {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  lateMinutes: number;
  dailyRate: string;
  grossPay: string;
  lateDeduction: string;
  absenceDeduction: string;
  attendanceDeduction: string;
  adjustmentDeductions: string;
  adjustmentBonuses: string;
  adjustments: PayrollAdjustmentSnapshot[];
  notes: string[];
}

export interface PayrollLineDto {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  branchName: string | null;
  salaryType: SalaryType;
  basicSalary: string;
  payableDays: number;
  presentDays: number;
  absentDays: number;
  lateMinutes: number;
  attendanceDeduction: string;
  bonusTotal: string;
  deductionTotal: string;
  netSalary: string;
  paymentStatus: PayrollPaymentStatus;
  paidAt: string | null;
  breakdown: PayrollBreakdown;
}

export interface PayrollRunDto {
  id: string;
  month: string;
  status: PayrollStatus;
  employeeCount: number;
  basicTotal: string;
  bonusTotal: string;
  deductionTotal: string;
  netTotal: string;
  paidTotal: string;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  lines: PayrollLineDto[];
}

export interface PayrollPreviewEmployeeDto extends PayrollLineDto {
  /** Draft rows have no persisted id until the run is generated. */
  id: string;
}

export interface PayrollMonthDto {
  month: string;
  run: PayrollRunDto | null;
  preview: PayrollPreviewEmployeeDto[];
  canEdit: boolean;
}

export interface EmployeePayrollHistoryDto {
  employee: EmployeeDto;
  lines: Array<PayrollLineDto & { month: string; runStatus: PayrollStatus }>;
}

export interface HrSettingsDto {
  workStart: string;
  workEnd: string;
  graceMinutes: number;
  lateDeductionPerMinute: string;
  absenceDeductionMultiplier: string;
  weeklyDaysOff: number[];
  updatedAt: string;
}

export interface HrDashboardDto {
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  monthlyPayroll: string;
  unpaidSalaries: string;
  unpaidCount: number;
  currentMonth: string;
}

export interface UploadedImageDto {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
}
