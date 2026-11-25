/**
 * The IPC contract between the Electron main process and the renderer.
 *
 * This file is imported by main and preload, so it must stay free of Node and
 * DOM APIs. Channel names are the single source of truth for the preload
 * whitelist — nothing else is ever exposed to the renderer.
 *
 * The request/response shapes are the platform-neutral `ClientBridge` contract
 * from `@posshope/shared`, which the web client implements with `fetch`.
 */

import type { ClientBridge } from '@posshope/shared';

export const IPC = {
  appInfo: 'app:info',
  appHealth: 'app:health',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authChangePassword: 'auth:change-password',
  /** Main -> renderer push when the session changes (e.g. refresh, revocation). */
  authChanged: 'auth:changed',
  apiRequest: 'api:request',
  /** Renderer -> main: print the current window. */
  appPrint: 'app:print',
  /** Renderer -> main: installed Windows printers. */
  printersList: 'printers:list',
  /** Renderer -> main: silent receipt to a named printer. */
  printersPrintHtml: 'printers:print-html',
  /** Renderer -> main: raw ESC/POS to a LAN printer. */
  printersPrintRaw: 'printers:print-raw',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export type {
  ApiErrorShape,
  ApiRequestPayload,
  ApiResponse,
  AppInfo,
  ChangePasswordPayload,
  HtmlPrintJob,
  HttpMethod,
  LocalPrinterInfo,
  LoginPayload,
  LoginResult,
  PrintOptions,
  PrintResult,
  RawPrintJob,
  ServerHealth,
  SessionState,
  SessionUser,
} from '@posshope/shared';

/** Shape mounted on `window.posshope` by the preload bridge. */
export type PosshopeBridge = ClientBridge;
