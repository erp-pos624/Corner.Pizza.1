import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebBridge } from './web-bridge';

const user = {
  id: 'u1',
  username: 'admin',
  fullName: 'Marco Rossi',
  role: 'ADMIN',
  branchId: null,
  isActive: true,
  mustChangePassword: false,
};

function sessionBody(accessToken: string, expiresIn = 900) {
  return { user, accessToken, accessTokenExpiresIn: expiresIn, permissions: ['dashboard:view'] };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

function harness(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    return handler(call);
  });
  const store = new Map<string, string>();
  const bridge = createWebBridge({
    fetch: fetchMock as unknown as typeof fetch,
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
    },
    locks: undefined,
    channel: undefined,
  });
  return { bridge, calls, store };
}

describe('web bridge', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('signs in through the cookie endpoint and keeps no token in storage', async () => {
    const { bridge, calls, store } = harness(() => json(200, sessionBody('access-1')));

    const result = await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('/api/v1/auth/web/login?lang=en');
    expect(calls[0]?.headers['x-forno-client']).toBe('web');
    expect(calls[0]?.credentials).toBe('include');
    expect(calls[0]?.headers['x-terminal-id']).toMatch(/^WEB-[0-9A-F]{8}$/);
    // Only the terminal id is persisted — never a token.
    expect([...store.keys()]).toEqual(['forno-terminal-id']);
    expect(JSON.stringify([...store.values()])).not.toContain('access-1');
    if (result.ok) expect(result.data).not.toHaveProperty('accessToken');
  });

  it('sends the bearer token, branch scope and query on API requests', async () => {
    const { bridge, calls } = harness((call) =>
      call.url.includes('/auth/') ? json(200, sessionBody('access-1')) : json(200, { items: [] }),
    );
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });

    const result = await bridge.api.request({
      method: 'GET',
      path: '/orders',
      query: { page: 2, q: '', lang: 'en', skipped: undefined },
      branchId: 'branch-main',
    });

    expect(result).toEqual({ ok: true, status: 200, data: { items: [] } });
    const call = calls[1]!;
    expect(call.url).toBe('/api/v1/orders?page=2&lang=en');
    expect(call.headers.authorization).toBe('Bearer access-1');
    expect(call.headers['x-branch-id']).toBe('branch-main');
  });

  it('refuses API requests when signed out without touching the network', async () => {
    const { bridge, calls } = harness(() => json(200, {}));

    const result = await bridge.api.request({ method: 'GET', path: '/orders' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED');
    expect(calls).toHaveLength(0);
  });

  it('refreshes once and retries when the access token is rejected', async () => {
    let refreshes = 0;
    const { bridge, calls } = harness((call) => {
      if (call.url.includes('/auth/web/login')) return json(200, sessionBody('stale'));
      if (call.url.includes('/auth/web/refresh')) {
        refreshes += 1;
        return json(200, sessionBody('fresh'));
      }
      return call.headers.authorization === 'Bearer fresh'
        ? json(200, { ok: true })
        : json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
    });
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });

    // Three requests fail together; rotation must not race itself.
    const results = await Promise.all([
      bridge.api.request({ method: 'GET', path: '/a' }),
      bridge.api.request({ method: 'GET', path: '/b' }),
      bridge.api.request({ method: 'GET', path: '/c' }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(refreshes).toBe(1);
    expect(calls.filter((call) => call.url.includes('/auth/web/refresh'))[0]?.headers).toMatchObject(
      { 'x-forno-client': 'web' },
    );
  });

  it('restores the session from the cookie on page load', async () => {
    const { bridge, calls } = harness(() => json(200, sessionBody('restored')));

    const state = await bridge.auth.session();
    await bridge.auth.session();

    expect(state.authenticated).toBe(true);
    expect(state.user?.username).toBe('admin');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/auth/web/refresh');
  });

  it('reports an anonymous session when there is no valid cookie', async () => {
    const { bridge } = harness(() =>
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue' } }),
    );

    expect(await bridge.auth.session()).toEqual({
      authenticated: false,
      user: null,
      permissions: [],
    });
  });

  it('ends the session and notifies listeners when refresh is rejected', async () => {
    const { bridge } = harness((call) => {
      if (call.url.includes('/auth/web/login')) return json(200, sessionBody('stale'));
      return json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
    });
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });
    const listener = vi.fn();
    bridge.auth.onChange(listener);

    const result = await bridge.api.request({ method: 'GET', path: '/orders' });

    expect(result.ok).toBe(false);
    expect(listener).toHaveBeenLastCalledWith({ authenticated: false, user: null, permissions: [] });
  });

  it('keeps the session when refresh fails for a transient server error', async () => {
    const { bridge } = harness((call) => {
      if (call.url.includes('/auth/web/login')) return json(200, sessionBody('stale'));
      if (call.url.includes('/auth/web/refresh')) return json(503, {});
      return json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
    });
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });
    const listener = vi.fn();
    bridge.auth.onChange(listener);

    await bridge.api.request({ method: 'GET', path: '/orders' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('signs out locally even when the server cannot be reached', async () => {
    const { bridge } = harness((call) => {
      if (call.url.includes('/auth/web/login')) return json(200, sessionBody('access-1'));
      throw new TypeError('Failed to fetch');
    });
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });
    const listener = vi.fn();
    bridge.auth.onChange(listener);

    await bridge.auth.logout();

    expect(listener).toHaveBeenLastCalledWith({ authenticated: false, user: null, permissions: [] });
  });

  it('turns network failures into a localized NETWORK_ERROR response', async () => {
    const { bridge } = harness(() => {
      throw new TypeError('Failed to fetch');
    });

    const result = await bridge.auth.login({
      username: 'admin',
      password: 'Pizza@2024',
      language: 'ar',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toContain('تعذر');
    }
  });

  it('changes the password with the bearer token and adopts the new session', async () => {
    const { bridge, calls } = harness((call) => {
      if (call.url.includes('/auth/web/login')) return json(200, sessionBody('temp'));
      if (call.url.includes('/auth/web/change-password')) return json(200, sessionBody('final'));
      return json(200, {});
    });
    await bridge.auth.login({ username: 'admin', password: 'Pizza@2024' });

    const result = await bridge.auth.changePassword({
      currentPassword: 'Pizza@2024',
      newPassword: 'NewPass123',
    });
    await bridge.api.request({ method: 'GET', path: '/orders' });

    expect(result.ok).toBe(true);
    expect(calls[1]?.headers.authorization).toBe('Bearer temp');
    expect(calls[1]?.body).toEqual({ currentPassword: 'Pizza@2024', newPassword: 'NewPass123' });
    expect(calls[2]?.headers.authorization).toBe('Bearer final');
  });
});
