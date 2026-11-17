import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root, initTheme } from '@posshope/ui';
import { BrandIntro } from '@posshope/ui/brand-intro';
import '@posshope/ui/styles.css';

// Desktop renderer entry. The UI itself lives in `@posshope/ui`; the platform
// bridge is `window.posshope`, injected by the Electron preload script.
initTheme();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrandIntro />
    <Root />
  </StrictMode>,
);
