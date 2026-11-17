/**
 * Minimal pre-render boot: applies the stored theme and language to `<html>`
 * before React mounts, so there is no flash of the wrong theme or direction.
 * Kept separate from `index.ts` so the entry script stays tiny.
 */
export { initLanguage } from './lib/language';
export { initTheme } from './lib/theme';
