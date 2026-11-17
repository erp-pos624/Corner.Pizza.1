import { z } from 'zod';
import { optionalTrimmedString } from './common.js';
import { orderItemInputSchema } from './order.js';

/**
 * Website customer accounts.
 *
 * Customers are a separate kind of principal from staff: they live in the
 * `customers` table, sign in through `/api/public/account/*`, and receive
 * tokens that the staff API refuses. Nothing here can grant a staff role.
 */

/** Digits with an optional leading `+`; spaces, dashes and brackets removed. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Enter your phone number')
  .max(30)
  .transform(normalizePhone)
  .refine((value) => /^\+?\d{8,15}$/.test(value), 'Enter a valid phone number');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .email('Enter a valid email address');

/** Blank strings from optional form fields become `undefined`. */
const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  emailSchema.optional(),
);

export const customerPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Za-z]/u, 'Password must contain a letter')
  .regex(/\d/u, 'Password must contain a number');

export const customerRegisterSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    phone: phoneSchema,
    email: optionalEmail,
    password: customerPasswordSchema,
  })
  .strict();
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerLoginSchema = z
  .object({
    /** Phone number or email address. */
    identifier: z.string().trim().min(3, 'Enter your phone number or email').max(160),
    password: z.string().min(1, 'Enter your password').max(200),
  })
  .strict();
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const customerProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120).optional(),
    email: z
      .preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
        emailSchema.nullable(),
      )
      .optional(),
  })
  .strict();
export type CustomerProfileUpdateInput = z.infer<typeof customerProfileUpdateSchema>;

export const customerChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(200),
    newPassword: customerPasswordSchema,
  })
  .strict();
export type CustomerChangePasswordInput = z.infer<typeof customerChangePasswordSchema>;

export const customerAddressSchema = z
  .object({
    label: z.string().trim().min(1, 'Give this address a name').max(40),
    address: z.string().trim().min(5, 'Enter the full address').max(300),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    notes: optionalTrimmedString(300),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.latitude == null) !== (value.longitude == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both latitude and longitude, or neither',
        path: ['latitude'],
      });
    }
  });
export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;

/** Cart pricing request. Carries IDs and quantities only — never prices. */
export const publicQuoteSchema = z
  .object({
    branchId: z.string().trim().min(1, 'Choose a branch'),
    fulfillment: z.enum(['DELIVERY', 'TAKEAWAY']),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one item').max(50),
    customerLat: z.number().min(-90).max(90).nullable().optional(),
    customerLng: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict();
export type PublicQuoteInput = z.infer<typeof publicQuoteSchema>;

export interface CustomerAccountDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  registeredAt: string;
}

/** What the browser receives; the refresh token stays in an HttpOnly cookie. */
export interface CustomerSessionDto {
  customer: CustomerAccountDto;
  accessToken: string;
  accessTokenExpiresIn: number;
}

export interface CustomerAddressDto {
  id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  isDefault: boolean;
}

export interface PublicQuoteLineDto {
  menuItemId: string;
  sizeId: string | null;
  name: string;
  sizeName: string | null;
  toppings: string[];
  quantity: number;
  /** Size (or base) price plus selected toppings, for one unit. */
  unitPrice: string;
  lineTotal: string;
}

/** Server-computed cart totals. The storefront only displays these. */
export interface PublicQuoteDto {
  currency: string;
  lines: PublicQuoteLineDto[];
  subtotal: string;
  taxRate: string;
  tax: string;
  /** Null while a delivery location is still needed or is not serviceable. */
  deliveryFee: string | null;
  deliveryZoneId: string | null;
  /** Why delivery cannot be priced yet (missing pin, out of zone, below minimum). */
  deliveryIssue: string | null;
  /** Total including the delivery fee when it is known. */
  total: string;
}
