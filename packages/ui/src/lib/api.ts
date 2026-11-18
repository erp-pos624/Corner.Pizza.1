import type {
  AdjustmentCreateInput,
  AdjustmentDto,
  AdjustmentUpdateInput,
  AttendanceDto,
  AttendanceUpsertInput,
  AuditEntryDto,
  BranchCreateInput,
  BranchDto,
  CashMovementInput,
  CategoryDto,
  CategoryCreateInput,
  CustomerCreateInput,
  CustomerDto,
  CustomerUpdateInput,
  DashboardDto,
  DeliveryAssignInput,
  DeliveryOrderDto,
  DeliveryStatus,
  DeliveryStatusInput,
  DeliveryZoneCheckDto,
  DeliveryZoneCheckInput,
  DeliveryZoneCreateInput,
  DeliveryZoneDto,
  DeliveryZoneUpdateInput,
  DiningTableDto,
  DiscountDto,
  DiscountCreateInput,
  DriverSettlementDto,
  DriverSettlementInput,
  DriverSettlementSettleInput,
  EmployeeCreateInput,
  EmployeeDto,
  EmployeePayrollHistoryDto,
  EmployeeUpdateInput,
  ExpenseCreateInput,
  ExpenseDto,
  ExpenseSummaryDto,
  ExpenseUpdateInput,
  HrDashboardDto,
  HrSettingsDto,
  HrSettingsUpdateInput,
  ImageUploadInput,
  IngredientCategoryDto,
  IngredientCategoryInput,
  IngredientDto,
  IngredientInput,
  InventoryMovementDto,
  InventoryReportQuery,
  InventoryReportsDto,
  KitchenOrderDto,
  KitchenQueueDto,
  KitchenStatus,
  MenuItemCreateInput,
  MenuItemDto,
  MenuItemUpdateInput,
  OnlineStoreOverviewDto,
  OnlineStoreSettingsDto,
  OnlineStoreSettingsUpdateInput,
  OrderAddItemsInput,
  OrderChannel,
  OrderCreateInput,
  OrderDto,
  OrderRefundInput,
  OrderSettleInput,
  OrderStatus,
  Paginated,
  PaymentMethod,
  PayrollGenerateInput,
  PayrollLineDto,
  PayrollMonthDto,
  PayrollPaymentStatus,
  PayrollRunDto,
  PurchaseOrderCreateInput,
  PurchaseOrderDto,
  PurchaseOrderStatusInput,
  PurchaseReceiveInput,
  PurchaseReceiptDto,
  RecipeDto,
  RecipeUpsertInput,
  ReplenishmentSuggestionDto,
  ReportDto,
  Role,
  SettingsDto,
  SettingsUpdateInput,
  ShiftCloseInput,
  ShiftDto,
  ShiftOpenInput,
  StockAdjustInput,
  StockAlertDto,
  StockAlertQuery,
  StockLossInput,
  StockPurchaseInput,
  StocktakeCreateInput,
  StocktakeDto,
  StockTransferDto,
  StoreStockRowDto,
  StoreSummaryDto,
  SupplierCreateInput,
  SupplierDto,
  TableCreateInput,
  TableUpdateInput,
  TransferCreateInput,
  TransferStatus,
  ToppingCreateInput,
  ToppingDto,
  UploadedImageDto,
  UserDto,
  ZReportDto,
} from '@posshope/shared';
import type {
  ApiRequestPayload,
  AppInfo,
  PrintOptions,
  PrintResult,
  ServerHealth,
} from '../platform';
import { getBridge } from './bridge';
import { ALL_BRANCHES, getActiveBranchScope } from './branch-scope';
import { getActiveLanguage } from './language';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface InvoiceWithOrder {
  id: string;
  invoiceNumber: string;
  orderId: string;
  issuedAt: string;
  order: OrderDto;
}

export interface CustomerDetail {
  customer: CustomerDto;
  orders: OrderDto[];
}

export interface MenuCatalog {
  categories: CategoryDto[];
  items: MenuItemDto[];
  toppings: ToppingDto[];
  discounts: DiscountDto[];
}

async function call<T>(payload: ApiRequestPayload): Promise<T> {
  const scope = getActiveBranchScope();
  /* Concrete branches also travel as a query parameter so endpoints that read
     `req.query.branchId` directly (stocktakes, transfers, shifts) see it too.
     `all` is only meaningful for consolidated reports and stays header-only. */
  const branchQuery =
    scope && scope !== ALL_BRANCHES && payload.query?.branchId === undefined
      ? { branchId: scope }
      : {};
  const response = await getBridge().api.request<T>({
    ...payload,
    query: { ...payload.query, ...branchQuery, lang: getActiveLanguage() },
    ...(scope ? { branchId: scope } : {}),
  });
  if (response.ok) return response.data;
  throw new ApiError(
    response.error.message,
    response.error.code,
    response.status,
    response.error.details,
  );
}

export interface CreateUserBody {
  username: string;
  fullName: string;
  email?: string;
  role: Role;
  password: string;
  branchId?: string | null;
}

export interface UpdateUserBody {
  fullName?: string;
  email?: string | null;
  role?: Role;
  isActive?: boolean;
  branchId?: string | null;
}

export const api = {
  appInfo: (): Promise<AppInfo> => getBridge().appInfo(),
  health: (): Promise<ServerHealth> => getBridge().health(),
  session: () => getBridge().auth.session(),
  login: async (username: string, password: string) => {
    const response = await getBridge().auth.login({
      username,
      password,
      language: getActiveLanguage(),
    });
    if (response.ok) return response.data;
    throw new ApiError(response.error.message, response.error.code, response.status);
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await getBridge().auth.changePassword({
      currentPassword,
      newPassword,
      language: getActiveLanguage(),
    });
    if (response.ok) return response.data;
    throw new ApiError(response.error.message, response.error.code, response.status);
  },
  logout: (): Promise<void> => getBridge().auth.logout(),
  print: (options?: PrintOptions): Promise<PrintResult> =>
    getBridge().print({ ...options, language: getActiveLanguage() }),

  uploads: {
    image: (body: ImageUploadInput) =>
      call<UploadedImageDto>({ method: 'POST', path: '/uploads/image', body }),
  },

  categories: {
    list: () => call<CategoryDto[]>({ method: 'GET', path: '/categories' }),
    create: (body: CategoryCreateInput) =>
      call<CategoryDto>({ method: 'POST', path: '/categories', body }),
    update: (id: string, body: Partial<CategoryCreateInput>) =>
      call<CategoryDto>({ method: 'PATCH', path: `/categories/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/categories/${id}` }),
  },

  menu: {
    catalog: () => call<MenuCatalog>({ method: 'GET', path: '/menu/catalog' }),
    items: (params: ListParams) =>
      call<Paginated<MenuItemDto>>({ method: 'GET', path: '/menu/items', query: params }),
    item: (id: string) => call<MenuItemDto>({ method: 'GET', path: `/menu/items/${id}` }),
    create: (body: MenuItemCreateInput) =>
      call<MenuItemDto>({ method: 'POST', path: '/menu/items', body }),
    update: (id: string, body: MenuItemUpdateInput) =>
      call<MenuItemDto>({ method: 'PATCH', path: `/menu/items/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/menu/items/${id}` }),
    recipe: (id: string) => call<RecipeDto | null>({ method: 'GET', path: `/menu/items/${id}/recipe` }),
    recipes: (id: string) =>
      call<RecipeDto[]>({ method: 'GET', path: `/menu/items/${id}/recipes` }),
    saveRecipe: (id: string, body: RecipeUpsertInput) =>
      call<{ ok: boolean }>({ method: 'PUT', path: `/menu/items/${id}/recipe`, body }),
    toppings: () => call<ToppingDto[]>({ method: 'GET', path: '/menu/toppings' }),
    createTopping: (body: ToppingCreateInput) =>
      call<ToppingDto>({ method: 'POST', path: '/menu/toppings', body }),
    updateTopping: (
      id: string,
      body: Omit<Partial<ToppingCreateInput>, 'ingredientId'> & { ingredientId?: string | null },
    ) => call<ToppingDto>({ method: 'PATCH', path: `/menu/toppings/${id}`, body }),
    removeTopping: (id: string) =>
      call<{ ok: boolean }>({ method: 'DELETE', path: `/menu/toppings/${id}` }),
  },

  discounts: {
    list: () => call<DiscountDto[]>({ method: 'GET', path: '/discounts' }),
    create: (body: DiscountCreateInput) =>
      call<DiscountDto>({ method: 'POST', path: '/discounts', body }),
    update: (id: string, body: Partial<DiscountCreateInput>) =>
      call<DiscountDto>({ method: 'PATCH', path: `/discounts/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/discounts/${id}` }),
  },

  orders: {
    list: (params: ListParams) =>
      call<Paginated<OrderDto>>({ method: 'GET', path: '/orders', query: params }),
    get: (id: string) => call<OrderDto>({ method: 'GET', path: `/orders/${id}` }),
    create: (body: OrderCreateInput) => call<OrderDto>({ method: 'POST', path: '/orders', body }),
    addItems: (id: string, body: OrderAddItemsInput) =>
      call<OrderDto>({ method: 'POST', path: `/orders/${id}/items`, body }),
    settle: (id: string, body: OrderSettleInput) =>
      call<OrderDto>({ method: 'POST', path: `/orders/${id}/settle`, body }),
    refund: (id: string, body: OrderRefundInput) =>
      call<OrderDto>({ method: 'POST', path: `/orders/${id}/refund`, body }),
    updateStatus: (id: string, status: OrderStatus) =>
      call<OrderDto>({ method: 'PATCH', path: `/orders/${id}/status`, body: { status } }),
    cancel: (id: string, reason: string) =>
      call<OrderDto>({ method: 'POST', path: `/orders/${id}/cancel`, body: { reason } }),
  },

  invoices: {
    list: (params: ListParams) =>
      call<Paginated<InvoiceWithOrder>>({ method: 'GET', path: '/invoices', query: params }),
    get: (id: string) => call<InvoiceWithOrder>({ method: 'GET', path: `/invoices/${id}` }),
    byOrder: (orderId: string) =>
      call<InvoiceWithOrder>({ method: 'GET', path: `/invoices/by-order/${orderId}` }),
  },

  kitchen: {
    queue: () => call<KitchenQueueDto>({ method: 'GET', path: '/kitchen/orders' }),
    updateStatus: (id: string, status: KitchenStatus) =>
      call<KitchenOrderDto>({
        method: 'PATCH',
        path: `/kitchen/orders/${id}/status`,
        body: { status },
      }),
  },

  customers: {
    list: (params: ListParams) =>
      call<Paginated<CustomerDto>>({ method: 'GET', path: '/customers', query: params }),
    get: (id: string) => call<CustomerDetail>({ method: 'GET', path: `/customers/${id}` }),
    create: (body: CustomerCreateInput) =>
      call<CustomerDto>({ method: 'POST', path: '/customers', body }),
    update: (id: string, body: CustomerUpdateInput) =>
      call<CustomerDto>({ method: 'PATCH', path: `/customers/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/customers/${id}` }),
  },

  branches: {
    list: () => call<BranchDto[]>({ method: 'GET', path: '/branches' }),
    create: (body: BranchCreateInput) =>
      call<BranchDto>({ method: 'POST', path: '/branches', body }),
    update: (id: string, body: Partial<BranchCreateInput>) =>
      call<BranchDto>({ method: 'PATCH', path: `/branches/${id}`, body }),
  },

  shifts: {
    current: () => call<ShiftDto | null>({ method: 'GET', path: '/shifts/current' }),
    list: (params: ListParams) =>
      call<Paginated<ShiftDto>>({ method: 'GET', path: '/shifts', query: params }),
    get: (id: string) => call<ShiftDto>({ method: 'GET', path: `/shifts/${id}` }),
    open: (body: ShiftOpenInput) => call<ShiftDto>({ method: 'POST', path: '/shifts', body }),
    recordMovement: (id: string, body: CashMovementInput) =>
      call<ShiftDto>({ method: 'POST', path: `/shifts/${id}/movements`, body }),
    close: (id: string, body: ShiftCloseInput) =>
      call<ShiftDto>({ method: 'POST', path: `/shifts/${id}/close`, body }),
    zReports: (params: { date?: string; branchId?: string } = {}) =>
      call<ZReportDto[]>({ method: 'GET', path: '/shifts/z-reports', query: params }),
    zReport: (id: string) => call<ZReportDto>({ method: 'GET', path: `/shifts/z-reports/${id}` }),
  },

  tables: {
    list: () => call<DiningTableDto[]>({ method: 'GET', path: '/tables' }),
    create: (body: TableCreateInput) =>
      call<DiningTableDto>({ method: 'POST', path: '/tables', body }),
    update: (id: string, body: TableUpdateInput) =>
      call<DiningTableDto>({ method: 'PATCH', path: `/tables/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/tables/${id}` }),
  },

  delivery: {
    orders: (params: ListParams) =>
      call<Paginated<DeliveryOrderDto>>({ method: 'GET', path: '/delivery/orders', query: params }),
    drivers: () =>
      call<Array<{ id: string; fullName: string; username: string }>>({
        method: 'GET',
        path: '/delivery/drivers',
      }),
    assign: (id: string, body: DeliveryAssignInput) =>
      call<DeliveryOrderDto>({ method: 'POST', path: `/delivery/orders/${id}/assign`, body }),
    updateStatus: (id: string, status: DeliveryStatus) =>
      call<DeliveryOrderDto>({
        method: 'PATCH',
        path: `/delivery/orders/${id}/status`,
        body: { status } satisfies DeliveryStatusInput,
      }),
    settlements: (params: ListParams) =>
      call<Paginated<DriverSettlementDto>>({
        method: 'GET',
        path: '/delivery/settlements',
        query: params,
      }),
    settlement: (id: string) =>
      call<DriverSettlementDto>({ method: 'GET', path: `/delivery/settlements/${id}` }),
    createSettlement: (body: DriverSettlementInput) =>
      call<DriverSettlementDto>({ method: 'POST', path: '/delivery/settlements', body }),
    settleSettlement: (id: string, body: DriverSettlementSettleInput) =>
      call<DriverSettlementDto>({
        method: 'POST',
        path: `/delivery/settlements/${id}/settle`,
        body,
      }),
    checkZone: (body: DeliveryZoneCheckInput) =>
      call<DeliveryZoneCheckDto>({ method: 'POST', path: '/delivery/check-zone', body }),
  },

  deliveryZones: {
    list: (params: { branchId?: string; includeInactive?: boolean } = {}) =>
      call<DeliveryZoneDto[]>({ method: 'GET', path: '/delivery-zones', query: params }),
    create: (body: DeliveryZoneCreateInput) =>
      call<DeliveryZoneDto>({ method: 'POST', path: '/delivery-zones', body }),
    update: (id: string, body: DeliveryZoneUpdateInput) =>
      call<DeliveryZoneDto>({ method: 'PATCH', path: `/delivery-zones/${id}`, body }),
    remove: (id: string) =>
      call<{ ok: boolean }>({ method: 'DELETE', path: `/delivery-zones/${id}` }),
  },

  inventory: {
    categories: {
      list: (params: { includeInactive?: boolean } = {}) =>
        call<IngredientCategoryDto[]>({
          method: 'GET',
          path: '/inventory/categories',
          query: params,
        }),
      create: (body: IngredientCategoryInput) =>
        call<IngredientCategoryDto>({ method: 'POST', path: '/inventory/categories', body }),
      update: (id: string, body: Partial<IngredientCategoryInput>) =>
        call<IngredientCategoryDto>({
          method: 'PATCH',
          path: `/inventory/categories/${id}`,
          body,
        }),
      remove: (id: string) =>
        call<{ ok: boolean }>({ method: 'DELETE', path: `/inventory/categories/${id}` }),
    },
    stores: () => call<StoreSummaryDto[]>({ method: 'GET', path: '/inventory/stores' }),
    storeStock: (params: { branchId?: string; q?: string } = {}) =>
      call<StoreStockRowDto[]>({ method: 'GET', path: '/inventory/stores/stock', query: params }),
    alerts: (params: StockAlertQuery) =>
      call<Paginated<StockAlertDto>>({ method: 'GET', path: '/inventory/alerts', query: params }),
    resolveAlert: (id: string) =>
      call<StockAlertDto>({ method: 'POST', path: `/inventory/alerts/${id}/resolve` }),
    replenishment: () =>
      call<ReplenishmentSuggestionDto[]>({ method: 'GET', path: '/inventory/replenishment' }),
    ingredients: (params: ListParams) =>
      call<Paginated<IngredientDto>>({
        method: 'GET',
        path: '/inventory/ingredients',
        query: params,
      }),
    lowStock: () =>
      call<IngredientDto[]>({ method: 'GET', path: '/inventory/ingredients/low-stock' }),
    ingredient: (id: string) =>
      call<IngredientDto>({ method: 'GET', path: `/inventory/ingredients/${id}` }),
    createIngredient: (body: IngredientInput) =>
      call<IngredientDto>({ method: 'POST', path: '/inventory/ingredients', body }),
    updateIngredient: (id: string, body: Partial<IngredientInput>) =>
      call<IngredientDto>({ method: 'PATCH', path: `/inventory/ingredients/${id}`, body }),
    removeIngredient: (id: string) =>
      call<{ ok: boolean }>({ method: 'DELETE', path: `/inventory/ingredients/${id}` }),
    adjust: (id: string, body: StockAdjustInput) =>
      call<IngredientDto>({ method: 'POST', path: `/inventory/ingredients/${id}/adjust`, body }),
    purchase: (id: string, body: StockPurchaseInput) =>
      call<IngredientDto>({ method: 'POST', path: `/inventory/ingredients/${id}/purchase`, body }),
    waste: (id: string, body: StockLossInput) =>
      call<IngredientDto>({ method: 'POST', path: `/inventory/ingredients/${id}/waste`, body }),
    returnStock: (id: string, body: StockLossInput) =>
      call<IngredientDto>({ method: 'POST', path: `/inventory/ingredients/${id}/return`, body }),
    reorderAlerts: () =>
      call<IngredientDto[]>({ method: 'GET', path: '/inventory/ingredients/reorder-alerts' }),
    movements: (params: ListParams) =>
      call<Paginated<InventoryMovementDto>>({
        method: 'GET',
        path: '/inventory/movements',
        query: params,
      }),
    stocktakes: (params: ListParams) =>
      call<Paginated<StocktakeDto>>({
        method: 'GET',
        path: '/inventory/stocktakes',
        query: params,
      }),
    stocktake: (id: string) =>
      call<StocktakeDto>({ method: 'GET', path: `/inventory/stocktakes/${id}` }),
    createStocktake: (body: StocktakeCreateInput) =>
      call<StocktakeDto>({ method: 'POST', path: '/inventory/stocktakes', body }),
    completeStocktake: (id: string) =>
      call<StocktakeDto>({ method: 'POST', path: `/inventory/stocktakes/${id}/complete` }),
    cancelStocktake: (id: string) =>
      call<StocktakeDto>({ method: 'POST', path: `/inventory/stocktakes/${id}/cancel` }),
    transfers: (params: ListParams) =>
      call<Paginated<StockTransferDto>>({
        method: 'GET',
        path: '/inventory/transfers',
        query: params,
      }),
    transfer: (id: string) =>
      call<StockTransferDto>({ method: 'GET', path: `/inventory/transfers/${id}` }),
    createTransfer: (body: TransferCreateInput) =>
      call<StockTransferDto>({ method: 'POST', path: '/inventory/transfers', body }),
    updateTransferStatus: (id: string, status: TransferStatus) =>
      call<StockTransferDto>({
        method: 'PATCH',
        path: `/inventory/transfers/${id}/status`,
        body: { status },
      }),
  },

  suppliers: {
    list: (params: ListParams) =>
      call<Paginated<SupplierDto>>({ method: 'GET', path: '/suppliers', query: params }),
    create: (body: SupplierCreateInput) =>
      call<SupplierDto>({ method: 'POST', path: '/suppliers', body }),
    update: (id: string, body: Partial<SupplierCreateInput>) =>
      call<SupplierDto>({ method: 'PATCH', path: `/suppliers/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/suppliers/${id}` }),
  },

  reports: {
    dashboard: (days: number, channel?: OrderChannel) =>
      call<DashboardDto>({
        method: 'GET',
        path: '/reports/dashboard',
        query: { days, channel },
      }),
    sales: (params: {
      from?: string;
      to?: string;
      granularity?: 'day' | 'month';
      channel?: OrderChannel;
    }) => call<ReportDto>({ method: 'GET', path: '/reports/sales', query: params }),
    inventory: (params: InventoryReportQuery = {}) =>
      call<InventoryReportsDto>({ method: 'GET', path: '/reports/inventory', query: params }),
  },

  expenses: {
    list: (params: ListParams) =>
      call<Paginated<ExpenseDto>>({ method: 'GET', path: '/expenses', query: params }),
    summary: (params: { from?: string; to?: string; category?: string } = {}) =>
      call<ExpenseSummaryDto>({ method: 'GET', path: '/expenses/summary', query: params }),
    create: (body: ExpenseCreateInput) =>
      call<ExpenseDto>({ method: 'POST', path: '/expenses', body }),
    update: (id: string, body: ExpenseUpdateInput) =>
      call<ExpenseDto>({ method: 'PATCH', path: `/expenses/${id}`, body }),
    remove: (id: string) => call<{ ok: boolean }>({ method: 'DELETE', path: `/expenses/${id}` }),
  },

  purchasing: {
    orders: (params: ListParams) =>
      call<Paginated<PurchaseOrderDto>>({
        method: 'GET',
        path: '/purchasing/purchase-orders',
        query: params,
      }),
    order: (id: string) =>
      call<PurchaseOrderDto>({ method: 'GET', path: `/purchasing/purchase-orders/${id}` }),
    createOrder: (body: PurchaseOrderCreateInput) =>
      call<PurchaseOrderDto>({ method: 'POST', path: '/purchasing/purchase-orders', body }),
    updateOrder: (id: string, body: Partial<PurchaseOrderCreateInput>) =>
      call<PurchaseOrderDto>({
        method: 'PATCH',
        path: `/purchasing/purchase-orders/${id}`,
        body,
      }),
    changeOrderStatus: (id: string, body: PurchaseOrderStatusInput) =>
      call<PurchaseOrderDto>({
        method: 'POST',
        path: `/purchasing/purchase-orders/${id}/status`,
        body,
      }),
    receive: (id: string, body: PurchaseReceiveInput) =>
      call<PurchaseReceiptDto>({
        method: 'POST',
        path: `/purchasing/purchase-orders/${id}/receive`,
        body,
      }),
    receipts: (params: ListParams) =>
      call<Paginated<PurchaseReceiptDto>>({
        method: 'GET',
        path: '/purchasing/receipts',
        query: params,
      }),
  },

  onlineStore: {
    overview: () =>
      call<OnlineStoreOverviewDto>({ method: 'GET', path: '/online-store' }),
    updateSettings: (body: OnlineStoreSettingsUpdateInput) =>
      call<OnlineStoreSettingsDto>({ method: 'PATCH', path: '/online-store/settings', body }),
  },

  hr: {
    employees: (params: ListParams) =>
      call<Paginated<EmployeeDto>>({ method: 'GET', path: '/hr/employees', query: params }),
    createEmployee: (body: EmployeeCreateInput) =>
      call<EmployeeDto>({ method: 'POST', path: '/hr/employees', body }),
    updateEmployee: (id: string, body: EmployeeUpdateInput) =>
      call<EmployeeDto>({ method: 'PATCH', path: `/hr/employees/${id}`, body }),
    employeePayroll: (id: string) =>
      call<EmployeePayrollHistoryDto>({
        method: 'GET',
        path: `/hr/employees/${id}/payroll`,
      }),
    attendance: (params: ListParams) =>
      call<Paginated<AttendanceDto>>({ method: 'GET', path: '/hr/attendance', query: params }),
    saveAttendance: (body: AttendanceUpsertInput) =>
      call<AttendanceDto>({ method: 'PUT', path: '/hr/attendance', body }),
    adjustments: (params: ListParams) =>
      call<Paginated<AdjustmentDto>>({ method: 'GET', path: '/hr/adjustments', query: params }),
    createAdjustment: (body: AdjustmentCreateInput) =>
      call<AdjustmentDto>({ method: 'POST', path: '/hr/adjustments', body }),
    updateAdjustment: (id: string, body: AdjustmentUpdateInput) =>
      call<AdjustmentDto>({ method: 'PATCH', path: `/hr/adjustments/${id}`, body }),
    removeAdjustment: (id: string) =>
      call<{ ok: boolean }>({ method: 'DELETE', path: `/hr/adjustments/${id}` }),
    payrollMonth: (month: string) =>
      call<PayrollMonthDto>({ method: 'GET', path: '/hr/payroll', query: { month } }),
    generatePayroll: (body: PayrollGenerateInput) =>
      call<PayrollRunDto>({ method: 'POST', path: '/hr/payroll', body }),
    closePayroll: (id: string) =>
      call<PayrollRunDto>({ method: 'POST', path: `/hr/payroll/${id}/close` }),
    reopenPayroll: (id: string, reason: string) =>
      call<PayrollRunDto>({ method: 'POST', path: `/hr/payroll/${id}/reopen`, body: { reason } }),
    setPayrollPayment: (
      runId: string,
      lineId: string,
      status: PayrollPaymentStatus,
    ) =>
      call<PayrollLineDto>({
        method: 'PATCH',
        path: `/hr/payroll/${runId}/lines/${lineId}/payment`,
        body: { status },
      }),
    dashboard: () => call<HrDashboardDto>({ method: 'GET', path: '/hr/dashboard' }),
    settings: () => call<HrSettingsDto>({ method: 'GET', path: '/hr/settings' }),
    updateSettings: (body: HrSettingsUpdateInput) =>
      call<HrSettingsDto>({ method: 'PATCH', path: '/hr/settings', body }),
  },

  settings: {
    get: () => call<SettingsDto>({ method: 'GET', path: '/settings' }),
    update: (body: SettingsUpdateInput) =>
      call<SettingsDto>({ method: 'PATCH', path: '/settings', body }),
  },

  users: {
    list: (params: ListParams) =>
      call<Paginated<UserDto>>({ method: 'GET', path: '/users', query: params }),
    create: (body: CreateUserBody) => call<UserDto>({ method: 'POST', path: '/users', body }),
    update: (id: string, body: UpdateUserBody) =>
      call<UserDto>({ method: 'PATCH', path: `/users/${id}`, body }),
    resetPassword: (id: string, newPassword: string) =>
      call<void>({
        method: 'POST',
        path: `/users/${id}/reset-password`,
        body: { newPassword, mustChangePassword: true },
      }),
    deactivate: (id: string) => call<void>({ method: 'DELETE', path: `/users/${id}` }),
  },

  audit: {
    list: (params: ListParams) =>
      call<Paginated<AuditEntryDto>>({ method: 'GET', path: '/audit', query: params }),
  },
};

export type { PaymentMethod };
