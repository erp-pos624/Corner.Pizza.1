import type { RestaurantSettings } from '@prisma/client';
import { BUSINESS_DEFAULTS } from '@posshope/shared';
import type { PrismaLike } from './audit.js';
import { prisma } from '../prisma.js';

/**
 * Returns the singleton restaurant settings row, creating it from defaults on
 * first access so checkout and receipts never depend on seed data.
 */
export async function getSettings(client: PrismaLike = prisma): Promise<RestaurantSettings> {
  const existing = await client.restaurantSettings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return client.restaurantSettings.create({
    data: {
      id: 'default',
      name: 'Corner Pizza',
      tagline: 'Fresh from the oven, made to be shared.',
      taxRate: BUSINESS_DEFAULTS.taxRate,
      deliveryFee: BUSINESS_DEFAULTS.deliveryFee,
      maxCashierDiscountPct: BUSINESS_DEFAULTS.maxCashierDiscountPct,
      currency: BUSINESS_DEFAULTS.currency,
    },
  });
}
