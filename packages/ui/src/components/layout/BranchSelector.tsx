import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { ALL_BRANCHES } from '../../lib/branch-scope';
import { useAuthStore } from '../../store/auth';
import { useBranchScopeStore } from '../../store/branch';
import { useLanguageStore } from '../../store/language';
import { Select } from '../ui/input';

/** Admin-only header control that scopes every API request to a branch. */
export function BranchSelector(): ReactElement | null {
  const { t } = useI18n();
  const language = useLanguageStore((state) => state.language);
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const scope = useBranchScopeStore((state) => state.scope);
  const setScope = useBranchScopeStore((state) => state.setScope);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.branches.list(),
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const branchList = branches.data ?? [];

  useEffect(() => {
    if (!branches.data || scope === ALL_BRANCHES) return;
    if (!branches.data.some((branch) => branch.id === scope)) setScope(ALL_BRANCHES);
  }, [branches.data, scope, setScope]);

  if (!isAdmin) return null;

  return (
    <div className="hidden items-center gap-1.5 md:flex" title={t('branches.switcherHint')}>
      <Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select
        aria-label={t('branches.switcherAria')}
        className="h-9 w-[180px]"
        value={scope}
        onChange={(event) => setScope(event.target.value)}
      >
        <option value={ALL_BRANCHES}>{t('branches.allBranches')}</option>
        {branchList.map((branch) => (
          <option key={branch.id} value={branch.id} disabled={!branch.isActive}>
            {language === 'ar' && branch.nameAr ? branch.nameAr : branch.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
