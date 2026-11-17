import { z } from 'zod';
import { ONLINE_PAYMENT_METHODS, ORDER_CHANNELS } from '../constants.js';
import { optionalTrimmedString } from './common.js';
import { moneyString } from './menu.js';
import { orderItemInputSchema } from './order.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

const onlineTime = z.string().trim().regex(HHMM, 'Use 24-hour HH:mm format').nullable();

/** Per-branch storefront switch and online-only opening window. */
export const onlineStoreSettingsUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    openTime: onlineTime.optional(),
    closeTime: onlineTime.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.openTime === undefined) !== (value.closeTime === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set both online opening and closing times, or leave both empty',
        path: [value.openTime === undefined ? 'openTime' : 'closeTime'],
      });
    }
    if (value.openTime && value.closeTime && value.openTime === value.closeTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening and closing times must differ',
        path: ['closeTime'],
      });
    }
  });
export type OnlineStoreSettingsUpdateInput = z.infer<typeof onlineStoreSettingsUpdateSchema>;

export const onlineStoreQuerySchema = z.object({
  branchId: optionalTrimmedString(64),
});
export type OnlineStoreQuery = z.infer<typeof onlineStoreQuerySchema>;

export const publicMenuQuerySchema = z.object({
  branchId: z.string().trim().min(1, 'Choose a branch'),
});
export type PublicMenuQuery = z.infer<typeof publicMenuQuerySchema>;

/**
 * Location lookup for the storefront. Coordinates give an exact zone match;
 * a street address is geocoded server-side when possible. When only an address
 * is supplied and it cannot be resolved, the response asks for a map pin.
 */
export const publicDeliveryCheckSchema = z
  .object({
    branchId: z.string().trim().min(1, 'Choose a branch'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    address: optionalTrimmedString(300),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.lat == null) !== (value.lng == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both latitude and longitude, or neither',
        path: [value.lat == null ? 'lat' : 'lng'],
      });
    }
    if (value.lat == null && !value.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add a delivery address or drop a pin on the map',
        path: ['address'],
      });
    }
  });
export type PublicDeliveryCheckInput = z.infer<typeof publicDeliveryCheckSchema>;

/** Storefront checkout. Prices, fees and stock are always re-verified server-side. */
export const publicOrderCreateSchema = z
  .object({
    branchId: z.string().trim().min(1, 'Choose a branch'),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
    customerName: z.string().trim().min(2, 'Enter the customer name').max(120),
    customerPhone: z.string().trim().min(6, 'Enter a contact phone number').max(30),
    fulfillment: z.enum(['DELIVERY', 'TAKEAWAY']),
    customerAddress: optionalTrimmedString(300),
    customerLat: z.number().min(-90).max(90).nullable().optional(),
    customerLng: z.number().min(-180).max(180).nullable().optional(),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one item').max(50),
    paymentMethod: z.enum(ONLINE_PAYMENT_METHODS),
    deliveryZoneId: z.string().trim().min(1).nullable().optional(),
    expectedDeliveryFee: moneyString.optional(),
    notes: optionalTrimmedString(600),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.customerLat == null) !== (value.customerLng == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both latitude and longitude, or neither',
        path: [value.customerLat == null ? 'customerLat' : 'customerLng'],
      });
    }
    if (value.fulfillment === 'DELIVERY' && !value.customerAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A delivery address is required for delivery orders',
        path: ['customerAddress'],
      });
    }
    if (value.paymentMethod === 'CASH' && value.fulfillment !== 'DELIVERY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cash payments are only available on delivery orders',
        path: ['paymentMethod'],
      });
    }
  });
export type PublicOrderCreateInput = z.infer<typeof publicOrderCreateSchema>;

export const orderChannelSchema = z.enum(ORDER_CHANNELS);

export const basataSimulateSchema = z
  .object({
    reference: z.string().trim().min(4).max(120),
    status: z.enum(['PAID', 'FAILED', 'EXPIRED']).default('PAID'),
  })
  .strict();
export type BasataSimulateInput = z.infer<typeof basataSimulateSchema>;
