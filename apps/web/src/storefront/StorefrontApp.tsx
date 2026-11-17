import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrandIntro } from '@posshope/ui/brand-intro';
import { useEffect, useRef, type ReactElement } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui';
import { applyCustomerLanguage, useI18n, useStorefrontLanguage } from './i18n';
import {
  AccountLayout,
  AccountOrderPage,
  AccountOrdersPage,
  AddressesPage,
  ProfilePage,
  RequireAccount,
} from './pages/Account';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/Auth';
import { CheckoutPage } from './pages/Checkout';
import { HomePage } from './pages/Home';
import { MealDetailsPage } from './pages/MealDetails';
import { MealsPage } from './pages/Meals';
import { GuestOrderPage, TrackOrderPage } from './pages/Orders';
import { useCartDrawer } from './store/cart-drawer';
import { useSession } from './store/session';
import { applyCustomerTheme, useStorefrontTheme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function NotFound(): ReactElement {
  const { t } = useI18n();
  return (
    <div className="page">
      <EmptyState
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={
          <Link to="/meals" className="btn-primary">
            {t('notFound.seeMenu')}
          </Link>
        }
      />
    </div>
  );
}

/** `/cart` has no page of its own: open the drawer and land on the menu. */
function CartRedirect(): null {
  const openDrawer = useCartDrawer((state) => state.openDrawer);
  const navigate = useNavigate();
  useEffect(() => {
    openDrawer();
    navigate('/meals', { replace: true });
  }, [navigate, openDrawer]);
  return null;
}

export function StorefrontApp(): ReactElement {
  const bootstrap = useSession((state) => state.bootstrap);
  const language = useStorefrontLanguage((state) => state.language);
  const theme = useStorefrontTheme((state) => state.theme);
  const { t } = useI18n();
  const appliedLanguage = useRef(language);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // The staff dashboard shares this document and may have left its own
    // language, theme and metadata behind.
    const changed = appliedLanguage.current !== language;
    appliedLanguage.current = language;
    applyCustomerLanguage(language);
    applyCustomerTheme(theme);
    document.title = t('meta.title');
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'index, follow');
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', t('meta.description'));
    // Menu names, branch hours and delivery quotes are localized by the API,
    // so switching language has to refetch whatever is already on screen.
    if (changed) void queryClient.invalidateQueries();
  }, [language, theme, t]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="storefront min-h-screen">
        <BrandIntro />
        <Routes>
          <Route element={<Layout />}>
            {/* Public: browsing, cart, checkout and guest tracking need no account. */}
            <Route index element={<HomePage />} />
            <Route path="meals" element={<MealsPage />} />
            <Route path="meals/:id" element={<MealDetailsPage />} />
            <Route path="categories/:slug" element={<MealsPage />} />
            <Route path="cart" element={<CartRedirect />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="orders/:orderNumber" element={<GuestOrderPage />} />
            <Route path="track" element={<TrackOrderPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />

            {/* Customer: guarded here for convenience, enforced by the API. */}
            <Route element={<RequireAccount />}>
              <Route path="account/orders/:orderNumber" element={<AccountOrderPage />} />
              <Route path="account" element={<AccountLayout />}>
                <Route index element={<ProfilePage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="orders" element={<AccountOrdersPage />} />
                <Route path="addresses" element={<AddressesPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </div>
    </QueryClientProvider>
  );
}
