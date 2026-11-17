import { create } from 'zustand';
import {
  ALL_BRANCHES,
  getActiveBranchScope,
  setActiveBranchScope,
} from '../lib/branch-scope';

interface BranchScopeState {
  scope: string;
  setScope: (scope: string) => void;
}

export const useBranchScopeStore = create<BranchScopeState>((set) => ({
  scope: getActiveBranchScope() ?? ALL_BRANCHES,
  setScope: (scope) => {
    setActiveBranchScope(scope);
    set({ scope });
  },
}));
