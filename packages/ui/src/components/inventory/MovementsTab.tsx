import type { ReactElement } from 'react';
import {
  INVENTORY_MOVEMENT_TYPES,
  type InventoryMovementDto,
  type InventoryMovementType,
} from '@posshope/shared';
import type { InventoryManagement } from '../../hooks/useInventoryManagement';
import { formatDateTime, formatDecimal, movementLabel, unitLabel } from '../../lib/format';
import { cn } from '../../lib/utils';
import { useI18n } from '../../i18n';
import { Input, Select } from '../ui/input';
import { Label } from '../ui/label';
import { Pagination } from '../ui/pagination';
import { Skeleton, SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';

export function MovementsTab({ inventory }: { inventory: InventoryManagement }): ReactElement {
  const { t } = useI18n();
  const {
    movements,
    allIngredients,
    movementIngredient,
    setMovementIngredient,
    movementType,
    setMovementType,
    movementFrom,
    setMovementFrom,
    movementTo,
    setMovementTo,
    setMovementPage,
  } = inventory;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
        <div>
          <Label
            htmlFor="movement-ingredient"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {t('inventory.filters.ingredient')}
          </Label>
          <Select
            id="movement-ingredient"
            value={movementIngredient}
            onChange={(event) => setMovementIngredient(event.target.value)}
            className="mt-1 h-9 w-[200px]"
          >
            <option value="">{t('inventory.filters.allIngredients')}</option>
            {(allIngredients.data?.items ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label
            htmlFor="movement-type"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {t('inventory.filters.movement')}
          </Label>
          <Select
            id="movement-type"
            value={movementType}
            onChange={(event) => setMovementType(event.target.value as InventoryMovementType | '')}
            className="mt-1 h-9 w-[190px]"
          >
            <option value="">{t('inventory.filters.allMovements')}</option>
            {INVENTORY_MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {movementLabel(type)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label
            htmlFor="movement-from"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {t('inventory.filters.from')}
          </Label>
          <Input
            id="movement-from"
            type="date"
            value={movementFrom}
            onChange={(event) => setMovementFrom(event.target.value)}
            className="mt-1 h-9 w-[150px]"
          />
        </div>
        <div>
          <Label
            htmlFor="movement-to"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {t('inventory.filters.to')}
          </Label>
          <Input
            id="movement-to"
            type="date"
            value={movementTo}
            onChange={(event) => setMovementTo(event.target.value)}
            className="mt-1 h-9 w-[150px]"
          />
        </div>
        {movements.data ? (
          <span className="mb-2 ms-auto text-xs text-muted-foreground">
            {t('inventory.filters.count', { count: formatDecimal(movements.data.total, 0) })}
          </span>
        ) : (
          <Skeleton className="mb-2 ms-auto h-3 w-24" />
        )}
      </div>

      {movements.isLoading ? (
        <SkeletonTable
          label={t('inventory.loading.movements')}
          rows={8}
          columns={[
            { kind: 'muted', label: t('inventory.columns.date') },
            { kind: 'text', label: t('inventory.columns.ingredient') },
            { kind: 'badge', label: t('inventory.columns.movement') },
            { kind: 'amount', label: t('inventory.columns.quantity') },
            { kind: 'muted', label: t('inventory.columns.reference') },
            { kind: 'muted', label: t('inventory.columns.by') },
            { kind: 'muted', label: t('inventory.columns.note') },
          ]}
        />
      ) : movements.isError ? (
        <div className="p-4">
          <ErrorState
            title={t('inventory.errors.movements')}
            message={movements.error instanceof Error ? movements.error.message : undefined}
            onRetry={() => void movements.refetch()}
          />
        </div>
      ) : movements.data && movements.data.items.length === 0 ? (
        <EmptyPanel
          title={t('inventory.empty.movements')}
          message={t('inventory.empty.movementsMessage')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.date')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.ingredient')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.movement')}</th>
                <th className="px-3 py-2.5 text-end font-semibold">
                  {t('inventory.columns.quantity')}
                </th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.reference')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.by')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.note')}</th>
              </tr>
            </thead>
            <tbody>
              {movements.data!.items.map((row: InventoryMovementDto) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{row.ingredientName}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      tone={
                        row.type === 'SALE_DEDUCTION'
                          ? 'orange'
                          : row.type === 'PURCHASE'
                            ? 'green'
                            : row.type === 'WASTE'
                              ? 'red'
                              : 'neutral'
                      }
                      label={movementLabel(row.type)}
                      dot={false}
                    />
                  </td>
                  <td
                    className={cn(
                      'numeric px-3 py-2.5 text-end font-semibold',
                      row.quantity > 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {row.quantity > 0 ? '+' : ''}
                    {formatDecimal(row.quantity, 3)}{' '}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {unitLabel(row.unit)}
                    </span>
                  </td>
                  <td className="numeric px-3 py-2.5 text-[11px] text-muted-foreground">
                    {row.reference ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.userName ?? t('inventory.system')}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {row.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movements.data && movements.data.total > 0 ? (
        <Pagination
          page={movements.data.page}
          pageSize={movements.data.pageSize}
          total={movements.data.total}
          totalPages={movements.data.totalPages}
          onPageChange={setMovementPage}
        />
      ) : null}
    </div>
  );
}
