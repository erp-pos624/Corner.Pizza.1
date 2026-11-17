import { Flame, Plus, Search, X } from 'lucide-react';
import type { ReactElement, RefObject } from 'react';
import type { CategoryDto, MenuItemDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EmptyPanel } from '../ui/states';
import { resolveImageUrl } from '../../lib/images';
import { formatMoney, formatNumber, menuKindLabel } from '../../lib/format';
import { itemPrice } from '../../lib/pos';
import { cn } from '../../lib/utils';
import { useI18n } from '../../i18n';

interface ProductBrowserProps {
  searchRef: RefObject<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  categories: Array<CategoryDto & { count: number }>;
  itemCount: number;
  categoryId: string;
  onCategoryChange: (id: string) => void;
  filteredItems: MenuItemDto[];
  selectedId: string | null;
  onSelectItem: (item: MenuItemDto) => void;
  onReset: () => void;
}

export function ProductBrowser({
  searchRef,
  search,
  onSearchChange,
  categories,
  itemCount,
  categoryId,
  onCategoryChange,
  filteredItems,
  selectedId,
  onSelectItem,
  onReset,
}: ProductBrowserProps): ReactElement {
  const { t } = useI18n();

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('pos.search.placeholder')}
              className="h-10 ps-9"
              aria-label={t('pos.search.aria')}
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label={t('pos.search.clear')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <CategoryChip
            active={categoryId === 'all'}
            label={t('pos.allMenu')}
            count={itemCount}
            onClick={() => onCategoryChange('all')}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              active={categoryId === category.id}
              label={category.name}
              count={category.count}
              onClick={() => onCategoryChange(category.id)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filteredItems.length === 0 ? (
          <EmptyPanel
            title={t('pos.empty.title')}
            message={t('pos.empty.message')}
            action={
              <Button variant="outline" size="sm" onClick={onReset}>
                {t('pos.empty.reset')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {filteredItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                active={selectedId === item.id}
                onClick={() => onSelectItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn('numeric text-[10px]', active ? 'opacity-70' : 'text-muted-foreground/70')}
      >
        {formatNumber(count)}
      </span>
    </button>
  );
}

function ProductCard({
  item,
  active,
  onClick,
}: {
  item: MenuItemDto;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  const { t } = useI18n();
  const image = resolveImageUrl(item.imageUrl);
  const soldOut = item.isSoldOut || !item.isAvailable;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soldOut}
      title={item.soldOutReason ?? undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-start transition-all',
        active
          ? 'border-secondary ring-2 ring-secondary/20'
          : 'border-border hover:-translate-y-0.5 hover:border-secondary/40 hover:shadow-card',
        soldOut && 'opacity-55',
      )}
    >
      <div className="relative h-24 w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent">
            <Flame className="h-7 w-7 text-secondary/40" />
          </div>
        )}
        {item.isFeatured ? (
          <span className="absolute start-1.5 top-1.5 rounded-full bg-brand-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#15301f] shadow">
            {t('pos.product.featured')}
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
            {t('pos.product.soldOut')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug">{item.name}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{menuKindLabel(item.kind)}</p>
        <div className="mt-auto flex items-baseline justify-between gap-1 pt-1.5">
          <span className="numeric text-[12px] font-bold">
            {item.hasSizes
              ? t('pos.product.from', { price: formatMoney(itemPrice(item)) })
              : formatMoney(item.basePrice)}
          </span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary/10 text-secondary opacity-0 transition-opacity group-hover:opacity-100">
            <Plus className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}
