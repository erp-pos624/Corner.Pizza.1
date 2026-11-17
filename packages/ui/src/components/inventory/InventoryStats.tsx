import { ArrowDownUp, Boxes, PackagePlus, Truck } from 'lucide-react';
import type { ReactElement } from 'react';
import { formatDecimal, formatMoney } from '../../lib/format';
import { useI18n } from '../../i18n';
import { StatCard } from '../ui/stat-card';

interface InventoryStatsProps {
  ingredientCount: number;
  lowCount: number;
  stockValue: number;
  supplierCount: number;
}

export function InventoryStats({
  ingredientCount,
  lowCount,
  stockValue,
  supplierCount,
}: InventoryStatsProps): ReactElement {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t('inventory.stats.ingredients')}
        value={formatDecimal(ingredientCount, 0)}
        icon={<Boxes className="h-4 w-4" />}
        hint={t('inventory.stats.ingredientsHint')}
        tone="blue"
      />
      <StatCard
        label={t('inventory.stats.lowStock')}
        value={formatDecimal(lowCount, 0)}
        icon={<ArrowDownUp className="h-4 w-4" />}
        hint={t('inventory.stats.lowStockHint')}
        tone={lowCount > 0 ? 'orange' : 'green'}
      />
      <StatCard
        label={t('inventory.stats.stockValue')}
        value={formatMoney(stockValue)}
        icon={<PackagePlus className="h-4 w-4" />}
        hint={t('inventory.stats.stockValueHint')}
        tone="green"
      />
      <StatCard
        label={t('inventory.stats.suppliers')}
        value={formatDecimal(supplierCount, 0)}
        icon={<Truck className="h-4 w-4" />}
        hint={t('inventory.stats.suppliersHint')}
        tone="amber"
      />
    </div>
  );
}
