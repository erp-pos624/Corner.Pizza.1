import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  prisma: { session: { findUnique: mocks.sessionFindUnique } },
}));
vi.mock('../lib/tokens.js', () => ({ verifyAccessToken: mocks.verifyAccessToken }));

import { authenticate } from './authenticate.js';

const activeSession = {
  id: 'session-1',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  user: {
    id: 'user-1',
    username: 'cashier',
    fullName: 'Cashier One',
    role: 'CASHIER',
    isActive: true,
    mustChangePassword: true,
  },
};

function requestFor(originalUrl: string): Request {
  return {
    header: (name: string) => (name === 'authorization' ? 'Bearer token' : undefined),
    originalUrl,
  } as unknown as Request;
}

async function run(originalUrl: string): Promise<NextFunction> {
  const next = vi.fn() as unknown as NextFunction;
  authenticate(requestFor(originalUrl), {} as Response, next);
  await vi.waitFor(() => expect(next).toHaveBeenCalled());
  return next;
}

describe('authenticate with a temporary password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      username: 'cashier',
      role: 'CASHIER',
      sid: 'session-1',
    });
    mocks.sessionFindUnique.mockResolvedValue(activeSession);
  });

  it('blocks every endpoint except changing the password or signing out', async () => {
    const next = await run('/api/v1/orders?lang=en');

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PASSWORD_CHANGE_REQUIRED',
        statusCode: 403,
      }),
    );
  });

  it('allows the change-password endpoint', async () => {
    const next = await run('/api/v1/auth/change-password?lang=en');

    expect(next).toHaveBeenCalledWith();
  });

  it('allows logout', async () => {
    const next = await run('/api/v1/auth/logout');

    expect(next).toHaveBeenCalledWith();
  });
});
