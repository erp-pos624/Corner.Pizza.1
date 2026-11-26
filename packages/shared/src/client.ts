/**
 * The contract between the UI and the platform it runs on.
 *
 * The React UI never talks to the network, the file system or a printer
 * directly. It calls a `ClientBridge`, and each platform supplies its own
 * implementation:
 *
 *  - desktop: the Electron preload script (IPC to the main process),
 *  - web:     a `fetch`-based bridge running in the browser.
 *
 * This file must stay free of Node, Electron and DOM APIs.
 */

import type { Language } from './i18n.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiRequestPayload {
  method: HttpMethod;
  /** Path relative to the versioned API base, e.g. `/orders`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Admin branch scope, forwarded as the `x-branch-id` header. */
  branchId?: string;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export type ApiResponse<T = unknown> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorShape };

export type ClientPlatform = 'desktop' | 'web';

export interface AppInfo {
  name: string;
  version: string;
  /** Empty on the web. */
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  apiBaseUrl: string;
  isPackaged: boolean;
  terminalId: string;
  /** Which client is running. Absent on older desktop builds (treat as desktop). */
  client?: ClientPlatform;
}

export interface ServerHealth {
  reachable: boolean;
  status?: string;
  latencyMs?: number;
  error?: string;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  branchId?: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
  /** Response language for server-side validation and error messages. */
  language?: Language;
}

export interface LoginResult {
  user: SessionUser;
  permissions: string[];
  accessTokenExpiresIn: number;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  /** Response language for server-side validation and error messages. */
  language?: Language;
}

export interface SessionState {
  authenticated: boolean;
  user: SessionUser | null;
  permissions: string[];
}

export interface PrintOptions {
  /** Open the OS print dialog (default). Silent printing is desktop-only. */
  silent?: boolean;
  /** Print CSS backgrounds/graphics. Desktop-only; browsers follow user settings. */
  printBackground?: boolean;
  /** Target printer when `silent` is true. Desktop-only. */
  deviceName?: string;
  /** Language for print failure messages. */
  language?: Language;
}

export type PrintResult = { ok: true } | { ok: false; cancelled: boolean; error: string };

/** A printer installed on this computer (Windows spooler). */
export interface LocalPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface HtmlPrintJob {
  /** Self-contained HTML document (inline styles, data: images only). */
  html: string;
  /** Windows printer name; omitted opens the system dialog. */
  deviceName?: string;
  /** Roll width in millimetres (58 or 80). */
  paperWidthMm: number;
  silent: boolean;
  copies?: number;
}

export interface RawPrintJob {
  /** Printer on the restaurant LAN (private IPv4 address or hostname). */
  host: string;
  port: number;
  /** ESC/POS bytes, base64 encoded. */
  dataBase64: string;
}

/** Desktop-only printer access; absent in the browser build. */
export interface PrintingBridge {
  listPrinters(): Promise<LocalPrinterInfo[]>;
  printHtml(job: HtmlPrintJob): Promise<PrintResult>;
  printRaw(job: RawPrintJob): Promise<PrintResult>;
}

export interface ClientBridge {
  appInfo(): Promise<AppInfo>;
  health(): Promise<ServerHealth>;
  auth: {
    login(payload: LoginPayload): Promise<ApiResponse<LoginResult>>;
    changePassword(payload: ChangePasswordPayload): Promise<ApiResponse<LoginResult>>;
    logout(): Promise<void>;
    session(): Promise<SessionState>;
    /** Subscribe to session changes; returns an unsubscribe function. */
    onChange(listener: (state: SessionState) => void): () => void;
  };
  api: {
    request<T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>>;
  };
  /** Prints the current page; print CSS reveals the document to print. */
  print(options?: PrintOptions): Promise<PrintResult>;
  /** Silent and network printing; only the desktop app provides it. */
  printing?: PrintingBridge;
}
