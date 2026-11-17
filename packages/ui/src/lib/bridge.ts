import type { PosshopeBridge } from '../platform';

// Declared here (not in a standalone .d.ts) so it travels with the module when
// a host application type-checks this package from source.
declare global {
  interface Window {
    /** Preload bridge injected by the Electron shell; absent in a browser. */
    posshope?: PosshopeBridge;
  }
}

/**
 * Access point for the preload bridge.
 *
 * Tests (and the browser-only dev preview) can inject a fake bridge through
 * `setBridge`, keeping every consumer free of `window` access.
 */
let bridge: PosshopeBridge | null = null;

export function setBridge(next: PosshopeBridge | null): void {
  bridge = next;
}

export function getBridge(): PosshopeBridge {
  if (bridge) return bridge;
  if (typeof window !== 'undefined' && window.posshope) {
    return window.posshope;
  }
  throw new Error(
    'Corner Pizza bridge is unavailable — run the app inside the Electron shell (preload not loaded)',
  );
}

export function hasBridge(): boolean {
  return bridge !== null || (typeof window !== 'undefined' && Boolean(window.posshope));
}
