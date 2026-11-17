import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { env } from '../env.js';

const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export interface UploadedMenuImage {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isStorageConfigured(): boolean {
  return configured;
}

/**
 * Stores a base64 data URI in the public Supabase Storage bucket. The service
 * role key bypasses RLS; the bucket itself caps file size and MIME types.
 */
export async function uploadMenuImage(dataUri: string): Promise<UploadedMenuImage> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/u.exec(dataUri);
  const mimeType = match?.[1];
  const base64 = match?.[2];
  const format = mimeType ? MIME_EXTENSIONS[mimeType] : undefined;
  if (!mimeType || !base64 || !format) {
    throw new AppError('Only JPEG, PNG, or WebP images are supported', { statusCode: 400 });
  }

  const bytes = Buffer.from(base64, 'base64');
  const bucket = env.SUPABASE_MENU_BUCKET;
  const path = `${randomUUID()}.${format}`;

  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': mimeType,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const reason =
      payload?.message ?? payload?.error ?? `Storage responded with ${response.status}`;
    throw new AppError(`Image upload failed: ${reason}`, {
      statusCode: 502,
      expose: true,
    });
  }

  return {
    url: `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
    publicId: `${bucket}/${path}`,
    bytes: bytes.length,
    format,
  };
}
