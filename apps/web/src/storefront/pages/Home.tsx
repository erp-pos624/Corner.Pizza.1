import type {
  PublicBranchDto,
  PublicDeliveryCheckDto,
  PublicMenuItemDto,
} from '@posshope/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bike,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Flame,
  MapPin,
  Phone,
  Search,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import hero from '../assets/hero.jpg';
import { MealCard, MealCardSkeleton } from '../components/MealCard';
import { MealImage, Notice } from '../components/ui';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { formatMoney, formatOpeningHours, slugify, startingPrice } from '../lib/format';
import { useMenu, usePublicSettings } from '../lib/menu';

function useDeliveryZones(
  enabled: boolean,
  branchId: string | undefined,
  lat?: number | null,
  lng?: number | null,
) {
  return useQuery({
    queryKey: ['zones', branchId],
    queryFn: () => api.checkZone({ branchId: branchId!, lat: lat!, lng: lng! }),
    enabled: enabled && Boolean(branchId) && lat != null && lng != null,
    staleTime: 5 * 60_000,
  });
}

function Hero({
  open,
  hours,
  branchName,
  itemCount,
  spotlight,
  currency,
  deliveryFrom,
}: {
  open: boolean | null;
  hours: string | null;
  branchName: string | null;
  itemCount: number;
  spotlight: PublicMenuItemDto | null;
  currency: string;
  deliveryFrom: number | null;
}): ReactElement {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const search = (event: FormEvent): void => {
    event.preventDefault();
    navigate(query.trim() ? `/meals?q=${encodeURIComponent(query.trim())}` : '/meals');
  };

  const price = spotlight ? startingPrice(spotlight) : null;

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -start-32 -top-24 h-[30rem] w-[30rem] rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute -end-40 top-1/3 h-[34rem] w-[34rem] rounded-full bg-gold/[0.06] blur-3xl" />
      </div>

      <div className="page relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:py-24">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-forest-2/80 px-3 py-1.5 font-medium">
              <span
                className={`h-2 w-2 rounded-full ${open ? 'bg-basil' : 'bg-cream-faint'}`}
                aria-hidden="true"
              />
              {open === null
                ? t('home.checkingHours')
                : open
                  ? t('home.open')
                  : t('home.closed')}
            </span>
            {hours ? <span className="text-cream-dim">{hours}</span> : null}
            {branchName ? (
              <span className="hidden text-cream-faint sm:inline">· {branchName}</span>
            ) : null}
          </div>

          <h1 className="display mt-6 text-[clamp(3rem,7.5vw,5.5rem)]">
            {t('home.heroLine1')}
            <br />
            {t('home.heroLine2Body')}
            <br />
            <span className="text-gold">{t('home.heroLine2Accent')}</span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg text-cream-dim">{t('home.heroLead')}</p>

          <form onSubmit={search} className="mt-8 max-w-xl" role="search">
            <label htmlFor="hero-search" className="sr-only">
              {t('home.searchLabel')}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cream-faint" />
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('home.searchPlaceholder')}
                className="field h-14 rounded-full ps-12 pe-28 text-base"
              />
              <button
                type="submit"
                className="btn-primary absolute end-2 top-1/2 h-10 -translate-y-1/2 px-5"
              >
                {t('home.search')}
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to="/meals" className="btn-primary h-12 px-6 text-base">
              {t('home.orderNow')}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
            <Link to="/track" className="btn-ghost h-12 px-6">
              {t('home.track')}
            </Link>
          </div>

          <ul className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-3">
            <li className="flex items-center gap-2.5">
              <Flame className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} />
              <span className="text-sm text-cream-dim">{t('home.firedToOrder')}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} />
              <span className="text-sm text-cream-dim">{t('home.cashOrCard')}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Bike className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} />
              <span className="text-sm text-cream-dim">{t('home.deliveryPickup')}</span>
            </li>
          </ul>

          {itemCount > 0 ? (
            <p className="mt-6 text-sm text-cream-faint">
              {t('home.dishCount', { count: itemCount })}
            </p>
          ) : null}
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <div
            className="absolute inset-[7%] rounded-full bg-gold/20 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute inset-[1%] rounded-full border border-line/70"
            aria-hidden="true"
          />
          <img
            src={hero}
            alt={t('home.heroAlt')}
            className="relative h-full w-full animate-spin-in rounded-full object-cover shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]"
            // React 18 only passes the lower-case attribute through to the DOM.
            {...{ fetchpriority: 'high' }}
          />

          {spotlight && price ? (
            <Link
              to={`/meals/${spotlight.id}`}
              className="group absolute end-0 top-6 hidden w-56 rounded-card border border-line bg-forest/90 p-4 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.85)] backdrop-blur transition duration-200 ease-out hover:border-cream-faint sm:block"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cream-faint">
                {t('home.fromOven')}
              </span>
              <span className="mt-1 block line-clamp-2 font-semibold leading-snug">
                {spotlight.name}
              </span>
              <span className="mt-3 flex items-center justify-between">
                <span className="price text-sm font-semibold text-gold-soft">
                  {price.from ? t('home.from') : ''}
                  {formatMoney(price.amount, currency)}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-3 text-cream transition duration-200 ease-out group-hover:bg-brick group-hover:text-onmedia">
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              </span>
            </Link>
          ) : null}

          <div className="absolute bottom-6 start-0 hidden rounded-card border border-line bg-forest/90 p-4 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.85)] backdrop-blur sm:block">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream-faint">
              <Bike className="h-3.5 w-3.5 text-gold" /> {t('home.delivery')}
            </span>
            <span className="mt-1 block font-semibold">
              {deliveryFrom != null
                ? t('home.deliveryFeeLine', { fee: formatMoney(deliveryFrom, currency) })
                : t('home.feesAtCheckout')}
            </span>
            <span className="block text-xs text-cream-dim">
              {hours ? t('home.ordersHours', { hours }) : t('home.deliveredOrCollect')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  id,
  title,
  lead,
  href,
  linkLabel,
}: {
  id?: string;
  title: string;
  lead?: string;
  href?: string;
  linkLabel?: string;
}): ReactElement {
  const { t } = useI18n();
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h2 id={id} className="display text-3xl sm:text-4xl">
          {title}
        </h2>
        {lead ? <p className="mt-2 max-w-[56ch] text-cream-dim">{lead}</p> : null}
      </div>
      {href ? (
        <Link to={href} className="link inline-flex items-center gap-1.5 text-[15px] font-medium">
          {linkLabel ?? t('home.seeFullMenu')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </Link>
      ) : null}
    </div>
  );
}

function MealRow({
  items,
  currency,
  canOrder,
  categoryNames,
  ranked = false,
}: {
  items: PublicMenuItemDto[];
  currency: string;
  canOrder: boolean;
  categoryNames: Map<string, string>;
  ranked?: boolean;
}): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.id} className="relative">
          {ranked && index < 3 ? (
            <span
              className={`absolute start-3 top-3 z-10 rounded-full px-2.5 py-1 text-xs font-bold ${
                index === 0 ? 'bg-brick text-onmedia' : 'bg-scrim/85 text-onmedia'
              }`}
              aria-hidden="true"
            >
              #{index + 1}
            </span>
          ) : null}
          <MealCard
            item={item}
            currency={currency}
            canOrder={canOrder}
            categoryName={categoryNames.get(item.categoryId)}
          />
        </div>
      ))}
    </div>
  );
}

function CategoryStrip({
  categories,
  isLoading,
}: {
  categories: Array<{ id: string; name: string; slug: string; items: PublicMenuItemDto[] }>;
  isLoading: boolean;
}): ReactElement {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

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
  }, [updateEdges, categories.length, isLoading]);

  const step = (direction: 1 | -1): void => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const amount = (card?.offsetWidth ?? 208) + 16;
    const rtl = getComputedStyle(track).direction === 'rtl';
    track.scrollBy({ left: (rtl ? -1 : 1) * direction * amount, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!edges.prev}
          aria-label={t('home.prevCategories')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!edges.next}
          aria-label={t('home.nextCategories')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronRight className="h-5 w-5 rtl:-scale-x-100" strokeWidth={2} />
        </button>
      </div>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="-mx-4 flex gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {isLoading
          ? Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="skeleton h-36 w-44 shrink-0 rounded-card sm:w-52" />
            ))
          : categories.map(({ id, name, slug, items }) => (
              <Link
                key={id}
                to={`/categories/${slug}`}
                className="group relative h-36 w-44 shrink-0 overflow-hidden rounded-card border border-line/60 sm:h-40 sm:w-52"
              >
                <MealImage
                  src={items.find((item) => item.imageUrl)?.imageUrl ?? null}
                  alt=""
                  className="h-full w-full transition duration-500 ease-out group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/45 to-transparent" />
                <span className="absolute inset-x-4 bottom-3 text-onmedia">
                  <span className="block text-[16px] font-semibold leading-tight">{name}</span>
                  <span className="text-xs text-onmedia/70">
                    {t(items.length === 1 ? 'common.itemOne' : 'common.itemOther', {
                      count: items.length,
                    })}
                  </span>
                </span>
              </Link>
            ))}

        <Link
          to="/meals"
          className="group flex h-36 w-44 shrink-0 flex-col justify-between rounded-card border border-line bg-forest-2 p-4 transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 sm:h-40 sm:w-52"
        >
          <UtensilsCrossed className="h-6 w-6 text-gold" strokeWidth={1.75} />
          <span>
            <span className="block font-semibold">{t('home.everything')}</span>
            <span className="mt-1 flex items-center gap-1.5 text-sm text-cream-dim">
              {t('home.everythingLead')}
              <ArrowRight className="h-3.5 w-3.5 transition duration-200 ease-out group-hover:translate-x-0.5 rtl:-scale-x-100" />
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function Spotlight({
  item,
  currency,
}: {
  item: PublicMenuItemDto;
  currency: string;
}): ReactElement {
  const { t } = useI18n();
  const price = startingPrice(item);
  return (
    <section className="mt-20 border-y border-line bg-forest-2/60" aria-labelledby="spotlight-heading">
      <div className="page grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-2 lg:gap-14">
        <div className="relative overflow-hidden rounded-card border border-line">
          <MealImage
            src={item.imageUrl}
            alt={item.name}
            className="aspect-[4/3] w-full"
            eager
          />
          <span className="absolute start-4 top-4 rounded-full bg-scrim/85 px-3 py-1 text-xs font-semibold text-onmedia backdrop-blur">
            {t('home.featured')}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">
            {t('home.fromKitchen')}
          </p>
          <h2 id="spotlight-heading" className="display mt-3 text-4xl sm:text-5xl">
            {item.name}
          </h2>
          {item.description ? (
            <p className="mt-4 max-w-[52ch] text-lg text-cream-dim">{item.description}</p>
          ) : null}
          {item.ingredients.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label={t('home.ingredients')}>
              {item.ingredients.slice(0, 6).map((ingredient) => (
                <li
                  key={ingredient}
                  className="rounded-full border border-line px-3 py-1 text-sm text-cream-dim"
                >
                  {ingredient}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              to={`/meals/${item.id}`}
              className="btn-primary h-12 px-6 text-base"
            >
              {t('home.buildOrder')}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
            <span className="price text-lg font-semibold">
              {price.from ? <span className="font-normal text-cream-faint">{t('home.from')}</span> : null}
              {formatMoney(price.amount, currency)}
            </span>
            {item.prepMinutes > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-cream-faint">
                <Clock className="h-4 w-4" />
                {t('home.prepMinutes', { minutes: item.prepMinutes })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

const STEP_ICONS = [UtensilsCrossed, ChefHat, Bike];

function HowItWorks(): ReactElement {
  const { t } = useI18n();
  const steps = [
    { title: t('home.step1Title'), body: t('home.step1Body') },
    { title: t('home.step2Title'), body: t('home.step2Body') },
    { title: t('home.step3Title'), body: t('home.step3Body') },
  ];
  return (
    <section className="page pt-20" aria-labelledby="how-heading">
      <SectionHeading
        id="how-heading"
        title={t('home.howTitle')}
        lead={t('home.howLead')}
      />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map(({ title, body }, index) => {
          const Icon = STEP_ICONS[index];
          return (
            <li key={title} className="panel relative p-6">
              <span
                className="price absolute end-5 top-5 text-sm font-semibold text-cream-faint"
                aria-hidden="true"
              >
                0{index + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-[15px] text-cream-dim">{body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Fulfilment({
  zones,
  branch,
  currency,
}: {
  zones: PublicDeliveryCheckDto | undefined;
  branch: PublicBranchDto | null;
  currency: string;
}): ReactElement {
  const { t } = useI18n();
  const { settings } = usePublicSettings();
  // The restaurant's contact details live in dashboard Settings; the branch
  // record is only a fallback for installations that fill branches instead.
  const address = settings?.address ?? branch?.address ?? null;
  const phone = settings?.phone ?? branch?.phone ?? null;
  return (
    <section className="page grid gap-4 pt-20 lg:grid-cols-2" aria-label={t('home.deliveryPickup')}>
      <div className="panel flex flex-col p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Bike className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h2 className="text-2xl font-semibold">{t('home.deliveredTitle')}</h2>
        </div>
        <p className="mt-4 max-w-[52ch] text-cream-dim">{t('home.deliveredBody')}</p>
        {zones && zones.zones.length > 0 ? (
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {zones.zones.map((zone) => (
              <div key={zone.id} className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="font-medium">{zone.name}</dt>
                <dd className="price text-end text-sm text-cream-dim">
                  {t('home.deliveryFeeLine', { fee: formatMoney(zone.deliveryFee, currency) })}
                  {Number(zone.minOrderAmount) > 0
                    ? ` · ${t('home.minimumLine', {
                        amount: formatMoney(zone.minOrderAmount, currency),
                      })}`
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-6 border-y border-line py-3.5 text-sm text-cream-faint">
            {t('home.feesBeforePay')}
          </p>
        )}
      </div>

      <div className="panel flex flex-col p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Store className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h2 className="text-2xl font-semibold">{t('home.pickupTitle')}</h2>
        </div>
        <p className="mt-4 max-w-[52ch] text-cream-dim">{t('home.pickupBody')}</p>
        {address || phone || branch ? (
          <ul className="mt-6 space-y-3 border-y border-line py-3.5 text-[15px]">
            {address ? (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>{address}</span>
              </li>
            ) : null}
            {phone ? (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-cream">
                  {phone}
                </a>
              </li>
            ) : null}
            {branch ? (
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  {t('footer.onlineOrders', {
                    hours: formatOpeningHours(branch.onlineOpenTime, branch.onlineCloseTime, t),
                  })}
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
        <Link to="/meals" className="btn-primary mt-6 w-fit">
          {t('home.startOrder')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </Link>
      </div>
    </section>
  );
}

function ClosingCta(): ReactElement {
  const { t } = useI18n();
  return (
    <section className="page pt-20">
      <div className="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-forest-3 via-forest-2 to-forest px-6 py-10 sm:px-12 sm:py-14">
        <div
          className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-gold/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="display text-4xl sm:text-5xl">{t('home.hungryTitle')}</h2>
            <p className="mt-3 max-w-[46ch] text-cream-dim">{t('home.hungryBody')}</p>
          </div>
          <Link to="/meals" className="btn-primary h-12 shrink-0 px-7 text-base">
            {t('home.startOrder')}
            <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** One wrapper so the scrolling sections share the same rhythm. */
function SectionBlock({ children }: { children: ReactNode }): ReactElement {
  return <section className="page pt-16 sm:pt-20">{children}</section>;
}

export function HomePage(): ReactElement {
  const { t } = useI18n();
  const { menu, branch, isLoading, error } = useMenu();
  const zones = useDeliveryZones(
    Boolean(branch),
    branch?.id,
    branch?.latitude,
    branch?.longitude,
  );

  const items = menu?.items ?? [];
  const categoryNames = new Map((menu?.categories ?? []).map((category) => [category.id, category.name]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const featured = items.filter((item) => item.isFeatured).slice(0, 5);
  const popular = (menu?.popularItemIds ?? [])
    .map((id) => byId.get(id))
    .filter((item): item is PublicMenuItemDto => Boolean(item))
    .slice(0, 8);
  const categories = (menu?.categories ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: slugify(category.nameEn),
      items: items.filter((item) => item.categoryId === category.id),
    }))
    .filter((entry) => entry.items.length > 0);

  const canOrder = menu?.acceptingOrders ?? false;
  const currency = menu?.currency ?? 'EGP';
  const spotlight = featured[0] ?? popular[0] ?? null;
  const fees = (zones.data?.zones ?? []).map((zone) => Number(zone.deliveryFee));
  const deliveryFrom = fees.length > 0 ? Math.min(...fees) : null;

  return (
    <>
      <Hero
        open={branch ? branch.acceptingOrders : null}
        hours={
          branch
            ? formatOpeningHours(branch.onlineOpenTime, branch.onlineCloseTime, t)
            : null
        }
        branchName={branch?.name ?? null}
        itemCount={items.length}
        spotlight={spotlight}
        currency={currency}
        deliveryFrom={deliveryFrom}
      />

      {error ? (
        <div className="page pt-10">
          <Notice>{errorMessage(error)}</Notice>
        </div>
      ) : null}

      <SectionBlock>
        <SectionHeading
          id="categories-heading"
          title={t('home.startTitle')}
          lead={t('home.startLead')}
          href="/meals"
          linkLabel={t('home.openFullMenu')}
        />
        <CategoryStrip categories={categories} isLoading={isLoading} />
      </SectionBlock>

      {isLoading || popular.length > 0 ? (
        <SectionBlock>
          <SectionHeading
            title={t('home.mostTitle')}
            lead={t('home.mostLead')}
            href="/meals"
            linkLabel={t('home.seeEverything')}
          />
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <MealCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <MealRow
              items={popular}
              currency={currency}
              canOrder={canOrder}
              categoryNames={categoryNames}
              ranked
            />
          )}
        </SectionBlock>
      ) : null}

      {spotlight ? (
        <>
          <Spotlight item={spotlight} currency={currency} />
          {featured.length > 1 ? (
            <SectionBlock>
              <SectionHeading
                title={t('home.moreTitle')}
                lead={t('home.moreLead')}
                href="/meals"
                linkLabel={t('home.seeFullMenu')}
              />
              <MealRow
                items={featured.slice(1)}
                currency={currency}
                canOrder={canOrder}
                categoryNames={categoryNames}
              />
            </SectionBlock>
          ) : null}
        </>
      ) : null}

      <HowItWorks />
      <Fulfilment zones={zones.data} branch={branch} currency={currency} />
      <ClosingCta />
    </>
  );
}
