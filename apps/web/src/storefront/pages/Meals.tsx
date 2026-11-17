import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MealCard, MealCardSkeleton } from '../components/MealCard';
import { EmptyState, Notice, PageHeading, cx } from '../components/ui';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';
import { errorMessage } from '../lib/api';
import { slugify, startingPrice } from '../lib/format';
import { useMenu } from '../lib/menu';

type Sort = 'menu' | 'popular' | 'price-asc' | 'price-desc' | 'name';

const SORTS: Array<{ value: Sort; labelKey: MessageKey }> = [
  { value: 'menu', labelKey: 'menu.sortMenu' },
  { value: 'popular', labelKey: 'menu.sortPopular' },
  { value: 'price-asc', labelKey: 'menu.sortPriceAsc' },
  { value: 'price-desc', labelKey: 'menu.sortPriceDesc' },
  { value: 'name', labelKey: 'menu.sortName' },
];

/** `/meals` and `/categories/:slug` — the whole menu with search, filter and sort. */
export function MealsPage(): ReactElement {
  const { t } = useI18n();
  const { menu, isLoading, error } = useMenu();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as Sort | null) ?? 'menu';
  const hideSoldOut = params.get('available') === '1';

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const categories = useMemo(
    () =>
      (menu?.categories ?? []).filter((category) =>
        menu?.items.some((item) => item.categoryId === category.id),
      ),
    [menu],
  );
  const active = categories.find((category) => slugify(category.nameEn) === slug) ?? null;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const position = Math.abs(track.scrollLeft);
    setEdges({ prev: position > 2, next: position < max - 2 });
  }, []);

  useEffect(() => {
    updateEdges();
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateEdges, categories.length]);

  const stepCategories = (direction: 1 | -1): void => {
    const track = trackRef.current;
    if (!track) return;
    const first = track.firstElementChild as HTMLElement | null;
    const amount = (first?.offsetWidth ?? 96) + 8;
    const rtl = getComputedStyle(track).direction === 'rtl';
    track.scrollBy({ left: (rtl ? -1 : 1) * direction * amount, behavior: 'smooth' });
  };

  const items = useMemo(() => {
    if (!menu) return [];
    const needle = query.trim().toLowerCase();
    const rank = new Map(menu.popularItemIds.map((id, index) => [id, index]));
    const filtered = menu.items.filter((item) => {
      if (active && item.categoryId !== active.id) return false;
      if (hideSoldOut && item.isSoldOut) return false;
      if (!needle) return true;
      return [item.name, item.nameEn, item.nameAr, item.description, ...item.ingredients]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(needle));
    });
    const price = (index: number): number => Number(startingPrice(filtered[index]!).amount);
    const order = filtered.map((_, index) => index);
    if (sort === 'price-asc') order.sort((a, b) => price(a) - price(b));
    if (sort === 'price-desc') order.sort((a, b) => price(b) - price(a));
    if (sort === 'name') order.sort((a, b) => filtered[a]!.name.localeCompare(filtered[b]!.name));
    if (sort === 'popular') {
      order.sort(
        (a, b) => (rank.get(filtered[a]!.id) ?? 999) - (rank.get(filtered[b]!.id) ?? 999),
      );
    }
    return order.map((index) => filtered[index]!);
  }, [menu, active, query, sort, hideSoldOut]);

  const goCategory = (target: string | null): void => {
    const search = params.toString();
    navigate(
      { pathname: target ? `/categories/${target}` : '/meals', search: search ? `?${search}` : '' },
      { replace: true },
    );
  };

  const chip = (selected: boolean): string =>
    cx(
      'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 ease-out',
      selected
        ? 'border-brick bg-brick text-onmedia'
        : 'border-line text-cream-dim hover:border-cream-faint hover:text-cream',
    );

  return (
    <div className="page">
      <PageHeading
        title={active ? active.name : t('menu.title')}
        lead={active?.description ?? t('menu.lead')}
      />

      <div className="sticky top-[68px] z-30 -mx-4 border-b border-line bg-forest/95 px-4 pb-4 pt-1 backdrop-blur-sm sm:mx-0 sm:px-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <label htmlFor="menu-search" className="sr-only">
              {t('menu.searchLabel')}
            </label>
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(event) => setParam('q', event.target.value || null)}
              placeholder={t('menu.searchPlaceholder')}
              className="field rounded-full ps-11 pe-11"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setParam('q', null)}
                className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-cream-faint hover:text-cream"
                aria-label={t('menu.clearSearch')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="menu-sort" className="sr-only">
              {t('menu.sortLabel')}
            </label>
            <select
              id="menu-sort"
              value={sort}
              onChange={(event) =>
                setParam('sort', event.target.value === 'menu' ? null : event.target.value)
              }
              className="field w-auto rounded-full py-2.5 pe-10"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-cream-dim">
              <input
                type="checkbox"
                checked={hideSoldOut}
                onChange={(event) => setParam('available', event.target.checked ? '1' : null)}
                className="h-4 w-4 accent-brick"
              />
              {t('menu.hideSoldOut')}
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div
            ref={trackRef}
            onScroll={updateEdges}
            className="-ms-4 flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth px-4 sm:ms-0 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label={t('menu.categories')}
          >
            <button type="button" className={chip(!active)} onClick={() => goCategory(null)}>
              {t('menu.everything')}
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={chip(active?.id === category.id)}
                aria-pressed={active?.id === category.id}
                onClick={() => goCategory(slugify(category.nameEn))}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepCategories(-1)}
              disabled={!edges.prev}
              aria-label={t('menu.prevCategories')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => stepCategories(1)}
              disabled={!edges.next}
              aria-label={t('menu.nextCategories')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4 rtl:-scale-x-100" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-8">
        {error ? <Notice>{errorMessage(error)}</Notice> : null}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <MealCardSkeleton key={index} />
            ))}
          </div>
        ) : items.length === 0 && !error ? (
          <EmptyState
            title={t('menu.emptyTitle')}
            body={
              query ? t('menu.emptyQuery', { query }) : t('menu.emptyBody')
            }
            action={
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setParams(new URLSearchParams(), { replace: true });
                  navigate('/meals', { replace: true });
                }}
              >
                {t('menu.showAll')}
              </button>
            }
          />
        ) : (
          <>
            <p className="mb-5 text-sm text-cream-faint" aria-live="polite">
              {t(items.length === 1 ? 'common.itemOne' : 'common.itemOther', {
                count: items.length,
              })}
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MealCard
                  key={item.id}
                  item={item}
                  currency={menu!.currency}
                  canOrder={menu!.acceptingOrders}
                  categoryName={active ? undefined : categoryNames.get(item.categoryId)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
