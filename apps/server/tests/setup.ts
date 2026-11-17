import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Integration suites run against a dedicated database. Point Prisma at
 * `TEST_DATABASE_URL` before `env.ts` is imported by any module.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

/**
 * Unit suites mock Prisma, but `env.ts` still validates `DATABASE_URL` at
 * import time. On a checkout that has not been bootstrapped (no `.env`), give
 * it an unreachable placeholder so those suites can run without a database.
 * A real `.env` always wins: the placeholder is only set when none exists.
 */
if (!process.env.DATABASE_URL && !existsSync(resolve(process.cwd(), '.env'))) {
  process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit_tests?schema=public';
}
