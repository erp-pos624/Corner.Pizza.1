import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// The package is started from its own directory in dev and tests; Vercel has
// no .env file and injects the configuration directly.
const packageRoot = process.cwd();

// Load .env from the package root, then any already-present environment wins.
const envFile = resolve(packageRoot, '.env');
if (existsSync(envFile)) {
  loadDotenv({ path: envFile });
}

// Vercel's Supabase Marketplace integration injects POSTGRES_* variables
// instead of DATABASE_URL; accept them so the connection is not duplicated.
process.env.DATABASE_URL ??= process.env.POSTGRES_PRISMA_URL;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),
  /** Secret used to sign access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me-please'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(12 * 60 * 60),
  /** Failed logins before the account is temporarily locked. */
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  /**
   * Comma-separated browser origins trusted to call the API with credentials.
   * `*` only grants credential-less access in production (see `lib/origin.ts`).
   */
  CORS_ORIGINS: z.string().default('*'),
  /**
   * Whether the web refresh cookie is `Secure`. Defaults to true in production.
   * Set to `false` only for a plain-HTTP LAN deployment without TLS.
   */
  WEB_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Business timezone used for report boundary calculations. */
  BUSINESS_TIMEZONE: z.string().default('Africa/Cairo'),
  /** Basata payment gateway. All values are optional until the merchant account is live. */
  BASATA_BASE_URL: z.string().trim().optional(),
  BASATA_API_KEY: z.string().trim().optional(),
  BASATA_MERCHANT_ID: z.string().trim().optional(),
  BASATA_WEBHOOK_SECRET: z.string().trim().optional(),
  BASATA_CHECKOUT_RETURN_URL: z.string().trim().optional(),
  /** Explicit override; defaults to enabled outside production when keys are missing. */
  BASATA_ALLOW_SIMULATION: z.enum(['true', 'false']).optional(),
  /** Optional Nominatim-compatible geocoder used for address-only delivery checks. */
  GEOCODER_URL: z.string().trim().optional(),
  /** Supabase Storage image hosting. Required for menu image uploads. */
  SUPABASE_URL: z.string().trim().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().optional(),
  SUPABASE_MENU_BUCKET: z.string().trim().default('menu-images'),
  /** Public link to the latest Windows POS installer (CornerPOS-Setup.exe). */
  DESKTOP_DOWNLOAD_URL: z.string().trim().url().optional(),
  /** Version shown next to the download button, e.g. 0.1.4. */
  DESKTOP_VERSION: z.string().trim().max(40).optional(),
  /** Optional SHA-256 of the installer so staff can verify the download. */
  DESKTOP_SHA256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/u).optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('dev-only')) {
    throw new Error('JWT_SECRET must be set to a strong, unique value in production');
  }
  return env;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const packageRootDir = packageRoot;
