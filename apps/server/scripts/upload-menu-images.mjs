import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

/**
 * Moves bundled menu photos (`forno-asset:<key>`) to Supabase Storage without
 * re-encoding them, then repoints the menu rows at the public URLs.
 *
 * The Supabase bucket caps objects at 200 KB, so oversized sources fail here
 * instead of being silently rejected by storage. Re-running is safe: objects
 * are addressed by content hash and rows already migrated are skipped.
 *
 * Usage: run from apps/server. Add `--dry-run` to validate without uploading.
 */
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '../..');

config({ path: resolve(appRoot, '.env') });
// `vercel env pull` writes Supabase credentials to the repo root.
config({ path: resolve(repoRoot, '.env.local') });

const MAX_BYTES = 200 * 1024;
const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_ARG = process.argv.find((arg) => arg.startsWith('--backup='));
const BACKUP_PATH = BACKUP_ARG
  ? resolve(process.cwd(), BACKUP_ARG.slice('--backup='.length))
  : null;
const ASSET_PREFIX = 'forno-asset:';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_MENU_BUCKET ?? 'menu-images';

if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const prisma = new PrismaClient();

const databaseLabel = (() => {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'unknown database';
  }
})();

function assetPath(key) {
  const base = resolve(repoRoot, 'packages/ui/src/assets/products', key);
  for (const extension of ['.jpg', '.jpeg', '.png', '.webp']) {
    if (existsSync(base + extension)) {
      const mime =
        extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
      return { path: base + extension, mime, extension: extension === '.jpeg' ? '.jpg' : extension };
    }
  }
  throw new Error(`Missing bundled asset for key "${key}"`);
}

async function uploadObject(objectPath, bytes, mime) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? payload?.error ?? `storage responded ${response.status}`);
  }
}

async function verifyPublicUrl(url, expectedBytes, mime) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`public fetch returned ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith(mime)) {
    throw new Error(`unexpected content-type ${contentType}`);
  }
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes !== expectedBytes) {
    throw new Error(`size mismatch: expected ${expectedBytes}, got ${bytes}`);
  }
}

async function main() {
  console.log(`target database: ${databaseLabel}`);
  const items = await prisma.menuItem.findMany({
    where: { imageUrl: { startsWith: ASSET_PREFIX } },
    select: { id: true, name: true, imageUrl: true },
  });

  const byKey = new Map();
  for (const item of items) {
    const key = item.imageUrl.slice(ASSET_PREFIX.length);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }

  console.log(`menu rows with bundled assets: ${items.length} (${byKey.size} unique images)`);
  if (items.length === 0) {
    console.log('nothing to migrate');
    return;
  }
  if (BACKUP_PATH && !DRY_RUN) {
    mkdirSync(dirname(BACKUP_PATH), { recursive: true });
    writeFileSync(
      BACKUP_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), database: databaseLabel, items }, null, 2),
    );
    console.log('backup written:', BACKUP_PATH);
  }

  const migrated = [];
  const failures = [];

  for (const [key, rows] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const asset = assetPath(key);
      const bytes = readFileSync(asset.path);
      if (bytes.byteLength > MAX_BYTES) {
        throw new Error(`${bytes.byteLength} bytes exceeds the 200 KB cap`);
      }
      const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      const objectPath = `menu/${key}-${digest}${asset.extension}`;
      const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;

      if (!DRY_RUN) {
        await uploadObject(objectPath, bytes, asset.mime);
        await verifyPublicUrl(url, bytes.byteLength, asset.mime);
      }

      migrated.push({ key, url, bytes: bytes.byteLength, rows: rows.length });
      console.log(
        `${DRY_RUN ? 'dry-run ' : 'uploaded'}  ${key}  ${(bytes.byteLength / 1024).toFixed(0)} KB  ${rows.length} row(s)`,
      );
    } catch (error) {
      failures.push({ key, error: error.message });
      console.error(`FAILED   ${key}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`aborting without database changes (${failures.length} image(s) failed)`);
    process.exitCode = 1;
    return;
  }
  if (DRY_RUN) {
    console.log('dry run: no objects uploaded, no rows updated');
    return;
  }

  const counts = await prisma.$transaction(
    migrated.map(({ key, url }) =>
      prisma.menuItem.updateMany({
        where: { imageUrl: `${ASSET_PREFIX}${key}` },
        data: { imageUrl: url },
      }),
    ),
  );

  let updated = 0;
  migrated.forEach((entry, index) => {
    updated += counts[index].count;
    console.log(`linked   ${entry.key}: ${counts[index].count} row(s) -> ${entry.url}`);
  });
  console.log(`done: ${migrated.length} object(s), ${updated} menu row(s) updated, 0 failures`);
}

main()
  .catch((error) => {
    console.error('migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
