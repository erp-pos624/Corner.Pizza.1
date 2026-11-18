import { Router } from 'express';
import { z } from 'zod';
import {
  publicDeliveryCheckSchema,
  publicMenuQuerySchema,
  publicOrderCreateSchema,
  publicQuoteSchema,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError, ValidationError } from '../../lib/errors.js';
import { optionalCustomer } from '../../middleware/authenticateCustomer.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { parseBasataWebhook, verifyBasataSignature } from '../online-store/basata.service.js';
import {
  applyOnlinePaymentStatus,
  findPublicOrder,
  getPaymentCallbackState,
} from '../online-store/online-payments.service.js';
import { env } from '../../env.js';
import { prisma } from '../../prisma.js';
import { customerAccountRouter } from '../customer-account/customer-account.routes.js';
import { quoteOrder } from '../orders/orders.service.js';
import { checkPublicDelivery, getPublicMenu, getPublicSettings, listPublicBranches } from './public-menu.service.js';
import { getStorefrontContent } from '../storefront/storefront.routes.js';
import { placePublicOrder } from './public-order.service.js';

export const publicRouter = Router();

// Website customer accounts (register, sign in, profile, addresses, own orders).
publicRouter.use('/account', customerAccountRouter);

const orderLookupParams = z.object({
  orderNumber: z.string().trim().min(4).max(64),
});
const orderLookupQuery = z.object({
  phone: z.string().trim().min(6).max(30),
});
const callbackQuery = z.object({
  reference: z.string().trim().min(4).max(120),
});

publicRouter.get(
  '/branches',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listPublicBranches());
  }),
);

publicRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getPublicSettings());
  }),
);

publicRouter.get(
  '/storefront',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getStorefrontContent());
  }),
);

publicRouter.get(
  '/menu',
  validate({ query: publicMenuQuerySchema }),
  asyncHandler(async (req, res) => {
    const branchId = (req.query as z.infer<typeof publicMenuQuerySchema>).branchId;
    res.status(200).json(await getPublicMenu(branchId));
  }),
);

publicRouter.post(
  '/delivery/check-zone',
  rateLimit({ name: 'public:delivery-check', windowMs: 60_000, max: 60 }),
  validate({ body: publicDeliveryCheckSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof publicDeliveryCheckSchema>;
    res.status(200).json(await checkPublicDelivery(input));
  }),
);

/**
 * Cart pricing. The storefront sends item ids and quantities; subtotal, tax,
 * delivery fee and total are computed here with the checkout's own logic.
 */
publicRouter.post(
  '/orders/quote',
  rateLimit({ name: 'public:quote', windowMs: 60_000, max: 120 }),
  validate({ body: publicQuoteSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await quoteOrder(req.body as z.infer<typeof publicQuoteSchema>));
  }),
);

publicRouter.post(
  '/orders',
  rateLimit({ name: 'public:orders', windowMs: 60_000, max: 10 }),
  optionalCustomer,
  validate({ body: publicOrderCreateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof publicOrderCreateSchema>;
    if (!req.customer) {
      res.status(201).json(await placePublicOrder(input));
      return;
    }
    // Signed in: the order belongs to the account behind the token, and the
    // contact details come from that account rather than the request.
    const account = await prisma.customer.findUniqueOrThrow({
      where: { id: req.customer.id },
      select: { id: true, name: true, phone: true },
    });
    res.status(201).json(
      await placePublicOrder(
        { ...input, customerName: account.name, customerPhone: account.phone ?? input.customerPhone },
        account.id,
      ),
    );
  }),
);

publicRouter.get(
  '/orders/:orderNumber',
  rateLimit({ name: 'public:order-lookup', windowMs: 60_000, max: 30 }),
  validate({ params: orderLookupParams, query: orderLookupQuery }),
  asyncHandler(async (req, res) => {
    const { orderNumber } = req.params as z.infer<typeof orderLookupParams>;
    const { phone } = req.query as z.infer<typeof orderLookupQuery>;
    res.status(200).json(await findPublicOrder(orderNumber, phone));
  }),
);

/**
 * Basata webhook. `app.ts` mounts a raw body parser ahead of the JSON parser so
 * the HMAC is verified against the exact bytes the gateway signed.
 */
publicRouter.post(
  '/payments/basata/webhook',
  asyncHandler(async (req, res) => {
    if (!env.BASATA_WEBHOOK_SECRET) {
      throw new AppError('Basata webhooks are not configured', {
        statusCode: 503,
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      });
    }
    if (!Buffer.isBuffer(req.body)) {
      throw new ValidationError('The webhook payload could not be read as raw bytes');
    }
    const signature =
      req.header('x-basata-signature') ??
      req.header('x-webhook-signature') ??
      req.header('x-signature');
    if (!verifyBasataSignature(req.body, signature)) {
      throw new AppError('Invalid webhook signature', {
        statusCode: 401,
        code: 'INVALID_WEBHOOK_SIGNATURE',
      });
    }

    const event = parseBasataWebhook(req.body);
    const result = await applyOnlinePaymentStatus(event.reference, event.status, {
      source: 'webhook',
      providerRef: event.providerRef,
      amount: event.amount,
      rawPayload: event.rawPayload,
    });
    res.status(200).json({
      ok: true,
      reference: event.reference,
      status: result.payment.status,
      orderNumber: result.order.orderNumber,
    });
  }),
);

/** Hosted-checkout return lookup. Never mutates state. */
publicRouter.get(
  '/payments/basata/callback',
  rateLimit({ name: 'public:payment-callback', windowMs: 60_000, max: 60 }),
  validate({ query: callbackQuery }),
  asyncHandler(async (req, res) => {
    const { reference } = req.query as z.infer<typeof callbackQuery>;
    res.status(200).json(await getPaymentCallbackState(reference));
  }),
);
