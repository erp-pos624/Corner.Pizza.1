import { create } from 'zustand';

export type StorefrontTheme = 'dark' | 'light';

const STORAGE_KEY = 'forno-customer-theme';
const THEME_COLOR: Record<StorefrontTheme, string> = {
  dark: '#0d1f14',
  light: '#fefdf9',
};

function resolveInitialTheme(): StorefrontTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Paints the document backdrop and native controls for the customer theme. */
export function applyCustomerTheme(theme: StorefrontTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.storefrontTheme = theme;
  document.body.style.backgroundColor = THEME_COLOR[theme];
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);
}

/** Runs before React paints so light-mode visitors never see a dark flash. */
export function initCustomerTheme(): void {
  applyCustomerTheme(resolveInitialTheme());
}

interface StorefrontThemeState {
  theme: StorefrontTheme;
  setTheme: (theme: StorefrontTheme) => void;
  toggle: () => void;
}

export const useStorefrontTheme = create<StorefrontThemeState>((set, get) => ({
  theme: resolveInitialTheme(),
  setTheme: (theme) => {
    if (theme === get().theme) return;
    applyCustomerTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The active theme still applies for this session.
    }
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
