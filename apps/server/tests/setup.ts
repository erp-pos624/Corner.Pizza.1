import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Integration suites run against a dedicated database. The package `.env` must
 * be loaded here: `env.ts` is imported later by each suite, so without this the
 * `TEST_DATABASE_URL` below is unset and integration suites silently write to
 * the development database.
 */
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const explicitDatabaseUrl = process.env.DATABASE_URL;
if (existsSync(envFile)) loadDotenv({ path: envFile });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (!explicitDatabaseUrl) {
  /**
   * Unit suites mock Prisma, but `env.ts` still validates `DATABASE_URL` at
   * import time. Without a dedicated test URL, use an unreachable placeholder
   * so unit suites run and integration suites fail loudly instead of touching
   * the development database.
   */
  process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit_tests?schema=public';
}
