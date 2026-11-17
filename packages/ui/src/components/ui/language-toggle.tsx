import type { ReactElement } from 'react';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';

/** One round button like the customer site: it shows the language it switches to. */
export function LanguageToggle({ className }: { className?: string }): ReactElement {
  const { language, setLanguage, t } = useI18n();
  const english = language === 'en';
  const label = english ? t('language.switchToArabic') : t('language.switchToEnglish');

  return (
    <button
      type="button"
      onClick={() => setLanguage(english ? 'ar' : 'en')}
      aria-label={label}
      title={label}
      className={cn(
        // Same look as the customer site's header button, at any dashboard theme.
        'focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#2f4a39] bg-[#15301f] text-[#c9c4b4] transition duration-200 ease-out hover:border-[#93a094] hover:bg-[#1f3a29] hover:text-[#f5f1e6]',
        className,
      )}
    >
      {english ? (
        <span lang="ar" className="text-[15px] font-semibold leading-none">
          ع
        </span>
      ) : (
        <span dir="ltr" className="text-[12px] font-semibold tracking-[0.06em]">
          EN
        </span>
      )}
    </button>
  );
}
