import { Router } from 'express';
import {
  basataSimulateSchema,
  onlineStoreQuerySchema,
  onlineStoreSettingsUpdateSchema,
  type OnlineStoreSettingsUpdateInput,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveBranchId } from '../../lib/branches.js';
import { ForbiddenError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { isBasataSimulationAllowed } from './basata.service.js';
import { applyOnlinePaymentStatus } from './online-payments.service.js';
import { getOnlineStoreOverview, updateOnlineStoreSettings } from './online-store.service.js';

export const onlineStoreRouter = Router();
onlineStoreRouter.use(authenticate);

onlineStoreRouter.get(
  '/',
  authorize('settings:manage'),
  validate({ query: onlineStoreQuerySchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await getOnlineStoreOverview(resolveBranchId(req)));
  }),
);

onlineStoreRouter.patch(
  '/settings',
  authorize('settings:manage'),
  validate({ body: onlineStoreSettingsUpdateSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as OnlineStoreSettingsUpdateInput;
    const settings = await updateOnlineStoreSettings(resolveBranchId(req), input, req.user!.id);
    res.status(200).json(settings);
  }),
);

/**
 * Drives the gateway lifecycle without live keys. Only available while
 * simulation is explicitly allowed (never in production by default).
 */
onlineStoreRouter.post(
  '/payments/simulate',
  authorize('settings:manage'),
  validate({ body: basataSimulateSchema }),
  asyncHandler(async (req, res) => {
    if (!isBasataSimulationAllowed()) {
      throw new ForbiddenError('Payment simulation is disabled in this environment');
    }
    const input = req.body as ReturnType<typeof basataSimulateSchema.parse>;
    const result = await applyOnlinePaymentStatus(input.reference, input.status, {
      source: 'simulation',
      rawPayload: { simulated: true, status: input.status },
    });
    res.status(200).json(result);
  }),
);
