/**
 * Roles and permission model for the Corner Pizza restaurant POS.
 *
 * The permission matrix is shared by the API server (authorisation middleware),
 * the Electron main process and the renderer (navigation/button visibility).
 * The server always re-checks permissions; renderer checks are cosmetic.
 */

export const ROLES = ['ADMIN', 'CASHIER', 'KITCHEN_STAFF', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // dashboard & reporting
  'dashboard:view',
  'reports:view',
  'reports:financial',
  'reports:export',
  // menu
  'menu:read',
  'menu:write',
  'menu:delete',
  'toppings:manage',
  'discounts:apply',
  'discounts:manage',
  // orders & invoices
  'orders:read',
  'orders:read:own',
  'orders:create',
  'orders:update',
  'orders:cancel',
  'refunds:create',
  'invoices:read',
  'invoices:print',
  // kitchen display
  'kitchen:view',
  'kitchen:update',
  // customers
  'customers:read',
  'customers:write',
  // inventory & recipes
  'inventory:read',
  'inventory:write',
  'inventory:adjust',
  'recipes:read',
  'recipes:write',
  'purchasing:read',
  'purchasing:write',
  'purchasing:receive',
  'alerts:manage',
  'stocktakes:manage',
  'transfers:manage',
  // human resources
  'hr:read',
  'hr:write',
  'hr:payroll',
  // cash drawer & shifts
  'shifts:view',
  'shifts:manage',
  // tables & delivery
  'tables:view',
  'tables:manage',
  'delivery:view',
  'delivery:update',
  'delivery:manage',
  'delivery:zones',
  'settlements:view',
  'settlements:manage',
  // administration
  'users:manage',
  'settings:manage',
  'branches:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Cashiers can sell and look up customers, but never touch the menu, inventory,
 * financial reports, users or settings.
 */
export const CASHIER_PERMISSIONS: readonly Permission[] = [
  'menu:read',
  'orders:read:own',
  'orders:create',
  'orders:update',
  'discounts:apply',
  'invoices:read',
  'invoices:print',
  'customers:read',
  'customers:write',
  'tables:view',
  'tables:manage',
  'delivery:view',
  'delivery:manage',
  'settlements:view',
  'settlements:manage',
  'shifts:view',
  'shifts:manage',
];

/**
 * Kitchen staff only see the kitchen board. The dedicated DTO deliberately
 * omits prices, payment details and customer contact information.
 */
export const KITCHEN_STAFF_PERMISSIONS: readonly Permission[] = [
  'kitchen:view',
  'kitchen:update',
];

/** Drivers only see their own dispatch queue and settlement history. */
export const DRIVER_PERMISSIONS: readonly Permission[] = [
  'delivery:view',
  'delivery:update',
  'settlements:view',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  KITCHEN_STAFF: KITCHEN_STAFF_PERMISSIONS,
  DRIVER: DRIVER_PERMISSIONS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === 'ADMIN') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAllPermissions(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  CASHIER: 'Cashier',
  KITCHEN_STAFF: 'Kitchen staff',
  DRIVER: 'Delivery driver',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Full control of the restaurant, menu, inventory and financial reports.',
  CASHIER: 'Runs the register, creates orders, takes payments and prints receipts.',
  KITCHEN_STAFF: 'Works the kitchen board and advances order preparation status.',
  DRIVER: 'Handles assigned deliveries and settles cash at the end of the shift.',
};
