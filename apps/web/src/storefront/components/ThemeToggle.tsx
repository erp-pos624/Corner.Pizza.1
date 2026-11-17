import { Moon, Sun } from 'lucide-react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';
import { useStorefrontTheme } from '../theme';
import { cx } from './ui';

/** Flips the customer site between the dark oven canvas and the cream one. */
export function ThemeToggle({ className }: { className?: string }): ReactElement {
  const { theme, toggle } = useStorefrontTheme();
  const { t } = useI18n();
  const dark = theme === 'dark';
  const label = dark ? t('theme.switchToLight') : t('theme.switchToDark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cx(
        'flex h-11 w-11 items-center justify-center rounded-full border border-line text-cream-dim transition duration-200 ease-out hover:border-cream-faint hover:bg-forest-3 hover:text-cream',
        className,
      )}
    >
      {dark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.9} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      )}
    </button>
  );
}
