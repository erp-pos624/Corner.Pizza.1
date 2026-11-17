/**
 * The branch scope is the branch an administrator is currently operating on.
 * It is sent with every API request; the server only honours it for ADMIN
 * accounts and falls back to the user's assigned branch for everyone else.
 */

const STORAGE_KEY = 'forno-branch-scope';

/** Consolidated view reserved for admin reports. */
export const ALL_BRANCHES = 'all';

let activeScope: string | null | undefined;

function readStoredScope(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // Storage may be unavailable in hardened contexts.
  }
  return null;
}

export function getActiveBranchScope(): string | null {
  if (activeScope === undefined) activeScope = readStoredScope() ?? ALL_BRANCHES;
  return activeScope;
}

export function setActiveBranchScope(scope: string | null): void {
  activeScope = scope;
  try {
    if (scope) window.localStorage.setItem(STORAGE_KEY, scope);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory scope still applies for this session.
  }
}
