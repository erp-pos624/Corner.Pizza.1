import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma.js', () => ({ prisma: {} }));
vi.mock('./auth.service.js', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  logoutByRefreshToken: vi.fn(),
  changePassword: vi.fn(),
  getSessionUser: vi.fn(),
}));

import { createApp } from '../../app.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import * as authService from './auth.service.js';

const session = {
  user: {
    id: 'u1',
    username: 'admin',
    fullName: 'Marco Rossi',
    role: 'ADMIN' as const,
    branchId: null,
    isActive: true,
    mustChangePassword: false,
  },
  accessToken: 'access-token',
  refreshToken: 'refresh-token-secret',
  accessTokenExpiresIn: 900,
  permissions: ['dashboard:view'],
};

const WEB = { 'x-forno-client': 'web' };
const credentials = { username: 'admin', password: 'Pizza@2024' };

function cookieOf(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((value) => value.startsWith('forno_rt=')) ?? '';
}

describe('web auth transport', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.login).mockResolvedValue(session);
    vi.mocked(authService.refresh).mockResolvedValue({
      ...session,
      refreshToken: 'rotated-refresh-token',
    });
  });

  it('keeps the refresh token out of the body and in an HttpOnly cookie', async () => {
    const response = await request(app).post('/api/v1/auth/web/login').set(WEB).send(credentials);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('access-token');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain('refresh-token-secret');

    const cookie = cookieOf(response);
    expect(cookie).toContain('forno_rt=refresh-token-secret');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth/web');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects calls without the web client header', async () => {
    const response = await request(app).post('/api/v1/auth/web/login').send(credentials);

    expect(response.status).toBe(403);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('leaves the native login untouched (refresh token still in the body)', async () => {
    const response = await request(app).post('/api/v1/auth/login').send(credentials);

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).toBe('refresh-token-secret');
    expect(cookieOf(response)).toBe('');
  });

  it('refreshes from the cookie and rotates it', async () => {
    const response = await request(app)
      .post('/api/v1/auth/web/refresh')
      .set(WEB)
      .set('Cookie', 'forno_rt=refresh-token-secret');

    expect(response.status).toBe(200);
    expect(vi.mocked(authService.refresh).mock.calls[0]?.[0]).toBe('refresh-token-secret');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(cookieOf(response)).toContain('forno_rt=rotated-refresh-token');
  });

  it('answers 401 when there is no cookie', async () => {
    const response = await request(app).post('/api/v1/auth/web/refresh').set(WEB);

    expect(response.status).toBe(401);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('clears the cookie when the refresh token is no longer valid', async () => {
    vi.mocked(authService.refresh).mockRejectedValue(new UnauthenticatedError('expired'));

    const response = await request(app)
      .post('/api/v1/auth/web/refresh')
      .set(WEB)
      .set('Cookie', 'forno_rt=dead-token');

    expect(response.status).toBe(401);
    expect(cookieOf(response)).toMatch(/^forno_rt=;/);
  });

  it('signs out by revoking the cookie session and clearing the cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/web/logout')
      .set(WEB)
      .set('Cookie', 'forno_rt=refresh-token-secret');

    expect(response.status).toBe(204);
    expect(authService.logoutByRefreshToken).toHaveBeenCalledWith('refresh-token-secret');
    expect(cookieOf(response)).toMatch(/^forno_rt=;/);
  });

  it('requires a bearer token to change the password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/web/change-password')
      .set(WEB)
      .send({ currentPassword: 'Pizza@2024', newPassword: 'NewPass123' });

    expect(response.status).toBe(401);
    expect(authService.changePassword).not.toHaveBeenCalled();
  });
});

describe('CORS', () => {
  const app = createApp();

  it('sends no CORS headers to native clients without an Origin', async () => {
    const response = await request(app).get('/healthz');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows credentialed calls from a browser origin outside production', async () => {
    const response = await request(app).get('/healthz').set('Origin', 'http://localhost:5174');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
