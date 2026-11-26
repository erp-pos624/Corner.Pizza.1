/**
 * Sync the client-approved menu, store details, hours and Rehab delivery zone.
 *
 *   pnpm --filter @posshope/server menu:sync -- --file <path> [--branch MAIN]
 *        [--retire-unlisted] [--apply --confirm <db-host>]
 *
 * Without --apply it only prints what it would change. Applying to any
 * database that is not on this machine also needs --confirm with the
 * database host name, so it can't run against production by accident.
 *
 * Never deletes orders, shifts, users, stock or history. See
 * src/modules/menu/official-menu-sync.ts for exactly what it touches.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { officialDataSchema, syncOfficialMenu } from '../src/modules/menu/official-menu-sync.js';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const file = argValue('--file');
if (!file) {
  console.error('Missing --file <path to corner_pizza_official_menu_and_store_data.json>');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const retireUnlisted = process.argv.includes('--retire-unlisted');
const branchCode = argValue('--branch');

// Prefer the direct (session) connection for a long interactive transaction.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (or DIRECT_URL) for the target database.');
  process.exit(1);
}
const host = new URL(url).hostname;
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
console.log(`Target database host: ${host}${local ? ' (local)' : ''}`);
console.log(`Mode: ${apply ? 'APPLY' : 'dry run'}${retireUnlisted ? ', retire unlisted' : ''}\n`);

if (apply && !local && argValue('--confirm') !== host) {
  console.error(
    `Refusing to write to a remote database. Re-run with --confirm ${host} if this is intended.`,
  );
  process.exit(1);
}

const raw: unknown = JSON.parse(readFileSync(resolve(file), 'utf8'));
const data = officialDataSchema.parse(raw);

// The server package compiles scripts as CommonJS, so no top-level await.
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const summary = await syncOfficialMenu(prisma, data, {
      apply,
      branchCode,
      retireUnlisted,
      log: (line) => console.log(line),
    });
    console.log('\nSummary:', JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('\nSync failed; nothing was committed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
