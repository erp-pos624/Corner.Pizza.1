/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin when the web app is not served from the same origin as the API. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
