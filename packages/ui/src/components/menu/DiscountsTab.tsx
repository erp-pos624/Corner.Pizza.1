import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { DiscountDto } from '@posshope/shared';
import type { MenuManagement } from '../../hooks/useMenuManagement';
import { api } from '../../lib/api';
import { formatDate, formatDecimal, formatMoney } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { Toggle } from '../ui/toggle';

interface DiscountsTabProps {
  menu: MenuManagement;
  onAdd: () => void;
  onEdit: (discount: DiscountDto) => void;
}

export function DiscountsTab({ menu, onAdd, onEdit }: DiscountsTabProps): ReactElement {
  const { t } = useI18n();
  const { discounts, toggleDiscount, requestDelete } = menu;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {discounts.isLoading ? (
        <SkeletonTable
          label={t('menu.loading.discounts')}
          rows={5}
          columns={[
            { kind: 'text', label: t('menu.columns.discount') },
            { kind: 'text', label: t('menu.columns.type') },
            { kind: 'amount', label: t('menu.columns.value') },
            { kind: 'muted', label: t('menu.columns.created') },
            { kind: 'toggle', label: t('menu.columns.status') },
            { kind: 'actions' },
          ]}
        />
      ) : discounts.isError ? (
        <ErrorState
          title={t('menu.errors.discounts')}
          message={discounts.error instanceof Error ? discounts.error.message : undefined}
          onRetry={() => void discounts.refetch()}
        />
      ) : (discounts.data ?? []).length === 0 ? (
        <EmptyPanel
          title={t('menu.empty.discounts')}
          action={
            <Button size="sm" onClick={onAdd}>
              {t('menu.add.discount')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.discount')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.type')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">{t('menu.columns.value')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.created')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('menu.columns.status')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {discounts.data!.map((discount) => (
                <tr
                  key={discount.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5 font-semibold">{discount.name}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {discount.type === 'PERCENT'
                      ? t('menu.discount.percentage')
                      : t('menu.discount.fixed')}
                  </td>
                  <td className="numeric px-3 py-2.5 text-end">
                    {discount.type === 'PERCENT'
                      ? `${formatDecimal(Number(discount.value))}%`
                      : formatMoney(discount.value)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(discount.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Toggle
                      checked={discount.isActive}
                      onChange={() => toggleDiscount.mutate(discount)}
                      label={
                        discount.isActive ? t('menu.discount.active') : t('menu.discount.inactive')
                      }
                      disabled={toggleDiscount.isPending}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(discount)}
                        aria-label={t('menu.item.edit', { name: discount.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          requestDelete({
                            title: t('menu.discount.deleteTitle', { name: discount.name }),
                            description: t('menu.discount.deleteDescription'),
                            label: t('menu.discount.deleteLabel'),
                            run: () => api.discounts.remove(discount.id),
                          })
                        }
                        aria-label={t('menu.item.delete', { name: discount.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
