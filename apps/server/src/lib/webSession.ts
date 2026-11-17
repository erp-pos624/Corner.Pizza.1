import type { CookieOptions, Request, Response } from 'express';
import type { AuthSession, WebAuthSession } from '@posshope/shared';
import { env, isProduction } from '../env.js';

/**
 * Browser session transport.
 *
 * The desktop client keeps its refresh token in the Electron main process. A
 * browser has no such safe place, so the web client never receives the refresh
 * token in a response body: it travels only in an `HttpOnly` cookie that page
 * scripts cannot read, scoped to the web auth endpoints.
 */
export const REFRESH_COOKIE = 'forno_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth/web';

function cookieOptions(): CookieOptions {
  const secure = env.WEB_COOKIE_SECURE ? env.WEB_COOKIE_SECURE === 'true' : isProduction;
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

/** Reads one cookie from the raw header (no cookie-parser dependency needed). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function readRefreshCookie(req: Request): string | null {
  return readCookie(req.headers.cookie, REFRESH_COOKIE);
}

/** Moves the refresh token into the cookie and returns the body without it. */
export function sendWebSession(res: Response, session: AuthSession): void {
  setRefreshCookie(res, session.refreshToken);
  const { refreshToken: _refreshToken, ...body } = session;
  res
    .status(200)
    .setHeader('cache-control', 'no-store')
    .json(body satisfies WebAuthSession);
}
