import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config();

// `vercel link` / Marketplace integrations pull Supabase into the repo root.
const rootEnv = resolve(process.cwd(), '../../.env.local');
if (existsSync(rootEnv)) {
  config({ path: rootEnv });
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_MENU_BUCKET ?? 'menu-images';

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const response = await fetch(`${url}/storage/v1/bucket`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${key}`,
    apikey: key,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    id: bucket,
    name: bucket,
    public: true,
    file_size_limit: 200 * 1024,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
  }),
});

const body = await response.json().catch(() => null);

if (response.ok) {
  console.log(`Created public bucket "${bucket}" with a 200 KB limit.`);
} else if (response.status === 409 || body?.message === 'The resource already exists') {
  console.log(`Bucket "${bucket}" already exists.`);
} else {
  console.error(`Bucket setup failed (${response.status}):`, body ?? '');
  process.exit(1);
}
