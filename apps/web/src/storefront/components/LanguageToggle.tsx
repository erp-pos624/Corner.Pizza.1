import type { ReactElement } from 'react';
import { useI18n } from '../i18n';
import { cx } from './ui';

/**
 * One-button language switch: shows the language you would switch to, the
 * same way the theme button shows the theme you would switch to.
 */
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
      className={cx(
        'flex h-11 w-11 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream',
        className,
      )}
    >
      {english ? (
        <span lang="ar" className="text-[15px] font-semibold leading-none">
          ع
        </span>
      ) : (
        <span className="text-[12px] font-semibold tracking-[0.06em]" dir="ltr">
          EN
        </span>
      )}
    </button>
  );
}
