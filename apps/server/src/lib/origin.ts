import type { Request } from 'express';

export interface OriginPolicy {
  /** Explicit browser origins from `CORS_ORIGINS` (may contain `*`). */
  allowed: readonly string[];
  isProduction: boolean;
}

export type OriginDecision =
  /** Trusted browser origin: credentials (cookies) may be exchanged. */
  | 'trusted'
  /** Wildcard match in production: readable, but never with credentials. */
  | 'public'
  | 'denied';

export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** The origin the request was addressed to, e.g. `https://pos.forno.local`. */
export function requestOrigin(req: Pick<Request, 'protocol' | 'get'>): string | null {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : null;
}

/**
 * Decides how far a browser `Origin` is trusted.
 *
 * - The API's own origin and any origin listed in `CORS_ORIGINS` are trusted.
 * - Outside production every origin is trusted, so local dev servers work.
 * - In production a `*` entry only grants credential-less access, because a
 *   wildcard must never be combined with cookies.
 */
export function classifyOrigin(
  origin: string,
  selfOrigin: string | null,
  policy: OriginPolicy,
): OriginDecision {
  const normalized = origin.replace(/\/+$/, '');
  if (selfOrigin && normalized === selfOrigin) return 'trusted';
  if (policy.allowed.includes(normalized)) return 'trusted';
  if (!policy.isProduction) return 'trusted';
  if (policy.allowed.includes('*')) return 'public';
  return 'denied';
}
