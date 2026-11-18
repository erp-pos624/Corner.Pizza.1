import { Router } from 'express';
import {
  DEFAULT_STOREFRONT_CONTENT,
  storefrontContentSchema,
  type StorefrontContent,
  type StorefrontContentInput,
} from '@posshope/shared';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { recordAudit } from '../../lib/audit.js';
import { getSettings } from '../../lib/settings.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../prisma.js';

/** Stored copy that still validates; anything else falls back to the defaults. */
export async function getStorefrontContent(): Promise<StorefrontContent> {
  const settings = await getSettings();
  const parsed = storefrontContentSchema.safeParse(settings.storefront);
  return parsed.success ? parsed.data : DEFAULT_STOREFRONT_CONTENT;
}

export const storefrontRouter = Router();
storefrontRouter.use(authenticate);
storefrontRouter.use(authorize('settings:manage'));

storefrontRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getStorefrontContent());
  }),
);

storefrontRouter.put(
  '/',
  validate({ body: storefrontContentSchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const content = req.body as StorefrontContentInput;
    await prisma.restaurantSettings.update({
      where: { id: settings.id },
      data: { storefront: content as unknown as Prisma.InputJsonValue },
    });
    await recordAudit({
      action: 'storefront.updated',
      entityType: 'RestaurantSettings',
      entityId: settings.id,
      userId: req.user!.id,
      after: { sections: Object.keys(content) },
    });
    res.status(200).json(content);
  }),
);
