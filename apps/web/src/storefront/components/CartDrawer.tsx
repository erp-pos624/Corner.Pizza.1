import { ArrowRight, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useMenu } from '../lib/menu';
import { cartCount, useCart } from '../store/cart';
import { useCartDrawer } from '../store/cart-drawer';
import { FulfillmentToggle, Totals, useQuote } from './OrderSummary';
import { MealImage, Notice, QuantityStepper, cx } from './ui';

/** Slide-over cart: the single place a customer reviews and checks out. */
export function CartDrawer(): ReactElement {
  const { t } = useI18n();
  const open = useCartDrawer((state) => state.open);
  const closeDrawer = useCartDrawer((state) => state.closeDrawer);
  const lines = useCart((state) => state.lines);
  const fulfillment = useCart((state) => state.fulfillment);
  const setQuantity = useCart((state) => state.setQuantity);
  const remove = useCart((state) => state.remove);
  const { menu, branch } = useMenu();
  const quote = useQuote(open ? branch?.id : undefined);

  const [rendered, setRendered] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    // Keep the panel mounted long enough to finish sliding out.
    const timer = window.setTimeout(() => setRendered(false), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      restoreFocus.current?.focus();
    };
  }, [open, closeDrawer]);

  const count = cartCount(lines);
  const currency = quote.data?.currency ?? menu?.currency ?? 'EGP';
  const closed = menu ? !menu.acceptingOrders : false;

  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex justify-end p-0 sm:p-3',
        rendered ? 'visible' : 'invisible',
        !open && 'pointer-events-none',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      aria-hidden={!open}
    >
      <div
        className={cx(
          'absolute inset-0 bg-scrim/60 backdrop-blur-sm transition-opacity duration-300 ease-out',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <section
        data-state={open ? 'open' : 'closed'}
        className="cart-drawer relative flex h-full w-full max-w-[27rem] flex-col overflow-hidden bg-forest ring-1 ring-line transition-transform duration-300 ease-out sm:max-w-[26rem] sm:rounded-[26px]"
      >
        <header className="relative shrink-0 px-5 pb-4 pt-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 end-2 h-44 w-44 rounded-full bg-gold/10 blur-3xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                {t('cart.title')}
              </p>
              <h2 id="cart-drawer-title" className="display mt-1.5 text-3xl">
                {t('cart.heading')}
              </h2>
              {count > 0 ? (
                <p className="mt-1 text-sm text-cream-faint" aria-live="polite">
                  {t(count === 1 ? 'common.itemOne' : 'common.itemOther', { count })}
                </p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closeDrawer}
              aria-label={t('cart.close')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="mx-5 h-px shrink-0 bg-gradient-to-r from-line/0 via-line to-line/0" />

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 pb-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-forest-2 text-gold">
              <ShoppingBag className="h-7 w-7" strokeWidth={1.5} />
            </span>
            <h3 className="display mt-6 text-2xl">{t('cart.emptyTitle')}</h3>
            <p className="mt-2 max-w-[30ch] text-sm text-cream-dim">{t('cart.emptyBody')}</p>
            <Link to="/meals" onClick={closeDrawer} className="btn-primary mt-6">
              {t('cart.browse')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto overscroll-contain px-5">
              {lines.map((line, index) => {
                // Quote lines come back in the order the cart was sent.
                const priced = quote.data?.lines[index];
                const matches = priced?.menuItemId === line.menuItemId;
                return (
                  <li key={line.key} className="flex gap-3.5 py-4">
                    <Link
                      to={`/meals/${line.menuItemId}`}
                      onClick={closeDrawer}
                      className="shrink-0"
                      tabIndex={-1}
                    >
                      <MealImage src={line.imageUrl} alt="" className="h-16 w-16 rounded-2xl" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-semibold leading-snug">
                            <Link
                              to={`/meals/${line.menuItemId}`}
                              onClick={closeDrawer}
                              className="hover:text-gold-soft"
                            >
                              {line.name}
                            </Link>
                          </h3>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-cream-faint">
                            {[line.sizeName, ...line.toppingNames].filter(Boolean).join(' · ') ||
                              t('cart.standard')}
                          </p>
                          {line.specialInstructions ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-cream-faint">
                              “{line.specialInstructions}”
                            </p>
                          ) : null}
                        </div>
                        <p className="price shrink-0 text-sm font-semibold">
                          {matches ? (
                            formatMoney(priced.lineTotal, currency)
                          ) : (
                            <span className="skeleton inline-block h-4 w-14 align-middle" />
                          )}
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <QuantityStepper
                          size="sm"
                          value={line.quantity}
                          onChange={(value) => setQuantity(line.key, value)}
                          label={t('cart.quantityAria', { name: line.name })}
                        />
                        <button
                          type="button"
                          onClick={() => remove(line.key)}
                          aria-label={t('cart.removeAria', { name: line.name })}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-cream-faint transition duration-200 ease-out hover:bg-forest-3 hover:text-tomato"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <footer className="shrink-0 border-t border-line/80 bg-forest-2/70 px-5 pb-5 pt-4 backdrop-blur">
              <FulfillmentToggle />
              <div className="mt-4">
                <Totals quote={quote.data} loading={quote.isFetching} fulfillment={fulfillment} />
              </div>
              {quote.error ? (
                <div className="mt-3">
                  <Notice>{errorMessage(quote.error)}</Notice>
                </div>
              ) : null}
              {closed ? (
                <div className="mt-3">
                  <Notice tone="info">{t('cart.closed')}</Notice>
                </div>
              ) : null}
              {closed || quote.error ? (
                <button type="button" disabled className="btn-primary mt-4 h-12 w-full text-base">
                  {t('cart.checkout')}
                </button>
              ) : (
                <Link
                  to="/checkout"
                  onClick={closeDrawer}
                  className="btn-primary mt-4 h-12 w-full text-base"
                >
                  {t('cart.checkout')}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              )}
              <button type="button" onClick={closeDrawer} className="btn-quiet mt-1.5 w-full">
                {t('cart.addMore')}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
