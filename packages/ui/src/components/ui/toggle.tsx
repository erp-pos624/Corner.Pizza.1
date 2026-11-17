import type { ReactElement } from 'react';
import { cn } from '../../lib/utils';

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="inline-flex items-center gap-2 text-xs font-medium disabled:opacity-50"
    >
      <span
        className={cn(
          'relative h-4 w-7 rounded-full transition-colors',
          checked ? 'bg-success' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
            checked ? 'start-0.5 translate-x-3.5 rtl:-translate-x-3.5' : 'start-0.5',
          )}
        />
      </span>
      <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </button>
  );
}
