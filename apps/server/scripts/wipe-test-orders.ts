/**
 * Remove test orders before handover (see src/modules/maintenance/wipe-test-orders.ts).
 *
 *   pnpm --filter @posshope/server data:wipe-test-orders            # dry run: counts only
 *   pnpm --filter @posshope/server data:wipe-test-orders --apply --backup-done --confirm <db-host>
 *        [--include-customers]
 *
 * Uses DIRECT_URL (Supabase session/direct connection, port 5432) when set.
 * Applying to a database that is not on this machine needs --confirm with the
 * exact database host and --backup-done.
 */
import { PrismaClient } from '@prisma/client';
import { wipeTestOrders } from '../src/modules/maintenance/wipe-test-orders.js';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const includeCustomers = process.argv.includes('--include-customers');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_URL (preferred) or DATABASE_URL for the target database.');
  process.exit(1);
}
const host = new URL(url).hostname;
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
console.log(`Target database host: ${host}${local ? ' (local)' : ''}`);
console.log(`Mode: ${apply ? 'APPLY (deletes data)' : 'dry run (read-only)'}\n`);

if (apply && !local) {
  if (argValue('--confirm') !== host) {
    console.error(`Refusing to delete on a remote database. Add --confirm ${host} if this is intended.`);
    process.exit(1);
  }
  if (!process.argv.includes('--backup-done')) {
    console.error('Take and verify a Supabase backup first, then add --backup-done.');
    process.exit(1);
  }
}

// The server package compiles scripts as CommonJS, so no top-level await.
async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const summary = await wipeTestOrders(prisma, {
      apply,
      includeCustomers,
      log: (line) => console.log(line),
    });
    console.log('\nSummary:', JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('\nCleanup failed; nothing was changed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
