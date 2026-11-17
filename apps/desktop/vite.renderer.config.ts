import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

// Renderer bundle. Forge's Vite plugin sets `root` and the output directory.
//
// NOTE: do not set `server.headers['Content-Type']` here. That header is applied
// to EVERY dev-server response, including transformed `.tsx`/`.js` modules and
// `@vite/client`, which makes Chromium reject them ("Expected a JavaScript
// module script but the server responded with a MIME type of text/html") and the
// window renders blank. Vite already serves HTML as UTF-8, so Arabic is fine.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src', 'renderer'),
    },
  },
  server: {
    // Workspace packages are served from their built `dist` with a stable `?v=`
    // hash, and Vite marks those responses immutable for a year. Rebuilding
    // @posshope/shared can therefore leave Electron on an old export list
    // ("does not provide an export named ...") and blank the window. Dev
    // modules must always be revalidated.
    headers: { 'Cache-Control': 'no-store' },
  },
  optimizeDeps: {
    // Workspace packages are linked and edited constantly. Pre-bundling caches
    // their code under a content hash, so edits made while the dev server runs
    // (component styles, new exports) never reach the Electron window until the
    // cache is rebuilt. Serving them unbundled keeps dev honest; production
    // builds are unaffected (this option only applies to the dev server).
    exclude: ['@posshope/shared', '@posshope/ui'],
    // Excluding the workspace packages means their imports are resolved at
    // runtime instead of through the pre-bundler. CommonJS libraries reached
    // only from @posshope/ui would then be served raw, and Chromium rejects
    // `import L from 'leaflet'` with "does not provide an export named
    // 'default'" — the POS screen (delivery-zone map) went blank for exactly
    // that reason. Pre-bundling them restores the ESM interop.
    include: ['leaflet', 'html2pdf.js'],
  },
});
