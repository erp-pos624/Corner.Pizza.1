import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  deliveryZoneCreateSchema,
  deliveryZoneQuerySchema,
  deliveryZoneUpdateSchema,
  idSchema,
  type DeliveryZoneCreateInput,
  type DeliveryZoneQuery,
  type DeliveryZoneUpdateInput,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveBranchId } from '../../lib/branches.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as zonesService from './delivery-zones.service.js';

export const deliveryZonesRouter = Router();
deliveryZonesRouter.use(authenticate);

const idParams = z.object({ id: idSchema });

/** Administrators may inspect every branch; everyone else is branch-bound. */
function zoneScope(req: Request): string | 'all' {
  if (req.user!.role === 'ADMIN') {
    const requested =
      (typeof req.query.branchId === 'string' ? req.query.branchId : undefined) ??
      req.header('x-branch-id') ??
      undefined;
    return requested ?? 'all';
  }
  return resolveBranchId(req);
}

function actorFor(req: Request): zonesService.ZoneActor {
  const user = req.user!;
  return { id: user.id, role: user.role, branchId: user.branchId };
}

deliveryZonesRouter.get(
  '/',
  authorize('delivery:view'),
  validate({ query: deliveryZoneQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as DeliveryZoneQuery;
    const includeInactive = req.user!.role === 'ADMIN' && query.includeInactive;
    const zones = await zonesService.listDeliveryZones(zoneScope(req), includeInactive);
    res.status(200).json(zones);
  }),
);

deliveryZonesRouter.post(
  '/',
  authorize('delivery:zones'),
  validate({ body: deliveryZoneCreateSchema }),
  asyncHandler(async (req, res) => {
    const zone = await zonesService.createDeliveryZone(
      req.body as DeliveryZoneCreateInput,
      actorFor(req),
    );
    res.status(201).json(zone);
  }),
);

deliveryZonesRouter.patch(
  '/:id',
  authorize('delivery:zones'),
  validate({ params: idParams, body: deliveryZoneUpdateSchema }),
  asyncHandler(async (req, res) => {
    const zone = await zonesService.updateDeliveryZone(
      req.params.id!,
      req.body as DeliveryZoneUpdateInput,
      actorFor(req),
    );
    res.status(200).json(zone);
  }),
);

deliveryZonesRouter.delete(
  '/:id',
  authorize('delivery:zones'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await zonesService.deleteDeliveryZone(req.params.id!, actorFor(req));
    res.status(204).send();
  }),
);
