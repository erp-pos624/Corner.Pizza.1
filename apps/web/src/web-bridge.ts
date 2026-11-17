import {
  WEB_CLIENT_HEADER,
  WEB_CLIENT_HEADER_VALUE,
  type ApiErrorShape,
  type ApiRequestPayload,
  type ApiResponse,
  type AppInfo,
  type ChangePasswordPayload,
  type ClientBridge,
  type Language,
  type LoginPayload,
  type LoginResult,
  type PrintResult,
  type ServerHealth,
  type SessionState,
  type WebAuthSession,
} from '@posshope/shared';

/**
 * The browser implementation of the platform bridge.
 *
 * It mirrors what the Electron main process does for the desktop client, with
 * one deliberate difference in token custody:
 *
 *  - the **access token** lives only in this module's memory (never in
 *    `localStorage`), so it disappears with the tab;
 *  - the **refresh token** never reaches JavaScript at all — the API keeps it
 *    in an `HttpOnly`, `SameSite=Strict` cookie scoped to the web auth routes.
 *
 * A page reload therefore restores the session by calling the refresh endpoint,
 * exactly like the desktop app does on start-up.
 */

export interface WebBridgeOptions {
  /** API origin, e.g. `https://api.forno.example`. Empty means same origin. */
  apiOrigin?: string;
  appVersion?: string;
  fetch?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Cross-tab lock; defaults to `navigator.locks` when the browser has it. */
  locks?: Pick<LockManager, 'request'>;
  /** Cross-tab sign-out channel; defaults to `BroadcastChannel` when available. */
  channel?: Pick<BroadcastChannel, 'postMessage' | 'addEventListener'>;
}

interface MemorySession {
  accessToken: string;
  accessTokenExpiresAt: number;
  user: LoginResult['user'];
  permissions: string[];
}

const TERMINAL_KEY = 'forno-terminal-id';
const REQUEST_TIMEOUT_MS = 15_000;
const EXPIRY_SKEW_MS = 20_000;
const WEB_HEADERS = { [WEB_CLIENT_HEADER]: WEB_CLIENT_HEADER_VALUE };

function message(language: Language | undefined, en: string, ar: string): string {
  return language === 'ar' ? ar : en;
}

function networkError(language: Language | undefined, error: unknown): ApiResponse<never> {
  return {
    ok: false,
    status: 0,
    error: {
      code: 'NETWORK_ERROR',
      message: message(
        language,
        'Unable to reach the restaurant server. Check the network connection.',
        'تعذر الاتصال بخادم المطعم. تحقق من الشبكة',
      ),
      details: error instanceof Error ? error.message : String(error),
    },
  };
}

function unauthenticated(language: Language | undefined): ApiResponse<never> {
  return {
    ok: false,
    status: 401,
    error: {
      code: 'UNAUTHENTICATED',
      message: message(language, 'Please sign in to continue', 'يجب تسجيل الدخول للمتابعة'),
    },
  };
}

function randomTerminalId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `WEB-${hex.toUpperCase()}`;
}

function browserStorage(): WebBridgeOptions['storage'] {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserChannel(): WebBridgeOptions['channel'] {
  return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('forno-session');
}

export function createWebBridge(options: WebBridgeOptions = {}): ClientBridge {
  const apiOrigin = (options.apiOrigin ?? '').replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const storage = 'storage' in options ? options.storage : browserStorage();
  const locks =
    'locks' in options ? options.locks : typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const channel = 'channel' in options ? options.channel : browserChannel();

  let session: MemorySession | null = null;
  let restorePromise: Promise<void> | null = null;
  let refreshPromise: Promise<boolean> | null = null;
  let fallbackTerminalId: string | null = null;
  const listeners = new Set<(state: SessionState) => void>();

  function terminalId(): string {
    try {
      const existing = storage?.getItem(TERMINAL_KEY);
      if (existing) return existing;
      const generated = randomTerminalId();
      storage?.setItem(TERMINAL_KEY, generated);
      return generated;
    } catch {
      // Storage blocked (private mode): stable for this tab only.
      fallbackTerminalId ??= randomTerminalId();
      return fallbackTerminalId;
    }
  }

  function sessionState(): SessionState {
    return {
      authenticated: session !== null,
      user: session?.user ?? null,
      permissions: session?.permissions ?? [],
    };
  }

  function notify(): void {
    const state = sessionState();
    for (const listener of listeners) listener(state);
  }

  function adopt(data: WebAuthSession): void {
    session = {
      accessToken: data.accessToken,
      accessTokenExpiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
      user: data.user,
      permissions: data.permissions,
    };
    notify();
  }

  function clear(): void {
    if (!session) return;
    session = null;
    notify();
  }

  // Another tab signed out: drop this tab's in-memory token as well.
  channel?.addEventListener('message', (event: MessageEvent) => {
    if (event.data === 'signed-out') clear();
  });

  async function raw(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${apiOrigin}${path}`, {
        ...init,
        // Needed for the refresh cookie when the API is on another origin.
        credentials: 'include',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse<T>(response: Response, language?: Language): Promise<ApiResponse<T>> {
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: { code: 'INVALID_JSON', message: text.slice(0, 300) } };
      }
    }
    if (response.ok) return { ok: true, status: response.status, data: body as T };

    const shape = (body as { error?: ApiErrorShape } | undefined)?.error;
    return {
      ok: false,
      status: response.status,
      error: {
        code: shape?.code ?? `HTTP_${response.status}`,
        message:
          shape?.message ||
          response.statusText ||
          message(language, 'Request failed', 'طلب غير ناجح'),
        ...(shape?.details !== undefined ? { details: shape.details } : {}),
        ...(shape?.requestId ? { requestId: shape.requestId } : {}),
      },
    };
  }

  /**
   * Exchanges the refresh cookie for a new access token.
   *
   * Refresh tokens rotate on every use, so two overlapping refreshes would
   * invalidate each other. Calls are therefore single-flight within the tab and
   * serialised across tabs with the Web Locks API where the browser has it.
   */
  function refresh(): Promise<boolean> {
    refreshPromise ??= (async () => {
      const attempt = async (): Promise<boolean> => {
        const response = await raw(
          '/api/v1/auth/web/refresh',
          { method: 'POST', headers: { ...WEB_HEADERS, 'x-terminal-id': terminalId() } },
          8_000,
        );
        const parsed = await parse<WebAuthSession>(response);
        if (!parsed.ok) {
          // Only a definite rejection ends the session; a 5xx is transient.
          if (parsed.status === 401 || parsed.status === 403) clear();
          return false;
        }
        adopt(parsed.data);
        return true;
      };
      try {
        return locks ? await locks.request('forno-session-refresh', attempt) : await attempt();
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  /** Restores the session from the cookie once per page load. */
  function restore(): Promise<void> {
    restorePromise ??= refresh().then(() => undefined);
    return restorePromise;
  }

  function isExpired(): boolean {
    return !session || session.accessTokenExpiresAt - EXPIRY_SKEW_MS <= Date.now();
  }

  async function authCall(
    path: string,
    body: unknown,
    language: Language,
    bearer?: string,
  ): Promise<ApiResponse<LoginResult>> {
    const response = await raw(`${path}?lang=${language}`, {
      method: 'POST',
      headers: {
        ...WEB_HEADERS,
        'content-type': 'application/json',
        'x-terminal-id': terminalId(),
        'x-language': language,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const parsed = await parse<WebAuthSession>(response, language);
    if (!parsed.ok) return parsed;
    adopt(parsed.data);
    return {
      ok: true,
      status: parsed.status,
      data: {
        user: parsed.data.user,
        permissions: parsed.data.permissions,
        accessTokenExpiresIn: parsed.data.accessTokenExpiresIn,
      },
    };
  }

  return {
    async appInfo(): Promise<AppInfo> {
      const chrome = /Chrom(?:e|ium)\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '';
      return {
        name: 'Corner Pizza',
        version: options.appVersion ?? '0.0.0',
        electron: '',
        chrome,
        node: '',
        platform: 'web',
        apiBaseUrl: apiOrigin || window.location.origin,
        isPackaged: true,
        terminalId: terminalId(),
        client: 'web',
      };
    },

    async health(): Promise<ServerHealth> {
      const started = Date.now();
      try {
        const response = await raw('/readyz', { method: 'GET' }, 4_000);
        const body = (await response.json()) as { status?: string };
        return {
          reachable: true,
          status: body.status ?? 'unknown',
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        return { reachable: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    auth: {
      async login(payload: LoginPayload) {
        const language = payload.language ?? 'en';
        try {
          return await authCall(
            '/api/v1/auth/web/login',
            { username: payload.username, password: payload.password },
            language,
          );
        } catch (error) {
          return networkError(language, error);
        }
      },

      async changePassword(payload: ChangePasswordPayload) {
        const language = payload.language ?? 'en';
        try {
          if (!session) await restore();
          if (session && isExpired()) await refresh();
          if (!session) return unauthenticated(language);
          return await authCall(
            '/api/v1/auth/web/change-password',
            { currentPassword: payload.currentPassword, newPassword: payload.newPassword },
            language,
            session.accessToken,
          );
        } catch (error) {
          return networkError(language, error);
        }
      },

      async logout() {
        try {
          await raw('/api/v1/auth/web/logout', { method: 'POST', headers: WEB_HEADERS }, 5_000);
        } catch {
          // Signing out locally must succeed even if the server is unreachable.
        }
        clear();
        channel?.postMessage('signed-out');
      },

      async session() {
        await restore();
        return sessionState();
      },

      onChange(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },

    api: {
      async request<T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>> {
        const language: Language = payload.query?.lang === 'ar' ? 'ar' : 'en';
        try {
          if (!session) return unauthenticated(language);
          if (isExpired()) await refresh();

          const send = (): Promise<Response> => {
            const search = new URLSearchParams();
            for (const [key, value] of Object.entries(payload.query ?? {})) {
              if (value !== undefined && value !== null && value !== '') {
                search.set(key, String(value));
              }
            }
            const query = search.toString();
            return raw(`/api/v1${payload.path}${query ? `?${query}` : ''}`, {
              method: payload.method,
              headers: {
                'content-type': 'application/json',
                ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
                'x-terminal-id': terminalId(),
                ...(payload.branchId ? { 'x-branch-id': payload.branchId } : {}),
              },
              ...(payload.body !== undefined ? { body: JSON.stringify(payload.body) } : {}),
            });
          };

          let response = await send();
          if (response.status === 401 && (await refresh())) response = await send();
          return await parse<T>(response, language);
        } catch (error) {
          return networkError(language, error);
        }
      },
    },

    async print(): Promise<PrintResult> {
      // Browsers always show their own dialog and do not report whether the
      // user printed or cancelled; silent and per-device printing are
      // desktop-only capabilities.
      try {
        window.print();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          cancelled: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
