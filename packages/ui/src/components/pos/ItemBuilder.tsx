import { Check, Flame, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { MenuItemDto, ToppingDto } from '@posshope/shared';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/input';
import { formatMoney, formatNumber, menuKindLabel } from '../../lib/format';
import { resolveImageUrl } from '../../lib/images';
import { itemPrice } from '../../lib/pos';
import { cn } from '../../lib/utils';
import { useI18n } from '../../i18n';

interface ItemBuilderProps {
  items: MenuItemDto[];
  selected: MenuItemDto | null;
  editing: boolean;
  toppings: ToppingDto[];
  sizeId: string | null;
  onSizeChange: (id: string) => void;
  toppingIds: string[];
  onToggleTopping: (topping: ToppingDto) => void;
  quantity: number;
  onQuantityChange: (next: number) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  customizeTotal: number;
  onAddToCart: () => void;
  onReset: () => void;
  onChooseItem: (item: MenuItemDto) => void;
}

export function ItemBuilder({
  items,
  selected,
  editing,
  toppings,
  sizeId,
  onSizeChange,
  toppingIds,
  onToggleTopping,
  quantity,
  onQuantityChange,
  instructions,
  onInstructionsChange,
  customizeTotal,
  onAddToCart,
  onReset,
  onChooseItem,
}: ItemBuilderProps): ReactElement {
  const { t } = useI18n();
  const selectedImage = resolveImageUrl(selected?.imageUrl);
  const featured = items
    .filter((item) => item.isFeatured && item.isAvailable && !item.isSoldOut)
    .slice(0, 4);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {editing
              ? t('pos.builder.edit')
              : selected
                ? t('pos.builder.customise')
                : t('pos.builder.build')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selected ? selected.name : t('pos.builder.pick')}
          </p>
        </div>
        {selected ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            aria-label={t('pos.builder.clearSelection')}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
              <Flame className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t('pos.start.title')}</p>
              <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                {t('pos.start.message')}
              </p>
            </div>
            {featured.length > 0 ? (
              <div className="w-full space-y-2 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('pos.start.featured')}
                </p>
                {featured.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChooseItem(item)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-start text-xs hover:border-secondary/40 hover:bg-secondary/5"
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="numeric shrink-0 font-semibold">
                      {formatMoney(itemPrice(item))}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3">
              {selectedImage ? (
                <img
                  src={selectedImage}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <Flame className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{selected.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {menuKindLabel(selected.kind)} ·{' '}
                  {t('pos.prepTime', { minutes: selected.prepMinutes })}
                </p>
                {selected.description ? (
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                    {selected.description}
                  </p>
                ) : null}
              </div>
            </div>

            {selected.hasSizes ? (
              <div className="space-y-2">
                <p className="th-label">{t('pos.chooseSize')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {selected.sizes.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => onSizeChange(size.id)}
                      className={cn(
                        'rounded-lg border p-2.5 text-start transition-colors',
                        sizeId === size.id
                          ? 'border-secondary bg-secondary/5 ring-1 ring-secondary/30'
                          : 'border-border hover:border-secondary/40',
                      )}
                    >
                      <span className="block text-xs font-semibold">{size.name}</span>
                      <span className="numeric mt-0.5 block text-sm font-bold">
                        {formatMoney(size.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {toppings.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="th-label">{t('pos.toppings.title')}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {t('pos.toppings.selected', { count: formatNumber(toppingIds.length) })}
                  </span>
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                  {toppings.map((topping) => {
                    const active = toppingIds.includes(topping.id);
                    return (
                      <button
                        key={topping.id}
                        type="button"
                        onClick={() => onToggleTopping(topping)}
                        disabled={!topping.isAvailable}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-start text-xs transition-colors disabled:opacity-40',
                          active
                            ? 'border-secondary/50 bg-secondary/5'
                            : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            active ? 'border-secondary bg-secondary text-white' : 'border-input',
                          )}
                        >
                          {active ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{topping.name}</span>
                        <span className="numeric shrink-0 text-muted-foreground">
                          +{formatMoney(topping.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="th-label">{t('pos.quantity')}</p>
                <div className="mt-1.5 inline-flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => onQuantityChange(Math.max(quantity - 1, 1))}
                    className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                    disabled={quantity <= 1}
                    aria-label={t('pos.decreaseQuantity')}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="numeric w-9 text-center text-sm font-bold">
                    {formatNumber(quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(Math.min(quantity + 1, 99))}
                    className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted"
                    aria-label={t('pos.increaseQuantity')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-end">
                <p className="th-label">{t('pos.lineTotal')}</p>
                <p className="numeric mt-1 text-lg font-bold">{formatMoney(customizeTotal)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="special-instructions">{t('pos.kitchenNotes')}</Label>
              <Textarea
                id="special-instructions"
                value={instructions}
                onChange={(event) => onInstructionsChange(event.target.value)}
                placeholder={t('pos.kitchenNotesPlaceholder')}
                maxLength={300}
                className="min-h-[64px]"
              />
            </div>

            <Button className="w-full" size="lg" onClick={onAddToCart}>
              <ShoppingBag className="h-4 w-4" />
              {editing ? t('pos.saveChanges') : t('pos.addToCart')} · {formatMoney(customizeTotal)}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
