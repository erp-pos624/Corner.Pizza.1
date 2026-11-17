import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  idSchema,
  orderAddItemsSchema,
  orderCancelSchema,
  orderCreateSchema,
  orderQuerySchema,
  orderRefundSchema,
  orderSettleSchema,
  orderStatusUpdateSchema,
  type OrderAddItemsInput,
  type OrderCancelInput,
  type OrderCreateInput,
  type OrderQuery,
  type OrderRefundInput,
  type OrderSettleInput,
  type OrderStatus,
  type OrderStatusUpdateInput,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveBranchId, resolveTerminalId } from '../../lib/branches.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as ordersService from './orders.service.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

function orderContext(req: Request): { branchId: string; terminalId: string } {
  return { branchId: resolveBranchId(req), terminalId: resolveTerminalId(req) };
}

ordersRouter.get(
  '/',
  authorize('orders:read:own'),
  validate({ query: orderQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await ordersService.listOrders(req.query as unknown as OrderQuery, req.user!);
    res.status(200).json(result);
  }),
);

ordersRouter.post(
  '/',
  authorize('orders:create'),
  rateLimit({ name: 'orders:create', windowMs: 60_000, max: 90 }),
  validate({ body: orderCreateSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.createOrder(
      req.body as OrderCreateInput,
      req.user!,
      orderContext(req),
    );
    res.status(201).json(order);
  }),
);

ordersRouter.get(
  '/:id',
  authorize('orders:read:own'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.getOrder(req.params.id!, req.user!);
    res.status(200).json(order);
  }),
);

ordersRouter.post(
  '/:id/items',
  authorize('orders:update'),
  validate({ params: idParams, body: orderAddItemsSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OrderAddItemsInput;
    const order = await ordersService.addOrderItems(req.params.id!, input, req.user!);
    res.status(200).json(order);
  }),
);

ordersRouter.post(
  '/:id/settle',
  authorize('orders:update'),
  validate({ params: idParams, body: orderSettleSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OrderSettleInput;
    const order = await ordersService.settleOrder(
      req.params.id!,
      input,
      req.user!,
      orderContext(req),
    );
    res.status(200).json(order);
  }),
);

ordersRouter.post(
  '/:id/refund',
  authorize('refunds:create'),
  validate({ params: idParams, body: orderRefundSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OrderRefundInput;
    const order = await ordersService.refundOrder(
      req.params.id!,
      input,
      req.user!,
      orderContext(req),
    );
    res.status(200).json(order);
  }),
);

ordersRouter.patch(
  '/:id/status',
  authorize('orders:update'),
  validate({ params: idParams, body: orderStatusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OrderStatusUpdateInput;
    const order = await ordersService.updateOrderStatus(
      req.params.id!,
      input.status as OrderStatus,
      req.user!,
    );
    res.status(200).json(order);
  }),
);

ordersRouter.post(
  '/:id/cancel',
  authorize('orders:cancel'),
  validate({ params: idParams, body: orderCancelSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OrderCancelInput;
    const order = await ordersService.cancelOrder(
      req.params.id!,
      input.reason,
      req.user!,
      orderContext(req),
    );
    res.status(200).json(order);
  }),
);
