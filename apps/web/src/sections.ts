/**
 * First URL segment of every staff screen. Keep in sync with `NAV_GROUPS` in
 * `packages/ui/src/components/layout/AppShell.tsx`.
 */
const MANAGEMENT_ROOTS = new Set([
  'dashboard',
  'pos',
  'tables',
  'orders',
  'kitchen',
  'delivery',
  'invoices',
  'menu',
  'inventory',
  'recipes',
  'stores',
  'purchasing',
  'suppliers',
  'alerts',
  'inventory-reports',
  'customers',
  'online-store',
  'hr-dashboard',
  'employees',
  'attendance',
  'adjustments',
  'payroll',
  'salary-history',
  'hr-settings',
  'reports',
  'expenses',
  'users',
  'branches',
  'shifts',
  'settings',
]);

/**
 * The customer site owns `/` and every nested customer route. Staff screens are
 * single-segment paths: `/orders` is the staff board, while `/orders/:number`
 * is the customer's order lookup.
 */
export function isManagementPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 1 && MANAGEMENT_ROOTS.has(segments[0] ?? '');
}
