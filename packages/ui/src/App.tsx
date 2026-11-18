import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Permission, Role } from '@posshope/shared';
import { AppShell, NAV_GROUPS, type PageKey } from './components/layout/AppShell';
import { OfflineScreen } from './components/OfflineScreen';
import { PizzaLoader } from './components/layout/PizzaLoader';
import { Toaster } from './components/ui/toast';
import { useI18n } from './i18n';
import { getBridge, hasBridge } from './lib/bridge';
import { useBranchScopeStore } from './store/branch';
import { useLanguageStore } from './store/language';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { useAuthStore } from './store/auth';

// Pages are split into their own chunks and fetched on first visit, so the
// sign-in screen does not pay for the whole application.
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DeliveryPage = lazy(() =>
  import('./pages/DeliveryPage').then((m) => ({ default: m.DeliveryPage })),
);
const BranchesPage = lazy(() =>
  import('./pages/BranchesPage').then((m) => ({ default: m.BranchesPage })),
);
const PosPage = lazy(() => import('./pages/PosPage').then((m) => ({ default: m.PosPage })));
const OrdersPage = lazy(() =>
  import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const KitchenPage = lazy(() =>
  import('./pages/KitchenPage').then((m) => ({ default: m.KitchenPage })),
);
const InvoicesPage = lazy(() =>
  import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })),
);
const MenuPage = lazy(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const RecipesPage = lazy(() =>
  import('./pages/RecipesPage').then((m) => ({ default: m.RecipesPage })),
);
const StoresPage = lazy(() =>
  import('./pages/StoresPage').then((m) => ({ default: m.StoresPage })),
);
const PurchasingPage = lazy(() =>
  import('./pages/PurchasingPage').then((m) => ({ default: m.PurchasingPage })),
);
const SuppliersPage = lazy(() =>
  import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const StockAlertsPage = lazy(() =>
  import('./pages/StockAlertsPage').then((m) => ({ default: m.StockAlertsPage })),
);
const InventoryReportsPage = lazy(() =>
  import('./pages/InventoryReportsPage').then((m) => ({ default: m.InventoryReportsPage })),
);
const CustomersPage = lazy(() =>
  import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const OnlineStorePage = lazy(() =>
  import('./pages/OnlineStorePage').then((m) => ({ default: m.OnlineStorePage })),
);
const StorefrontPage = lazy(() =>
  import('./pages/StorefrontPage').then((m) => ({ default: m.StorefrontPage })),
);
const HrDashboardPage = lazy(() =>
  import('./pages/HrDashboardPage').then((m) => ({ default: m.HrDashboardPage })),
);
const EmployeesPage = lazy(() =>
  import('./pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
);
const AttendancePage = lazy(() =>
  import('./pages/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const AdjustmentsPage = lazy(() =>
  import('./pages/AdjustmentsPage').then((m) => ({ default: m.AdjustmentsPage })),
);
const PayrollPage = lazy(() =>
  import('./pages/PayrollPage').then((m) => ({ default: m.PayrollPage })),
);
const SalaryHistoryPage = lazy(() =>
  import('./pages/SalaryHistoryPage').then((m) => ({ default: m.SalaryHistoryPage })),
);
const HrSettingsPage = lazy(() =>
  import('./pages/HrSettingsPage').then((m) => ({ default: m.HrSettingsPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const ExpensesPage = lazy(() =>
  import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })),
);
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const ShiftsPage = lazy(() =>
  import('./pages/ShiftsPage').then((m) => ({ default: m.ShiftsPage })),
);
const TablesPage = lazy(() =>
  import('./pages/TablesPage').then((m) => ({ default: m.TablesPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: { retry: 0 },
  },
});

function defaultPageFor(role: string | undefined): PageKey {
  if (role === 'KITCHEN_STAFF') return 'kitchen';
  if (role === 'DRIVER') return 'delivery';
  return role === 'ADMIN' ? 'dashboard' : 'pos';
}

function isPageAllowed(
  page: PageKey,
  role: string | undefined,
  can: (permission: Permission) => boolean,
): boolean {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.key === page);
    if (!item) continue;
    if (item.roles && (!role || !item.roles.includes(role as Role))) return false;
    if (role !== 'ADMIN' && item.adminOnly) return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  }
  return false;
}

function Splash(): ReactElement {
  const { t } = useI18n();
  return <PizzaLoader title={t('auth.splash.title')} subtitle={t('auth.splash.subtitle')} />;
}

/** Shown inside the shell while a page chunk is being fetched. */
function PageFallback(): ReactElement {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-busy="true">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-secondary" />
    </div>
  );
}

function BridgeMissing(): ReactElement {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-white">
          <Flame className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold">{t('auth.bridgeMissing.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth.bridgeMissing.message')}</p>
      </div>
    </div>
  );
}

/**
 * Dynamic content is localized by the API, so every cached query must refetch
 * when the language changes. The first render is skipped to avoid a duplicate
 * fetch on start-up.
 */
function LanguageQuerySync(): null {
  const language = useLanguageStore((state) => state.language);
  const queryClient = useQueryClient();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void queryClient.invalidateQueries();
  }, [language, queryClient]);

  return null;
}

/**
 * Switching the admin branch scope changes every branch-scoped query, so the
 * cache is cleared the same way it is on a language change.
 */
function BranchScopeSync(): null {
  const scope = useBranchScopeStore((state) => state.scope);
  const queryClient = useQueryClient();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void queryClient.invalidateQueries();
  }, [scope, queryClient]);

  return null;
}

const BOOT_SPLASH_MS = 900;
const ENTRY_SPLASH_MS = 1200;
const ENTRY_FADE_MS = 240;

export interface RootProps {
  /**
   * `memory` keeps the current page in component state (desktop window).
   * `url` mirrors it in the address bar so the web client gets real links,
   * reload-safe pages and working back/forward buttons.
   */
  routing?: 'memory' | 'url';
}

const PAGE_KEYS: readonly PageKey[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);

/** `onlineStore` -> `/online-store` */
function pathForPage(page: PageKey): string {
  return `/${page.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function pageFromLocation(): PageKey | null {
  const segment = window.location.pathname.split('/').filter(Boolean)[0];
  if (!segment) return null;
  return PAGE_KEYS.find((key) => pathForPage(key) === `/${segment}`) ?? null;
}

function Shell({ routing }: Required<RootProps>): ReactElement {
  const urlRouting = routing === 'url';
  const { t } = useI18n();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const can = useAuthStore((state) => state.can);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const applySession = useAuthStore((state) => state.applySession);
  const bridgeAvailable = useMemo(() => hasBridge(), []);
  const [page, setPage] = useState<PageKey | null>(null);
  const [bootVisible, setBootVisible] = useState(true);
  const [entryPhase, setEntryPhase] = useState<'hidden' | 'visible' | 'leaving'>('hidden');
  const previousStatus = useRef(status);

  useEffect(() => {
    const timer = window.setTimeout(() => setBootVisible(false), BOOT_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setEntryPhase('hidden');
      previousStatus.current = status;
      return;
    }
    if (previousStatus.current === 'authenticated') return;
    setEntryPhase('visible');
    previousStatus.current = status;
    const hold = window.setTimeout(() => setEntryPhase('leaving'), ENTRY_SPLASH_MS);
    const done = window.setTimeout(() => setEntryPhase('hidden'), ENTRY_SPLASH_MS + ENTRY_FADE_MS);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(done);
    };
  }, [status]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    void bootstrap();
    const bridge = getBridge();
    return bridge.auth.onChange(applySession);
  }, [bridgeAvailable, bootstrap, applySession]);

  useEffect(() => {
    if (!user) {
      setPage(null);
      return;
    }
    setPage((current) => {
      if (current && isPageAllowed(current, user.role, can)) return current;
      const requested = urlRouting ? pageFromLocation() : null;
      if (requested && isPageAllowed(requested, user.role, can)) return requested;
      return defaultPageFor(user.role);
    });
  }, [user, can, urlRouting]);

  // URL routing: keep the address bar and the active page in step.
  const urlSynced = useRef(false);
  useEffect(() => {
    if (!urlRouting || !page) return;
    const path = pathForPage(page);
    if (window.location.pathname !== path) {
      // The first sync corrects the landing URL; later ones are navigations.
      if (urlSynced.current) window.history.pushState(null, '', path);
      else window.history.replaceState(null, '', path);
    }
    urlSynced.current = true;
  }, [page, urlRouting]);

  useEffect(() => {
    if (!urlRouting || !user) return;
    const onPopState = (): void => {
      const requested = pageFromLocation();
      if (requested && isPageAllowed(requested, user.role, can)) setPage(requested);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [urlRouting, user, can]);

  useEffect(() => {
    if (status === 'anonymous') queryClient.clear();
  }, [status]);

  if (!bridgeAvailable) return <BridgeMissing />;
  if (status === 'loading' || bootVisible) return <Splash />;
  if (status === 'anonymous' || !user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage />;
  if (!page) return <Splash />;

  const navigate = (next: PageKey): void => {
    if (isPageAllowed(next, user.role, can)) setPage(next);
  };
  const firstName = user.fullName.split(' ').filter(Boolean)[0] ?? user.fullName;

  return (
    <>
      <AppShell page={page} onNavigate={navigate}>
        <Suspense fallback={<PageFallback />}>
          {page === 'dashboard' ? <DashboardPage onNavigate={navigate} /> : null}
          {page === 'pos' ? <PosPage onNavigate={navigate} /> : null}
          {page === 'tables' ? <TablesPage onNavigate={navigate} /> : null}
          {page === 'orders' ? <OrdersPage /> : null}
          {page === 'kitchen' ? <KitchenPage /> : null}
          {page === 'delivery' ? <DeliveryPage /> : null}
          {page === 'invoices' ? <InvoicesPage /> : null}
          {page === 'menu' ? <MenuPage /> : null}
          {page === 'inventory' ? <InventoryPage /> : null}
          {page === 'recipes' ? <RecipesPage /> : null}
          {page === 'stores' ? <StoresPage /> : null}
          {page === 'purchasing' ? <PurchasingPage /> : null}
          {page === 'suppliers' ? <SuppliersPage /> : null}
          {page === 'alerts' ? <StockAlertsPage /> : null}
          {page === 'inventoryReports' ? <InventoryReportsPage /> : null}
          {page === 'customers' ? <CustomersPage /> : null}
          {page === 'onlineStore' ? <OnlineStorePage /> : null}
          {page === 'storefront' ? <StorefrontPage /> : null}
          {page === 'hrDashboard' ? <HrDashboardPage onNavigate={navigate} /> : null}
          {page === 'employees' ? <EmployeesPage /> : null}
          {page === 'attendance' ? <AttendancePage /> : null}
          {page === 'adjustments' ? <AdjustmentsPage /> : null}
          {page === 'payroll' ? <PayrollPage /> : null}
          {page === 'salaryHistory' ? <SalaryHistoryPage /> : null}
          {page === 'hrSettings' ? <HrSettingsPage /> : null}
          {page === 'reports' ? <ReportsPage /> : null}
          {page === 'expenses' ? <ExpensesPage /> : null}
          {page === 'users' ? <UsersPage /> : null}
          {page === 'branches' ? <BranchesPage /> : null}
          {page === 'shifts' ? <ShiftsPage /> : null}
          {page === 'settings' ? <SettingsPage /> : null}
        </Suspense>
      </AppShell>
      {entryPhase !== 'hidden' ? (
        <PizzaLoader
          overlay
          leaving={entryPhase === 'leaving'}
          title={t('auth.splash.entryTitle')}
          subtitle={t('auth.splash.entrySubtitle', { name: firstName })}
        />
      ) : null}
    </>
  );
}

export function Root({ routing = 'memory' }: RootProps = {}): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageQuerySync />
      <BranchScopeSync />
      <Shell routing={routing} />
      <Toaster />
      <OfflineScreen />
    </QueryClientProvider>
  );
}
