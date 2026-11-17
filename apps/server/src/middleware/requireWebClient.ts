import type { NextFunction, Request, Response } from 'express';
import { WEB_CLIENT_HEADER, WEB_CLIENT_HEADER_VALUE } from '@posshope/shared';
import { env, isProduction } from '../env.js';
import { ForbiddenError } from '../lib/errors.js';
import { classifyOrigin, parseOrigins, requestOrigin } from '../lib/origin.js';

/**
 * CSRF guard for the cookie-backed web auth endpoints.
 *
 * These are the only routes where the browser attaches credentials by itself,
 * so they must prove the call came from our own web client:
 *
 * 1. A custom header is required. Browsers cannot attach it to a cross-site
 *    form post, and for `fetch` it forces a CORS preflight that the allow-list
 *    rejects for foreign origins.
 * 2. When an `Origin` header is present it must be a trusted origin.
 *
 * The refresh cookie is also `SameSite=Strict`, so this is defence in depth.
 */
export function requireWebClient(req: Request, _res: Response, next: NextFunction): void {
  if (req.get(WEB_CLIENT_HEADER) !== WEB_CLIENT_HEADER_VALUE) {
    next(new ForbiddenError('This endpoint is only available to the web client'));
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    const decision = classifyOrigin(origin, requestOrigin(req), {
      allowed: parseOrigins(env.CORS_ORIGINS),
      isProduction,
    });
    if (decision !== 'trusted') {
      next(new ForbiddenError('Origin is not allowed to use this endpoint'));
      return;
    }
  }

  next();
}
