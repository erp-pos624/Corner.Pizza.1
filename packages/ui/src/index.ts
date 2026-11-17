/**
 * @posshope/ui — the Corner Pizza application UI.
 *
 * One React codebase shared by the Electron desktop client and the web client.
 * A host application supplies a `ClientBridge` (through `setBridge`, or the
 * Electron preload's `window.posshope`) and renders `<Root />`.
 */
export { Root, type RootProps } from './App';
export { getBridge, hasBridge, setBridge } from './lib/bridge';
export { initLanguage } from './lib/language';
export { initTheme } from './lib/theme';
export type * from './platform';
