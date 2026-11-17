import { Router, type Request } from 'express';
import { changePasswordSchema, loginSchema, refreshSchema } from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { clearRefreshCookie, readRefreshCookie, sendWebSession } from '../../lib/webSession.js';
import { authenticate } from '../../middleware/authenticate.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { requireWebClient } from '../../middleware/requireWebClient.js';
import { validate } from '../../middleware/validate.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  name: 'auth:login',
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Try again shortly',
});

// Generous enough for several terminals behind one NAT address, tight enough to
// make guessing refresh tokens pointless.
const refreshLimiter = rateLimit({
  name: 'auth:refresh',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many session refresh attempts. Try again shortly',
});

function loginContext(req: Request): authService.LoginContext {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
    terminalId: req.header('x-terminal-id')?.slice(0, 64) ?? undefined,
  };
}

// --- Native clients (Electron main process): tokens in the JSON body --------

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body, loginContext(req));
    res.status(200).json(session);
  }),
);

authRouter.post(
  '/refresh',
  refreshLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.refresh(req.body.refreshToken, loginContext(req));
    res.status(200).json(session);
  }),
);

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.sessionId, req.user!.id);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await authService.getSessionUser(req.user!.id);
    res.status(200).json(result);
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.changePassword(req.user!.id, req.body, loginContext(req));
    res.status(200).json(session);
  }),
);

// --- Browser clients: refresh token in an HttpOnly cookie -------------------
// Same service functions as above; only the token transport differs. Every
// route is guarded by `requireWebClient` (custom header + trusted origin).

authRouter.post(
  '/web/login',
  loginLimiter,
  requireWebClient,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body, loginContext(req));
    sendWebSession(res, session);
  }),
);

authRouter.post(
  '/web/refresh',
  refreshLimiter,
  requireWebClient,
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) throw new UnauthenticatedError();
    try {
      const session = await authService.refresh(refreshToken, loginContext(req));
      sendWebSession(res, session);
    } catch (error) {
      // A dead token must not be replayed on every page load.
      clearRefreshCookie(res);
      throw error;
    }
  }),
);

authRouter.post(
  '/web/logout',
  requireWebClient,
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshCookie(req);
    clearRefreshCookie(res);
    if (refreshToken) await authService.logoutByRefreshToken(refreshToken);
    res.status(204).send();
  }),
);

authRouter.post(
  '/web/change-password',
  requireWebClient,
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.changePassword(req.user!.id, req.body, loginContext(req));
    sendWebSession(res, session);
  }),
);
