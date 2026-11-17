import { Check, ChevronLeft, Clock, ShoppingBag } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MealCard } from '../components/MealCard';
import { EmptyState, MealImage, Notice, QuantityStepper, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { formatMoney, slugify } from '../lib/format';
import { useMenu } from '../lib/menu';
import { useCart } from '../store/cart';
import { useCartDrawer } from '../store/cart-drawer';

export function MealDetailsPage(): ReactElement {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { menu, isLoading, error } = useMenu();
  const add = useCart((state) => state.add);
  const openDrawer = useCartDrawer((state) => state.openDrawer);

  const item = menu?.items.find((candidate) => candidate.id === id) ?? null;
  const category = menu?.categories.find((candidate) => candidate.id === item?.categoryId);

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [toppingIds, setToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setSizeId(item?.sizes.find((size) => size.isDefault)?.id ?? item?.sizes[0]?.id ?? null);
    setToppingIds([]);
    setQuantity(1);
    setNote('');
    setAdded(false);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="page grid gap-10 py-10 lg:grid-cols-2">
        <div className="skeleton aspect-square w-full rounded-card" />
        <div className="space-y-5">
          <div className="skeleton h-12 w-3/4" />
          <div className="skeleton h-5 w-full" />
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page py-10">
        <Notice>{errorMessage(error)}</Notice>
      </div>
    );
  }

  if (!item || !menu) {
    return (
      <div className="page">
        <EmptyState
          title={t('meal.offMenuTitle')}
          body={t('meal.offMenuBody')}
          action={
            <Link to="/meals" className="btn-primary">
              {t('meal.seeMenu')}
            </Link>
          }
        />
      </div>
    );
  }

  const size = item.sizes.find((candidate) => candidate.id === sizeId) ?? null;
  const toppings = menu.toppings.filter((topping) => toppingIds.includes(topping.id));
  // An on-screen estimate from the menu's own prices; the cart re-prices on the server.
  const unit =
    Number(item.hasSizes ? (size?.price ?? 0) : item.basePrice) +
    toppings.reduce((sum, topping) => sum + Number(topping.price), 0);
  const canOrder = menu.acceptingOrders && !item.isSoldOut;
  const related = menu.items
    .filter((other) => other.categoryId === item.categoryId && other.id !== item.id)
    .slice(0, 4);

  const toggleTopping = (toppingId: string): void =>
    setToppingIds((current) =>
      current.includes(toppingId)
        ? current.filter((value) => value !== toppingId)
        : [...current, toppingId],
    );

  const addToCart = (): void => {
    add({
      menuItemId: item.id,
      sizeId: item.hasSizes ? sizeId : null,
      toppingIds,
      quantity,
      specialInstructions: note,
      name: item.name,
      sizeName: size?.name ?? null,
      toppingNames: toppings.map((topping) => topping.name),
      imageUrl: item.imageUrl,
    });
    setAdded(true);
  };

  return (
    <div className="page pb-28 pt-6 lg:pb-0">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/meals'))}
        className="btn-quiet -ms-3"
      >
        <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
        {t('meal.back')}
      </button>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <MealImage
            src={item.imageUrl}
            alt={item.name}
            eager
            className={cx(
              'aspect-square w-full rounded-card',
              item.isSoldOut && 'opacity-50 grayscale',
            )}
          />
        </div>

        <div>
          {category ? (
            <Link
              to={`/categories/${slugify(category.nameEn)}`}
              className="text-sm text-cream-faint hover:text-cream"
            >
              {category.name}
            </Link>
          ) : null}
          <h1 className="display mt-1 text-4xl sm:text-5xl">{item.name}</h1>
          {item.description ? (
            <p className="mt-4 max-w-[60ch] text-lg text-cream-dim">{item.description}</p>
          ) : null}
          <p className="mt-4 flex items-center gap-2 text-sm text-cream-faint">
            <Clock className="h-4 w-4" />
            {t('meal.prepMinutes', { minutes: item.prepMinutes })}
          </p>

          {item.isSoldOut ? (
            <div className="mt-6">
              <Notice tone="info">
                {t('meal.soldOutSuffix', { reason: item.soldOutReason ?? t('meal.soldOut') })}
              </Notice>
            </div>
          ) : null}

          {item.hasSizes ? (
            <fieldset className="mt-9">
              <legend className="text-lg font-semibold">{t('meal.size')}</legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {item.sizes.map((option) => {
                  const selected = option.id === sizeId;
                  return (
                    <label
                      key={option.id}
                      className={cx(
                        'cursor-pointer rounded-xl border px-4 py-3 transition duration-200 ease-out focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
                        selected
                          ? 'border-brick bg-brick/10'
                          : 'border-line hover:border-cream-faint',
                      )}
                    >
                      <input
                        type="radio"
                        name="size"
                        className="sr-only"
                        checked={selected}
                        onChange={() => setSizeId(option.id)}
                      />
                      <span className="block font-semibold">{option.name}</span>
                      <span className="price block text-sm text-cream-dim">
                        {formatMoney(option.price, menu.currency)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <p className="price mt-8 text-2xl font-semibold">
              {formatMoney(item.basePrice, menu.currency)}
            </p>
          )}

          {menu.toppings.length > 0 ? (
            <fieldset className="mt-9">
              <legend className="text-lg font-semibold">{t('meal.addOnTop')}</legend>
              <p className="mt-1 text-sm text-cream-faint">{t('meal.addOnTopHint')}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {menu.toppings.map((topping) => {
                  const selected = toppingIds.includes(topping.id);
                  return (
                    <label
                      key={topping.id}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition duration-200 ease-out focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold',
                        selected
                          ? 'border-brick bg-brick/10'
                          : 'border-line hover:border-cream-faint',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleTopping(topping.id)}
                      />
                      <span
                        className={cx(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          selected ? 'border-brick bg-brick text-onmedia' : 'border-cream-faint',
                        )}
                        aria-hidden="true"
                      >
                        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{topping.name}</span>
                      <span className="price text-sm text-cream-dim">
                        +{formatMoney(topping.price, menu.currency)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="mt-9">
            <label htmlFor="note" className="text-lg font-semibold">
              {t('meal.noteLabel')}
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 300))}
              rows={2}
              placeholder={t('meal.notePlaceholder')}
              className="field mt-3 resize-none"
            />
          </div>

          {item.ingredients.length > 0 ? (
            <div className="mt-9">
              <h2 className="text-lg font-semibold">{t('meal.ingredientsTitle')}</h2>
              <p className="mt-2 text-cream-dim">{item.ingredients.join(', ')}.</p>
            </div>
          ) : null}

          {/* Add bar: inline on desktop, pinned to the bottom of the screen on phones. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-forest/95 px-4 py-3 backdrop-blur-sm lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-page items-center gap-3">
              <QuantityStepper value={quantity} onChange={setQuantity} label={t('meal.quantity')} />
              <button
                type="button"
                onClick={addToCart}
                disabled={!canOrder || (item.hasSizes && !size)}
                className="btn-primary h-12 flex-1 whitespace-nowrap px-4 text-[15px] sm:text-base"
              >
                <ShoppingBag className="hidden h-4 w-4 sm:block" />
                {item.isSoldOut
                  ? t('meal.soldOut')
                  : !menu.acceptingOrders
                    ? t('meal.orderingClosed')
                    : t('meal.addWithPrice', { price: formatMoney(unit * quantity, menu.currency) })}
              </button>
            </div>
            {added ? (
              <p
                className="mx-auto mt-2 flex max-w-page items-center gap-2 text-sm text-basil"
                role="status"
              >
                <Check className="h-4 w-4" />
                {t('meal.added')}{' '}
                <button type="button" onClick={openDrawer} className="link">
                  {t('meal.goToCart')}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="pt-20">
          <h2 className="display mb-7 text-3xl">
            {t('meal.moreFrom', { category: category?.name ?? t('menu.title') })}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((other) => (
              <MealCard
                key={other.id}
                item={other}
                currency={menu.currency}
                canOrder={menu.acceptingOrders}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
