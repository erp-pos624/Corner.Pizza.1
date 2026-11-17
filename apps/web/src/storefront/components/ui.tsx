import { resolveImageUrl } from '@posshope/ui/images';
import { AlertCircle, Loader2, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { useI18n } from '../i18n';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Menu photo with a drawn placeholder when an item has no image. */
export function MealImage({
  src,
  alt,
  className,
  eager,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}): ReactElement {
  const url = resolveImageUrl(src);
  if (!url) {
    return (
      <div
        className={cx('flex items-center justify-center bg-forest-3 text-cream-faint', className)}
        aria-hidden="true"
      >
        <UtensilsCrossed className="h-8 w-8" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cx('object-cover', className)}
    />
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
}): ReactElement {
  const { t } = useI18n();
  const button = cx(
    'flex items-center justify-center rounded-full text-cream transition duration-200 ease-out hover:bg-forest-3 disabled:opacity-40',
    size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
  );
  return (
    <div
      className="inline-flex items-center rounded-full border border-line bg-forest-2"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t('common.decreaseQuantity')}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="price min-w-8 text-center text-[15px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t('common.increaseQuantity')}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }
>(function TextField({ label, error, hint, id, className, ...props }, ref) {
  const fieldId = id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="label">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        className="field"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-sm text-tomato" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-cream-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Notice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'success';
  children: ReactNode;
}): ReactElement {
  const tones = {
    error: 'border-tomato/50 bg-tomato/10 text-cream',
    info: 'border-line bg-forest-3 text-cream-dim',
    success: 'border-basil/40 bg-basil/10 text-cream',
  };
  return (
    <div
      className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone])}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <AlertCircle
        className={cx(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'error' ? 'text-tomato' : tone === 'success' ? 'text-basil' : 'text-cream-faint',
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }): ReactElement {
  return <Loader2 className={cx('h-4 w-4 animate-spin', className)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-forest-2 text-gold">
        <UtensilsCrossed className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <h2 className="display mt-6 text-3xl">{title}</h2>
      <p className="mt-3 text-cream-dim">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function PageHeading({ title, lead }: { title: string; lead?: string }): ReactElement {
  return (
    <header className="pb-8 pt-10 sm:pt-14">
      <h1 className="display text-4xl sm:text-5xl">{title}</h1>
      {lead ? <p className="mt-3 max-w-[60ch] text-cream-dim">{lead}</p> : null}
    </header>
  );
}

export { cx };
