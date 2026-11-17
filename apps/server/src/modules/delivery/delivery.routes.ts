import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  deliveryAssignSchema,
  deliveryQuerySchema,
  deliveryStatusSchema,
  deliveryZoneCheckSchema,
  driverSettlementQuerySchema,
  driverSettlementSchema,
  driverSettlementSettleSchema,
  idSchema,
  type DeliveryAssignInput,
  type DeliveryQuery,
  type DeliveryStatusInput,
  type DeliveryZoneCheckInput,
  type DriverSettlementInput,
  type DriverSettlementQuery,
  type DriverSettlementSettleInput,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveBranchId } from '../../lib/branches.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as zonesService from '../delivery-zones/delivery-zones.service.js';
import * as deliveryService from './delivery.service.js';

export const deliveryRouter = Router();
deliveryRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

function branchScope(req: Request): string | undefined {
  if (req.user!.role === 'ADMIN') {
    const requested = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    return requested && requested !== 'all' ? requested : undefined;
  }
  return resolveBranchId(req);
}

function actorFor(req: Request): deliveryService.DeliveryActor {
  const user = req.user!;
  return { id: user.id, role: user.role, branchId: user.branchId };
}

deliveryRouter.get(
  '/orders',
  authorize('delivery:view'),
  validate({ query: deliveryQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.listDeliveryOrders(
      req.query as unknown as DeliveryQuery,
      actorFor(req),
      branchScope(req),
    );
    res.status(200).json(result);
  }),
);

/**
 * Zone lookup used by the POS map picker. Cashiers are branch-bound; an
 * administrator may test any branch by supplying `branchId`.
 */
deliveryRouter.post(
  '/check-zone',
  authorize('delivery:view'),
  validate({ body: deliveryZoneCheckSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as DeliveryZoneCheckInput;
    const branchId =
      req.user!.role === 'ADMIN' && input.branchId ? input.branchId : resolveBranchId(req);
    const result = await zonesService.checkDeliveryZone(input, branchId);
    res.status(200).json(result);
  }),
);

deliveryRouter.get(
  '/drivers',
  authorize('delivery:manage'),
  asyncHandler(async (req, res) => {
    const drivers = await deliveryService.listDrivers(branchScope(req) ?? '');
    res.status(200).json(drivers);
  }),
);

deliveryRouter.post(
  '/orders/:id/assign',
  authorize('delivery:manage'),
  validate({ params: idParams, body: deliveryAssignSchema }),
  asyncHandler(async (req, res) => {
    const order = await deliveryService.assignDriver(
      req.params.id!,
      req.body as DeliveryAssignInput,
      actorFor(req),
    );
    res.status(200).json(order);
  }),
);

deliveryRouter.patch(
  '/orders/:id/status',
  authorize('delivery:update'),
  validate({ params: idParams, body: deliveryStatusSchema }),
  asyncHandler(async (req, res) => {
    const order = await deliveryService.updateDeliveryStatus(
      req.params.id!,
      req.body as DeliveryStatusInput,
      actorFor(req),
    );
    res.status(200).json(order);
  }),
);

deliveryRouter.get(
  '/settlements',
  authorize('settlements:view'),
  validate({ query: driverSettlementQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.listSettlements(
      req.query as unknown as DriverSettlementQuery,
      actorFor(req),
      branchScope(req),
    );
    res.status(200).json(result);
  }),
);

deliveryRouter.post(
  '/settlements',
  authorize('settlements:manage'),
  validate({ body: driverSettlementSchema }),
  asyncHandler(async (req, res) => {
    const settlement = await deliveryService.createSettlement(
      req.body as DriverSettlementInput,
      actorFor(req),
    );
    res.status(201).json(settlement);
  }),
);

deliveryRouter.get(
  '/settlements/:id',
  authorize('settlements:view'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const settlement = await deliveryService.getSettlement(req.params.id!, actorFor(req));
    res.status(200).json(settlement);
  }),
);

deliveryRouter.post(
  '/settlements/:id/settle',
  authorize('settlements:manage'),
  validate({ params: idParams, body: driverSettlementSettleSchema }),
  asyncHandler(async (req, res) => {
    const settlement = await deliveryService.settleSettlement(
      req.params.id!,
      req.body as DriverSettlementSettleInput,
      actorFor(req),
    );
    res.status(200).json(settlement);
  }),
);
