/**
 * Platform contract, re-exported for the UI.
 *
 * The UI runs unchanged in Electron and in a browser. Everything
 * platform-specific sits behind `ClientBridge` (see `lib/bridge.ts`).
 */
import type { ClientBridge } from '@posshope/shared';

export type {
  ApiErrorShape,
  ApiRequestPayload,
  ApiResponse,
  AppInfo,
  ChangePasswordPayload,
  ClientBridge,
  ClientPlatform,
  HttpMethod,
  LoginPayload,
  LoginResult,
  PrintOptions,
  PrintResult,
  ServerHealth,
  SessionState,
  SessionUser,
} from '@posshope/shared';

/** Historical name of the bridge type; kept so existing code reads the same. */
export type PosshopeBridge = ClientBridge;
