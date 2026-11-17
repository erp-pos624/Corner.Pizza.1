import { ArrowRightLeft, Store } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { BranchesTab } from '../components/branches/BranchesTab';
import { TransfersTab } from '../components/branches/TransfersTab';
import { useI18n, type TranslationKey } from '../i18n';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

type BranchesTabKey = 'branches' | 'transfers';

const TABS: Array<{ key: BranchesTabKey; labelKey: TranslationKey; icon: typeof Store }> = [
  { key: 'branches', labelKey: 'branches.tabs.branches', icon: Store },
  { key: 'transfers', labelKey: 'branches.tabs.transfers', icon: ArrowRightLeft },
];

export function BranchesPage(): ReactElement {
  const { t } = useI18n();
  const canTransfers = useAuthStore((state) => state.can('transfers:manage'));
  const [tab, setTab] = useState<BranchesTabKey>('branches');

  const tabs = TABS.filter((entry) => entry.key !== 'transfers' || canTransfers);

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {tabs.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === entry.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(entry.labelKey)}
            </button>
          );
        })}
      </div>

      {tab === 'branches' ? <BranchesTab /> : null}
      {tab === 'transfers' && canTransfers ? <TransfersTab /> : null}
    </div>
  );
}
