import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

/**
 * Adds a Content-Security-Policy to the production `index.html`.
 *
 * It is build-only because the dev server needs inline scripts and a websocket
 * for hot reload. A reverse proxy should send the same policy as a response
 * header (see docs/DEPLOYMENT.md); the meta tag is the fallback for static hosts.
 */
function productionCsp(apiOrigin: string): Plugin {
  const connect = ["'self'", apiOrigin].filter(Boolean).join(' ');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'forno-production-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the dev server forwards API calls. Using a proxy keeps the browser on
  // one origin, so the session cookie is first-party and no CORS is involved.
  const apiTarget = env.FORNO_API_URL || 'http://127.0.0.1:4000';
  const apiOrigin = (env.VITE_API_URL ?? '').replace(/\/+$/, '');

  return {
    plugins: [react(), productionCsp(apiOrigin)],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/readyz': { target: apiTarget, changeOrigin: false },
        '/healthz': { target: apiTarget, changeOrigin: false },
      },
    },
    preview: {
      port: 4174,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/readyz': { target: apiTarget, changeOrigin: false },
        '/healthz': { target: apiTarget, changeOrigin: false },
      },
    },
    optimizeDeps: {
      // Linked workspace package whose export list changes during development.
      exclude: ['@posshope/shared'],
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Stable vendor chunks cache across deployments.
          manualChunks: {
            react: ['react', 'react-dom'],
            query: ['@tanstack/react-query', 'zustand'],
            forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
            map: ['leaflet'],
          },
        },
      },
    },
  };
});
