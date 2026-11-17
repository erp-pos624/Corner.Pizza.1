import { StrictMode, Suspense, lazy, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { isManagementPath } from './sections';
import './storefront/index.css';
import { StorefrontApp } from './storefront/StorefrontApp';

// The staff dashboard is its own chunk: customer visitors never pay for it.
const ManagementApp = lazy(() =>
  import('./management/ManagementApp').then((module) => ({ default: module.ManagementApp })),
);

function SectionFallback(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1f14]">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#2f4a39] border-t-[#c9a961]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

/**
 * One origin, two audiences. `/` and the customer routes render the storefront;
 * `/dashboard` (and the other single-segment staff routes) render the staff app.
 */
function Section(): ReactElement {
  const { pathname } = useLocation();
  if (!isManagementPath(pathname)) return <StorefrontApp />;
  return (
    <Suspense fallback={<SectionFallback />}>
      <ManagementApp />
    </Suspense>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Section />
    </BrowserRouter>
  </StrictMode>,
);
