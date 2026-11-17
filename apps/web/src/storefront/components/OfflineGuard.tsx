import { useConnectionStatus } from '@posshope/ui/connection';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactElement } from 'react';
import { useI18n } from '../i18n';

const PROBE_TIMEOUT_MS = 5_000;

/** Any HTTP answer means the network path works; only a network failure is offline. */
async function probeApi(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch('/api/public/branches', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Full-screen notice for the customer site when the API is unreachable.
 * Mounted inside `.storefront` so it follows the active oven/daylight theme.
 */
export function OfflineGuard(): ReactElement | null {
  const { t } = useI18n();
  const { offline, checking, recheck } = useConnectionStatus(probeApi);

  if (!offline) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="storefront-offline-title"
      aria-describedby="storefront-offline-body"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-forest/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-card border border-line bg-forest-2 p-8 text-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] animate-rise">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <WifiOff className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 id="storefront-offline-title" className="display mt-5 text-3xl text-cream">
          {t('offline.title')}
        </h2>
        <p id="storefront-offline-body" className="mt-3 text-cream-dim">
          {t('offline.body')}
        </p>
        <button type="button" className="btn-primary mt-6" onClick={recheck} disabled={checking}>
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {checking ? t('offline.checking') : t('offline.retry')}
        </button>
      </div>
    </div>
  );
}
