import { Pencil, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { SupplierDto } from '@posshope/shared';
import type { InventoryManagement } from '../../hooks/useInventoryManagement';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { Button } from '../ui/button';
import { SkeletonTable } from '../ui/skeleton';
import { EmptyPanel, ErrorState } from '../ui/states';
import { StatusBadge } from '../ui/status-badge';

interface SuppliersTabProps {
  inventory: InventoryManagement;
  onAdd: () => void;
  onEdit: (supplier: SupplierDto) => void;
}

export function SuppliersTab({ inventory, onAdd, onEdit }: SuppliersTabProps): ReactElement {
  const { t } = useI18n();
  const { suppliers, requestDelete } = inventory;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {suppliers.isLoading ? (
        <SkeletonTable
          label={t('inventory.loading.suppliers')}
          rows={6}
          columns={[
            { kind: 'double', label: t('inventory.columns.supplier') },
            { kind: 'muted', label: t('inventory.columns.phone') },
            { kind: 'muted', label: t('inventory.columns.email') },
            { kind: 'muted', label: t('inventory.columns.address') },
            { kind: 'badge', label: t('inventory.columns.status') },
            { kind: 'actions' },
          ]}
        />
      ) : suppliers.isError ? (
        <ErrorState
          title={t('inventory.errors.suppliers')}
          message={suppliers.error instanceof Error ? suppliers.error.message : undefined}
          onRetry={() => void suppliers.refetch()}
        />
      ) : (suppliers.data?.items ?? []).length === 0 ? (
        <EmptyPanel
          title={t('inventory.empty.suppliers')}
          message={t('inventory.empty.suppliersMessage')}
          action={
            <Button size="sm" onClick={onAdd}>
              {t('inventory.actions.newSupplier')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.supplier')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.phone')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.email')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.address')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('inventory.columns.status')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {suppliers.data!.items.map((row: SupplierDto) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{row.name}</p>
                    {row.notes ? (
                      <p className="max-w-[240px] truncate text-[11px] text-muted-foreground">
                        {row.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="numeric px-3 py-2.5 text-xs">{row.phone ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{row.email ?? '—'}</td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {row.address ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      tone={row.isActive ? 'green' : 'neutral'}
                      label={
                        row.isActive ? t('inventory.badges.active') : t('inventory.badges.inactive')
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(row)}
                        aria-label={t('inventory.actions.edit', { name: row.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          requestDelete({
                            title: t('inventory.delete.supplierTitle', { name: row.name }),
                            description: t('inventory.delete.supplierDescription'),
                            label: t('inventory.delete.supplierLabel'),
                            run: () => api.suppliers.remove(row.id),
                          })
                        }
                        aria-label={t('inventory.actions.delete', { name: row.name })}
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
