import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { ToppingDto } from '@posshope/shared';
import type { MenuManagement } from '../../hooks/useMenuManagement';
import { api } from '../../lib/api';
import { formatDecimal, formatMoney, unitLabel } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { Toggle } from '../ui/toggle';

interface ToppingsTabProps {
  menu: MenuManagement;
  onAdd: () => void;
  onEdit: (topping: ToppingDto) => void;
}

export function ToppingsTab({ menu, onAdd, onEdit }: ToppingsTabProps): ReactElement {
  const { t } = useI18n();
  const { toppings, ingredients, toggleTopping, requestDelete } = menu;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {toppings.isLoading ? (
        <SkeletonTable
          label={t('menu.loading.toppings')}
          rows={6}
          columns={[
            { kind: 'text', label: t('menu.columns.topping') },
            { kind: 'amount', label: t('menu.columns.price') },
            { kind: 'muted', label: t('menu.columns.ingredientLink') },
            { kind: 'muted', label: t('menu.columns.deduction') },
            { kind: 'toggle', label: t('menu.columns.status') },
            { kind: 'actions' },
          ]}
        />
      ) : toppings.isError ? (
        <ErrorState
          title={t('menu.errors.toppings')}
          message={toppings.error instanceof Error ? toppings.error.message : undefined}
          onRetry={() => void toppings.refetch()}
        />
      ) : (toppings.data ?? []).length === 0 ? (
        <EmptyPanel
          title={t('menu.empty.toppings')}
          action={
            <Button size="sm" onClick={onAdd}>
              {t('menu.add.topping')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.topping')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">{t('menu.columns.price')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.ingredientLink')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.deduction')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.status')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {toppings.data!.map((topping) => {
                const ingredient = ingredients.data?.items.find(
                  (row) => row.id === topping.ingredientId,
                );
                return (
                  <tr
                    key={topping.id}
                    className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5 font-semibold">{topping.name}</td>
                    <td className="numeric px-3 py-2.5 text-end">{formatMoney(topping.price)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {ingredient
                        ? `${ingredient.name} (${unitLabel(ingredient.unit)})`
                        : t('menu.topping.notLinked')}
                    </td>
                    <td className="numeric px-3 py-2.5 text-xs">
                      {ingredient && topping.ingredientQuantity > 0
                        ? `${formatDecimal(topping.ingredientQuantity, 3)} ${unitLabel(ingredient.unit)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <Toggle
                        checked={topping.isAvailable}
                        onChange={() => toggleTopping.mutate(topping)}
                        label={
                          topping.isAvailable
                            ? t('menu.topping.availableBadge')
                            : t('menu.topping.hidden')
                        }
                        disabled={toggleTopping.isPending}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(topping)}
                          aria-label={t('menu.item.edit', { name: topping.name })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            requestDelete({
                              title: t('menu.topping.deleteTitle', { name: topping.name }),
                              description: t('menu.topping.deleteDescription'),
                              label: t('menu.topping.deleteLabel'),
                              run: () => api.menu.removeTopping(topping.id),
                            })
                          }
                          aria-label={t('menu.item.delete', { name: topping.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
