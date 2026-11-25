import { describe, expect, it } from 'vitest';
import { envSchema, ignoredDisplaySettings } from './env.js';

const base = { DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db' };

describe('envSchema optional settings', () => {
  it('treats empty and whitespace-only DESKTOP_* and SUPABASE_* values as not set', () => {
    const parsed = envSchema.parse({
      ...base,
      DESKTOP_DOWNLOAD_URL: '',
      DESKTOP_VERSION: '   ',
      DESKTOP_SHA256: ' ',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '  ',
      SUPABASE_MENU_BUCKET: '',
    });
    expect(parsed.DESKTOP_DOWNLOAD_URL).toBeUndefined();
    expect(parsed.DESKTOP_VERSION).toBeUndefined();
    expect(parsed.DESKTOP_SHA256).toBeUndefined();
    expect(parsed.SUPABASE_URL).toBeUndefined();
    expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    // A blank bucket falls back to the default instead of becoming ''.
    expect(parsed.SUPABASE_MENU_BUCKET).toBe('menu-images');
  });

  it('keeps valid values', () => {
    const sha = 'a'.repeat(64);
    const parsed = envSchema.parse({
      ...base,
      DESKTOP_DOWNLOAD_URL: 'https://example.com/CornerPOS-Setup-0.1.5.exe',
      DESKTOP_VERSION: ' 0.1.5 ',
      DESKTOP_SHA256: sha,
      SUPABASE_URL: 'https://project.supabase.co',
    });
    expect(parsed.DESKTOP_DOWNLOAD_URL).toBe('https://example.com/CornerPOS-Setup-0.1.5.exe');
    expect(parsed.DESKTOP_VERSION).toBe('0.1.5');
    expect(parsed.DESKTOP_SHA256).toBe(sha);
    expect(parsed.SUPABASE_URL).toBe('https://project.supabase.co');
  });

  it('drops invalid display-only DESKTOP_* values instead of failing startup', () => {
    const source = { ...base, DESKTOP_DOWNLOAD_URL: 'not a url', DESKTOP_SHA256: 'xyz' };
    const result = envSchema.safeParse(source);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.DESKTOP_DOWNLOAD_URL).toBeUndefined();
    expect(result.data.DESKTOP_SHA256).toBeUndefined();
    expect(ignoredDisplaySettings(source, result.data)).toEqual([
      'DESKTOP_DOWNLOAD_URL',
      'DESKTOP_SHA256',
    ]);
  });

  it('still rejects a malformed non-empty SUPABASE_URL', () => {
    expect(envSchema.safeParse({ ...base, SUPABASE_URL: 'not a url' }).success).toBe(false);
  });
});
