import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { PasswordChangeRequiredError, UnauthenticatedError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { asyncHandler } from '../lib/asyncHandler.js';

function isPasswordChangeAllowed(req: Request): boolean {
  const path = req.originalUrl.split('?')[0] ?? '';
  return (
    path.endsWith('/auth/change-password') ||
    path.endsWith('/auth/web/change-password') ||
    path.endsWith('/auth/logout')
  );
}

function extractBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Verifies the bearer access token AND that the backing session is still live,
 * then binds the fresh user record (role, active flag) to the request.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearer(req);
    if (!token) throw new UnauthenticatedError();

    const payload = verifyAccessToken(token);

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthenticatedError('Session expired, please sign in again');
    }
    if (!session.user.isActive) {
      throw new UnauthenticatedError('Account is inactive');
    }
    if (session.user.id !== payload.sub) {
      throw new UnauthenticatedError('Invalid access token');
    }

    // A temporary/reset password grants a session that can only change itself or
    // sign out. Everything else stays blocked until the user picks a password.
    if (session.user.mustChangePassword && !isPasswordChangeAllowed(req)) {
      throw new PasswordChangeRequiredError();
    }

    req.user = {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      role: session.user.role,
      branchId: session.user.branchId,
      terminalId: req.header('x-terminal-id')?.slice(0, 64) ?? session.terminalId ?? null,
      sessionId: session.id,
    };

    next();
  },
);
