import jwt from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from '@posshope/shared';
import { env } from '../env.js';
import { UnauthenticatedError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: Role;
  /** Session id, so tokens can be revoked with the session. */
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): {
  token: string;
  expiresIn: number;
} {
  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'forno-pos',
    audience: 'forno-pos-client',
  });
  return { token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'forno-pos',
      audience: 'forno-pos-client',
    });
    if (typeof decoded === 'string') throw new Error('unexpected payload');
    const { sub, username, role, sid } = decoded as jwt.JwtPayload & AccessTokenPayload;
    if (!sub || !sid || !role) throw new Error('incomplete payload');
    return { sub, username: username ?? '', role, sid };
  } catch (error) {
    throw new UnauthenticatedError(
      error instanceof jwt.TokenExpiredError ? 'Session expired, please sign in again' : 'Invalid access token',
    );
  }
}

export interface CustomerTokenPayload {
  /** Customer id. */
  sub: string;
  /** Customer session id, so tokens die with the session. */
  sid: string;
}

const CUSTOMER_AUDIENCE = 'forno-customer';

/**
 * Website customers get tokens with their own audience. `verifyAccessToken`
 * demands the staff audience, so a customer token is rejected by every staff
 * route before any database lookup, and a staff token is rejected here.
 */
export function signCustomerToken(payload: CustomerTokenPayload): {
  token: string;
  expiresIn: number;
} {
  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'forno-pos',
    audience: CUSTOMER_AUDIENCE,
  });
  return { token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyCustomerToken(token: string): CustomerTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'forno-pos',
      audience: CUSTOMER_AUDIENCE,
    });
    if (typeof decoded === 'string') throw new Error('unexpected payload');
    const { sub, sid } = decoded as jwt.JwtPayload & CustomerTokenPayload;
    if (!sub || !sid) throw new Error('incomplete payload');
    return { sub, sid };
  } catch (error) {
    throw new UnauthenticatedError(
      error instanceof jwt.TokenExpiredError
        ? 'Session expired, please sign in again'
        : 'Invalid access token',
    );
  }
}

/** Opaque, high-entropy refresh token. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Tokens are stored as SHA-256 digests so a DB leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison for hex digests of equal length. */
export function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
