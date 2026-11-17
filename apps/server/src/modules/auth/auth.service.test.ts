import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  getDummyHash: vi.fn(),
  generateRefreshToken: vi.fn(),
  hashToken: vi.fn(),
  signAccessToken: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../prisma.js', () => {
  const client = {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    session: { create: mocks.sessionCreate, updateMany: mocks.sessionUpdateMany },
  };
  return {
    prisma: {
      ...client,
      $transaction: (fn: (tx: typeof client) => unknown) => fn(client),
    },
  };
});

vi.mock('../../lib/password.js', () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
  getDummyHash: mocks.getDummyHash,
}));

vi.mock('../../lib/tokens.js', () => ({
  generateRefreshToken: mocks.generateRefreshToken,
  hashToken: mocks.hashToken,
  signAccessToken: mocks.signAccessToken,
}));

vi.mock('../../lib/audit.js', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('../../env.js', () => ({
  env: {
    REFRESH_TOKEN_TTL_SECONDS: 43_200,
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_LOCK_MINUTES: 15,
  },
}));

import { changePassword, login } from './auth.service.js';

const baseUser = {
  id: 'user-1',
  username: 'cashier',
  fullName: 'Cashier One',
  role: 'CASHIER',
  isActive: true,
  mustChangePassword: true,
  passwordHash: 'old-hash',
  failedLoginAttempts: 0,
  lockedUntil: null,
};

describe('temporary password flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue(baseUser);
    mocks.userUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...baseUser, ...data }),
    );
    mocks.sessionCreate.mockResolvedValue({ id: 'session-1' });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.generateRefreshToken.mockReturnValue('refresh-token');
    mocks.hashToken.mockReturnValue('token-hash');
    mocks.signAccessToken.mockReturnValue({ token: 'access-token', expiresIn: 900 });
  });

  it('signs in but marks the session as restricted', async () => {
    mocks.verifyPassword.mockResolvedValue(true);

    const session = await login({ username: 'cashier', password: 'Temp1234' });

    expect(session.user.mustChangePassword).toBe(true);
    expect(session.accessToken).toBe('access-token');
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('clears the flag, revokes every session and returns fresh tokens', async () => {
    mocks.verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.hashPassword.mockResolvedValue('new-hash');

    const session = await changePassword(
      'user-1',
      { currentPassword: 'Temp1234', newPassword: 'NewPass123' },
      { ip: '127.0.0.1' },
    );

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash', mustChangePassword: false },
    });
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(session.user.mustChangePassword).toBe(false);
    expect(session.refreshToken).toBe('refresh-token');
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.password.changed', userId: 'user-1' }),
      expect.anything(),
    );
  });

  it('rejects a wrong current password without touching sessions', async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      changePassword('user-1', { currentPassword: 'Wrong1234', newPassword: 'NewPass123' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });
});
