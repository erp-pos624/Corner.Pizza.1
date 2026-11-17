import type { PublicMenuItemDto } from '@posshope/shared';
import { Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { formatMoney, startingPrice } from '../lib/format';
import { useCart } from '../store/cart';
import { MealImage } from './ui';

/**
 * One meal. Items without sizes go straight into the cart; anything with a
 * choice to make opens its page instead of guessing a size for the customer.
 */
export function MealCard({
  item,
  categoryName,
  currency,
  canOrder,
}: {
  item: PublicMenuItemDto;
  categoryName?: string;
  currency: string;
  canOrder: boolean;
}): ReactElement {
  const { t } = useI18n();
  const add = useCart((state) => state.add);
  const navigate = useNavigate();
  const price = startingPrice(item);
  const needsChoice = item.hasSizes || item.kind === 'PIZZA';
  const href = `/meals/${item.id}`;

  const quickAdd = (): void => {
    if (needsChoice) {
      navigate(href);
      return;
    }
    add({
      menuItemId: item.id,
      sizeId: null,
      toppingIds: [],
      quantity: 1,
      specialInstructions: '',
      name: item.name,
      sizeName: null,
      toppingNames: [],
      imageUrl: item.imageUrl,
    });
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card bg-forest-2 transition duration-300 ease-out hover:bg-forest-3">
      <Link to={href} className="block overflow-hidden" aria-label={item.name} tabIndex={-1}>
        <MealImage
          src={item.imageUrl}
          alt=""
          className={`aspect-[4/3] w-full transition duration-500 ease-out group-hover:scale-[1.04] ${
            item.isSoldOut ? 'opacity-40 grayscale' : ''
          }`}
        />
      </Link>
      {item.isSoldOut ? (
        <span className="absolute start-3 top-3 rounded-full bg-scrim/85 px-3 py-1 text-xs font-semibold text-onmedia">
          {t('card.soldOut')}
        </span>
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        {categoryName ? <p className="text-xs text-cream-faint">{categoryName}</p> : null}
        <h3 className="mt-0.5 text-[17px] font-semibold leading-snug">
          <Link to={href} className="after:absolute after:inset-0">
            {item.name}
          </Link>
        </h3>
        {item.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-cream-dim">{item.description}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="price text-[15px] font-semibold text-cream">
            {price.from ? <span className="font-normal text-cream-faint">{t('home.from')}</span> : null}
            {formatMoney(price.amount, currency)}
          </p>
          <button
            type="button"
            onClick={quickAdd}
            disabled={item.isSoldOut || !canOrder}
            className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-brick text-onmedia transition duration-200 ease-out hover:bg-brick-deep disabled:cursor-not-allowed disabled:bg-forest-3 disabled:text-cream-faint"
            aria-label={
              item.isSoldOut
                ? t('card.soldOutAria', { name: item.name })
                : needsChoice
                  ? t('card.chooseAria', { name: item.name })
                  : t('card.addAria', { name: item.name })
            }
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function MealCardSkeleton(): ReactElement {
  return (
    <div className="overflow-hidden rounded-card bg-forest-2" aria-hidden="true">
      <div className="skeleton aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-1/3" />
      </div>
    </div>
  );
}
