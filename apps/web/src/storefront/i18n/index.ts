import { languageDirection, normalizeLanguage, type Language } from '@posshope/shared';
import { useCallback } from 'react';
import { create } from 'zustand';
import { setRequestLanguage } from '../lib/api';
import { setFormatLanguage } from '../lib/format';
import { translate, type MessageKey, type MessageVars, type Translate } from './messages';

const STORAGE_KEY = 'forno-customer-language';

function resolveInitialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLanguage(stored);
  } catch {
    // Storage can be unavailable in hardened contexts; English is the default.
  }
  return 'en';
}

/** Applies the language to the document, the API client and the formatters. */
export function applyCustomerLanguage(language: Language): void {
  setRequestLanguage(language);
  setFormatLanguage(language);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = language;
  root.dir = languageDirection(language);
  root.dataset.language = language;
}

interface StorefrontLanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  toggle: () => void;
}

const initialLanguage = resolveInitialLanguage();
// Fetch the first menu in the right language even before React paints.
setRequestLanguage(initialLanguage);
setFormatLanguage(initialLanguage);

export const useStorefrontLanguage = create<StorefrontLanguageState>((set, get) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    if (language === get().language) return;
    applyCustomerLanguage(language);
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The active language still applies for this session.
    }
    set({ language });
  },
  toggle: () => get().setLanguage(get().language === 'ar' ? 'en' : 'ar'),
}));

export interface StorefrontI18n {
  language: Language;
  isRtl: boolean;
  t: Translate;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

export function useI18n(): StorefrontI18n {
  const language = useStorefrontLanguage((state) => state.language);
  const setLanguage = useStorefrontLanguage((state) => state.setLanguage);
  const toggleLanguage = useStorefrontLanguage((state) => state.toggle);
  const t = useCallback<Translate>(
    (key: MessageKey, vars?: MessageVars) => translate(language, key, vars),
    [language],
  );
  return {
    language,
    isRtl: language === 'ar',
    t,
    setLanguage,
    toggleLanguage,
  };
}

export { translate };
export type { MessageKey, Translate };
