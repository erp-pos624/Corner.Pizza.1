import { Router, type CookieOptions, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  customerAddressSchema,
  customerChangePasswordSchema,
  customerLoginSchema,
  customerProfileUpdateSchema,
  customerRegisterSchema,
  paginationSchema,
} from '@posshope/shared';
import { env, isProduction } from '../../env.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { readCookie } from '../../lib/webSession.js';
import { authenticateCustomer } from '../../middleware/authenticateCustomer.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { requireWebClient } from '../../middleware/requireWebClient.js';
import { validate } from '../../middleware/validate.js';
import * as accounts from './customer-account.service.js';

/**
 * `/api/public/account` — website customer accounts.
 *
 * Mirrors the staff web transport: the access token is returned in the body
 * and held in memory by the page, while the refresh token only ever travels in
 * an HttpOnly cookie scoped to this router. The cookie has its own name and
 * path, so it is never sent to (or accepted by) the staff auth routes.
 */
export const customerAccountRouter = Router();

const COOKIE = 'forno_crt';
const COOKIE_PATH = '/api/public/account';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.WEB_COOKIE_SECURE ? env.WEB_COOKIE_SECURE === 'true' : isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
  };
}

function send(res: Response, issued: accounts.IssuedCustomerSession, status = 200): void {
  res.cookie(COOKIE, issued.refreshToken, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  res.status(status).setHeader('cache-control', 'no-store').json(issued.session);
}

function context(req: Request): accounts.CustomerContext {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

const signInLimiter = rateLimit({
  name: 'customer:sign-in',
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Try again shortly',
});
const registerLimiter = rateLimit({
  name: 'customer:register',
  // Per IP. Loose enough for several people behind one shared connection.
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many sign-up attempts. Try again later',
});
const refreshLimiter = rateLimit({ name: 'customer:refresh', windowMs: 60 * 1000, max: 60 });

const addressParams = z.object({ id: z.string().trim().min(1).max(64) });
const orderParams = z.object({ orderNumber: z.string().trim().min(4).max(64) });

customerAccountRouter.post(
  '/register',
  registerLimiter,
  requireWebClient,
  validate({ body: customerRegisterSchema }),
  asyncHandler(async (req, res) => {
    send(res, await accounts.register(req.body, context(req)), 201);
  }),
);

customerAccountRouter.post(
  '/login',
  signInLimiter,
  requireWebClient,
  validate({ body: customerLoginSchema }),
  asyncHandler(async (req, res) => {
    send(res, await accounts.login(req.body, context(req)));
  }),
);

customerAccountRouter.post(
  '/refresh',
  refreshLimiter,
  requireWebClient,
  asyncHandler(async (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    if (!token) throw new UnauthenticatedError();
    try {
      send(res, await accounts.refresh(token, context(req)));
    } catch (error) {
      res.clearCookie(COOKIE, cookieOptions());
      throw error;
    }
  }),
);

customerAccountRouter.post(
  '/logout',
  requireWebClient,
  asyncHandler(async (req, res) => {
    const token = readCookie(req.headers.cookie, COOKIE);
    res.clearCookie(COOKIE, cookieOptions());
    if (token) await accounts.logoutByRefreshToken(token);
    res.status(204).send();
  }),
);

// Everything below acts on `req.customer.id` — the id from the verified token.
customerAccountRouter.use(authenticateCustomer);

customerAccountRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.status(200).json(await accounts.getAccount(req.customer!.id));
  }),
);

customerAccountRouter.patch(
  '/me',
  validate({ body: customerProfileUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await accounts.updateProfile(req.customer!.id, req.body));
  }),
);

customerAccountRouter.post(
  '/change-password',
  requireWebClient,
  validate({ body: customerChangePasswordSchema }),
  asyncHandler(async (req, res) => {
    send(res, await accounts.changePassword(req.customer!.id, req.body, context(req)));
  }),
);

customerAccountRouter.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    res.status(200).json(await accounts.listAddresses(req.customer!.id));
  }),
);

customerAccountRouter.post(
  '/addresses',
  validate({ body: customerAddressSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await accounts.createAddress(req.customer!.id, req.body));
  }),
);

customerAccountRouter.put(
  '/addresses/:id',
  validate({ params: addressParams, body: customerAddressSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await accounts.updateAddress(req.customer!.id, req.params.id!, req.body));
  }),
);

customerAccountRouter.delete(
  '/addresses/:id',
  validate({ params: addressParams }),
  asyncHandler(async (req, res) => {
    await accounts.deleteAddress(req.customer!.id, req.params.id!);
    res.status(204).send();
  }),
);

customerAccountRouter.get(
  '/orders',
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as z.infer<typeof paginationSchema>;
    res.status(200).json(await accounts.listOrders(req.customer!.id, page, pageSize));
  }),
);

customerAccountRouter.get(
  '/orders/:orderNumber',
  validate({ params: orderParams }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await accounts.getOrder(req.customer!.id, req.params.orderNumber!));
  }),
);
