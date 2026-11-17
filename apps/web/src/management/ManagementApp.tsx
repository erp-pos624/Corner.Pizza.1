import { Root, setBridge } from '@posshope/ui';
import { initLanguage, initTheme } from '@posshope/ui/boot';
import '@posshope/ui/styles.css';
import { useEffect, type ReactElement } from 'react';
import { createWebBridge } from '../web-bridge';

// The staff app is loaded on demand at /dashboard, so the customer site never
// downloads its bundle (or its stylesheet).
setBridge(
  createWebBridge({
    apiOrigin: import.meta.env.VITE_API_URL ?? '',
    appVersion: __APP_VERSION__,
  }),
);

export function ManagementApp(): ReactElement {
  useEffect(() => {
    // The customer site may have left `lang`/`dir` on the document for its own
    // English layout; restore the stored staff preferences for this subtree.
    initTheme();
    initLanguage();
    document.title = 'Corner Pizza — Restaurant Management';
    document.body.style.background = '';
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
  }, []);

  return <Root routing="url" />;
}
