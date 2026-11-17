import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { UnauthenticatedError } from '../lib/errors.js';
import { verifyCustomerToken } from '../lib/tokens.js';
import { prisma } from '../prisma.js';

function bearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Resolves the website customer behind a bearer token.
 *
 * The token must carry the customer audience (staff tokens fail verification)
 * and its session must still be live in `customer_sessions`. The customer id
 * used downstream always comes from here, never from the request body or URL.
 */
async function resolveCustomer(req: Request, token: string): Promise<void> {
  const payload = verifyCustomerToken(token);
  const session = await prisma.customerSession.findUnique({
    where: { id: payload.sid },
    select: { id: true, customerId: true, revokedAt: true, expiresAt: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    session.customerId !== payload.sub
  ) {
    throw new UnauthenticatedError('Session expired, please sign in again');
  }
  req.customer = { id: session.customerId, sessionId: session.id };
}

/** Requires a signed-in customer. */
export const authenticateCustomer = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) throw new UnauthenticatedError();
    await resolveCustomer(req, token);
    next();
  },
);

/**
 * For routes guests may also use (checkout). No token means a guest; a token
 * that is present but invalid is an error, so an expired session is refreshed
 * by the client instead of silently placing the order as a guest.
 */
export const optionalCustomer = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (token) await resolveCustomer(req, token);
    next();
  },
);
