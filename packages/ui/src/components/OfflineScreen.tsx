import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useConnectionStatus } from '../lib/connection';
import { Button } from './ui/button';

/**
 * Full-window notice shown in the desktop and staff web clients when the API
 * cannot be reached. It disappears on its own once a periodic probe succeeds.
 */
export function OfflineScreen(): ReactElement | null {
  const { t } = useI18n();
  const { offline, checking, recheck } = useConnectionStatus(() =>
    api.health().then((health) => health.reachable),
  );

  if (!offline) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-body"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-pop animate-slide-up">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-gold/40 bg-brand-gold/10 text-brand-gold">
          <WifiOff className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 id="offline-title" className="mt-5 text-xl font-bold text-foreground">
          {t('offline.title')}
        </h2>
        <p id="offline-body" className="mt-2 text-sm leading-6 text-muted-foreground">
          {t('offline.body')}
        </p>
        <Button size="lg" className="mt-6" onClick={recheck} disabled={checking}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {checking ? t('offline.checking') : t('actions.retry')}
        </Button>
      </div>
    </div>
  );
}
