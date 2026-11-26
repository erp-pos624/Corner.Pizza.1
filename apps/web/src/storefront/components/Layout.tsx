import { Clock, Mail, MapPin, Menu as MenuIcon, Phone, ShoppingBag, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import logo from '../assets/corner-logo.svg';
import { useI18n } from '../i18n';
import { formatOpeningHours } from '../lib/format';
import { useActiveBranch, usePublicSettings } from '../lib/menu';
import { cartCount, useCart } from '../store/cart';
import { useCartDrawer } from '../store/cart-drawer';
import { useSession } from '../store/session';
import { CartDrawer } from './CartDrawer';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { cx } from './ui';

function Brand(): ReactElement {
  const { t } = useI18n();
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label={t('brand.home')}>
      <img src={logo} alt="" className="h-11 w-11 shrink-0" />
      {/* Brand lockup as approved by the client; the branch address shown
          elsewhere still comes from the official branch data. */}
      <span className="min-w-0 leading-none" dir="ltr">
        <span className="display block whitespace-nowrap text-xl uppercase tracking-[0.06em] sm:text-2xl">
          Corner Pizza
        </span>
        <span className="mt-0.5 block whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
          Eastcourt Rehab 2
        </span>
      </span>
    </Link>
  );
}

function CartButton(): ReactElement {
  const { t } = useI18n();
  const count = useCart((state) => cartCount(state.lines));
  const open = useCartDrawer((state) => state.open);
  const openDrawer = useCartDrawer((state) => state.openDrawer);
  const previous = useRef(count);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (count > previous.current) {
      setBump(true);
      const timer = window.setTimeout(() => setBump(false), 350);
      previous.current = count;
      return () => window.clearTimeout(timer);
    }
    previous.current = count;
  }, [count]);

  const ariaLabel =
    count === 0
      ? t('cart.ariaEmpty')
      : count === 1
        ? t('cart.ariaOne')
        : t('cart.ariaMany', { count });

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="relative flex h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-semibold transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3"
    >
      <ShoppingBag className="h-[18px] w-[18px]" />
      <span className="hidden sm:inline">{t('cart.title')}</span>
      {count > 0 ? (
        <span
          className={cx(
            'price flex h-6 min-w-6 items-center justify-center rounded-full bg-brick px-1.5 text-xs font-bold text-onmedia',
            bump && 'animate-bump',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Header(): ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const status = useSession((state) => state.status);
  const customer = useSession((state) => state.customer);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const accountHref = status === 'signed-in' ? '/account' : '/login';
  const accountLabel =
    status === 'signed-in'
      ? (customer?.name.split(' ')[0] ?? t('account.myAccount'))
      : t('account.signIn');
  const nav = [
    { to: '/meals', label: t('nav.menu') },
    { to: '/track', label: t('nav.track') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-forest/95 backdrop-blur-sm">
      <div className="page flex h-[68px] items-center gap-4">
        <Brand />
        <nav className="ms-6 hidden items-center gap-1 md:flex" aria-label={t('nav.main')}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  'rounded-full px-4 py-2 text-[15px] font-medium transition duration-200 ease-out',
                  isActive ? 'bg-forest-3 text-cream' : 'text-cream-dim hover:text-cream',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to={accountHref}
            className="hidden h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-cream-dim transition duration-200 ease-out hover:bg-forest-3 hover:text-cream sm:flex"
          >
            <User className="h-[18px] w-[18px]" />
            {accountLabel}
          </Link>
          <CartButton />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('header.closeMenu') : t('header.openMenu')}
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" className="border-t border-line md:hidden" aria-label={t('nav.mobile')}>
          <div className="page flex flex-col py-3">
            {[...nav, { to: accountHref, label: accountLabel }].map((item) => (
              <Link key={item.to} to={item.to} className="py-3 text-lg font-medium">
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function ClosedBanner(): ReactElement | null {
  const { t } = useI18n();
  const { branch } = useActiveBranch();
  if (!branch || branch.acceptingOrders) return null;
  const reason =
    branch.closedReason === 'OUTSIDE_HOURS'
      ? t('closed.outsideHours', {
          hours: formatOpeningHours(branch.onlineOpenTime, branch.onlineCloseTime, t),
        })
      : t('closed.off');
  return (
    <div className="border-b border-line bg-forest-3 py-2.5 text-center text-sm text-cream-dim" role="status">
      <span className="page block">{reason}</span>
    </div>
  );
}

function Footer(): ReactElement {
  const { t } = useI18n();
  const { branch } = useActiveBranch();
  const { settings } = usePublicSettings();
  const openDrawer = useCartDrawer((state) => state.openDrawer);
  const branchName = branch ? (branch.name.split('—').pop() ?? branch.name).trim() : null;
  // Dashboard Settings hold the restaurant's contact details; the active
  // branch is only a fallback for installations that fill branches instead.
  const address = settings?.address ?? branch?.address ?? null;
  const phone = settings?.phone ?? branch?.phone ?? null;
  const email = settings?.email ?? null;

  return (
    <footer className="mt-24 border-t border-line bg-forest-2">
      <div className="page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Brand />
          <p className="mt-5 max-w-[38ch] text-cream-dim">
            {branchName ? t('footer.taglineBranch', { branch: branchName }) : t('footer.tagline')}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-cream">{t('footer.order')}</h2>
          <ul className="mt-4 space-y-2.5 text-cream-dim">
            <li>
              <Link to="/meals" className="hover:text-cream">
                {t('footer.fullMenu')}
              </Link>
            </li>
            <li>
              <button type="button" onClick={openDrawer} className="hover:text-cream">
                {t('footer.cart')}
              </button>
            </li>
            <li>
              <Link to="/track" className="hover:text-cream">
                {t('footer.track')}
              </Link>
            </li>
            <li>
              <Link to="/account" className="hover:text-cream">
                {t('footer.account')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-cream">{t('footer.findUs')}</h2>
          {address || phone || email || branch ? (
            <ul className="mt-4 space-y-3 text-cream-dim">
              {address ? (
                <li className="flex gap-3">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-gold" />
                  <span>{address}</span>
                </li>
              ) : null}
              {phone ? (
                <li className="flex gap-3">
                  <Phone className="mt-1 h-4 w-4 shrink-0 text-gold" />
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-cream">
                    {phone}
                  </a>
                </li>
              ) : null}
              {email ? (
                <li className="flex gap-3">
                  <Mail className="mt-1 h-4 w-4 shrink-0 text-gold" />
                  <a href={`mailto:${email}`} className="break-all hover:text-cream" dir="ltr">
                    {email}
                  </a>
                </li>
              ) : null}
              {branch ? (
                <li className="flex gap-3">
                  <Clock className="mt-1 h-4 w-4 shrink-0 text-gold" />
                  <span>
                    {t('footer.onlineOrders', {
                      hours: formatOpeningHours(branch.onlineOpenTime, branch.onlineCloseTime, t),
                    })}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="skeleton mt-4 h-20 w-full" />
          )}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="page flex flex-wrap items-center justify-between gap-3 py-5 text-sm text-cream-faint">
          <p>{t('footer.legal', { year: new Date().getFullYear() })}</p>
          <span className="flex flex-wrap items-center gap-4">
            <Link to="/download" className="transition duration-200 ease-out hover:text-cream">
              {t('footer.download')}
            </Link>
            <Link to="/dashboard" className="transition duration-200 ease-out hover:text-cream">
              {t('footer.staff')}
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

export function Layout(): ReactElement {
  const { t } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo.
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brick focus:px-4 focus:py-2 focus:text-onmedia"
      >
        {t('skip.content')}
      </a>
      <Header />
      <ClosedBanner />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
