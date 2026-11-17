import { z } from 'zod';
import {
  CASH_MOVEMENT_TYPES,
  DELIVERY_STATUSES,
  PAYMENT_METHODS,
  SHIFT_STATUSES,
  TABLE_STATUSES,
  TRANSFER_STATUSES,
} from '../constants.js';
import { dateOnlySchema, optionalTrimmedString, paginationSchema } from './common.js';
import { moneyString } from './menu.js';

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export const branchCreateSchema = z
  .object({
    code: z.string().trim().min(2).max(12).toUpperCase(),
    name: z.string().trim().min(2).max(120),
    nameAr: optionalTrimmedString(120),
    address: optionalTrimmedString(300),
    phone: optionalTrimmedString(30),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

export const branchUpdateSchema = branchCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');

// ---------------------------------------------------------------------------
// Shifts & cash drawer
// ---------------------------------------------------------------------------

export const shiftOpenSchema = z
  .object({
    openingFloat: moneyString,
    notes: optionalTrimmedString(300),
  })
  .strict();
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

export const shiftCloseSchema = z
  .object({
    countedCash: moneyString,
    notes: optionalTrimmedString(300),
  })
  .strict();
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

export const cashMovementSchema = z
  .object({
    type: z.enum(CASH_MOVEMENT_TYPES),
    amount: moneyString.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
    reason: z.string().trim().min(3, 'Please provide a reason').max(300),
  })
  .strict();
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

export const shiftQuerySchema = paginationSchema.extend({
  status: z.enum(SHIFT_STATUSES).optional(),
  branchId: z.string().trim().min(1).optional(),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
});
export type ShiftQuery = z.infer<typeof shiftQuerySchema>;

export const zReportQuerySchema = z.object({
  date: dateOnlySchema.optional(),
  branchId: z.string().trim().min(1).optional(),
});
export type ZReportQuery = z.infer<typeof zReportQuerySchema>;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const tableCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Table name is required').max(30),
    seats: z.coerce.number().int().min(1).max(40).default(4),
    isActive: z.boolean().default(true),
  })
  .strict();
export type TableCreateInput = z.infer<typeof tableCreateSchema>;

export const tableUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    seats: z.coerce.number().int().min(1).max(40).optional(),
    status: z.enum(TABLE_STATUSES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export const deliveryAssignSchema = z
  .object({
    driverId: z.string().trim().min(1),
  })
  .strict();
export type DeliveryAssignInput = z.infer<typeof deliveryAssignSchema>;

export const deliveryStatusSchema = z
  .object({
    status: z.enum(DELIVERY_STATUSES),
  })
  .strict();
export type DeliveryStatusInput = z.infer<typeof deliveryStatusSchema>;

export const deliveryQuerySchema = paginationSchema.extend({
  status: z.enum(DELIVERY_STATUSES).optional(),
  driverId: z.string().trim().min(1).optional(),
  branchId: z.string().trim().min(1).optional(),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
});
export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;

export const driverSettlementSchema = z
  .object({
    driverId: z.string().trim().min(1),
    periodStart: dateOnlySchema.optional(),
    periodEnd: dateOnlySchema.optional(),
  })
  .strict();
export type DriverSettlementInput = z.infer<typeof driverSettlementSchema>;

export const driverSettlementSettleSchema = z
  .object({
    amountHandedOver: moneyString,
    notes: optionalTrimmedString(400),
  })
  .strict();
export type DriverSettlementSettleInput = z.infer<typeof driverSettlementSettleSchema>;

export const driverSettlementQuerySchema = paginationSchema.extend({
  driverId: z.string().trim().min(1).optional(),
  status: z.enum(['OPEN', 'SETTLED']).optional(),
});
export type DriverSettlementQuery = z.infer<typeof driverSettlementQuerySchema>;

// ---------------------------------------------------------------------------
// Delivery zones (circular catchment areas per branch)
// ---------------------------------------------------------------------------

export const deliveryZoneCreateSchema = z
  .object({
    branchId: z.string().trim().min(1),
    name: z.string().trim().min(2, 'Zone name is too short').max(80),
    centerLat: z.number().min(-90).max(90),
    centerLng: z.number().min(-180).max(180),
    radiusInMeters: z
      .number()
      .int()
      .min(100, 'Radius must be at least 100 metres')
      .max(50_000, 'Radius cannot exceed 50 km'),
    deliveryFee: moneyString,
    minOrderAmount: moneyString.default('0'),
    isActive: z.boolean().default(true),
  })
  .strict();
export type DeliveryZoneCreateInput = z.infer<typeof deliveryZoneCreateSchema>;

export const deliveryZoneUpdateSchema = deliveryZoneCreateSchema
  .omit({ branchId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type DeliveryZoneUpdateInput = z.infer<typeof deliveryZoneUpdateSchema>;

export const deliveryZoneCheckSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    branchId: z.string().trim().min(1).optional(),
  })
  .strict();
export type DeliveryZoneCheckInput = z.infer<typeof deliveryZoneCheckSchema>;

export const deliveryZoneQuerySchema = z.object({
  branchId: z.string().trim().min(1).optional(),
  includeInactive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
});
export type DeliveryZoneQuery = z.infer<typeof deliveryZoneQuerySchema>;

// ---------------------------------------------------------------------------
// Stocktakes & transfers
// ---------------------------------------------------------------------------

export const stocktakeCreateSchema = z
  .object({
    notes: optionalTrimmedString(400),
    items: z
      .array(
        z.object({
          ingredientId: z.string().trim().min(1),
          countedQty: z.coerce.number().min(0).max(1000000),
        }),
      )
      .min(1, 'Count at least one ingredient')
      .max(500),
  })
  .strict();
export type StocktakeCreateInput = z.infer<typeof stocktakeCreateSchema>;

export const stocktakeQuerySchema = paginationSchema.extend({
  branchId: z.string().trim().min(1).optional(),
});
export type StocktakeQuery = z.infer<typeof stocktakeQuerySchema>;

export const transferCreateSchema = z
  .object({
    fromBranchId: z.string().trim().min(1),
    toBranchId: z.string().trim().min(1),
    notes: optionalTrimmedString(400),
    items: z
      .array(
        z.object({
          ingredientId: z.string().trim().min(1),
          quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1000000),
        }),
      )
      .min(1, 'Add at least one ingredient')
      .max(300),
  })
  .strict()
  .refine((value) => value.fromBranchId !== value.toBranchId, {
    message: 'Choose two different branches',
    path: ['toBranchId'],
  });
export type TransferCreateInput = z.infer<typeof transferCreateSchema>;

export const transferStatusSchema = z
  .object({
    status: z.enum(TRANSFER_STATUSES),
  })
  .strict();
export type TransferStatusInput = z.infer<typeof transferStatusSchema>;

export const transferQuerySchema = paginationSchema.extend({
  status: z.enum(TRANSFER_STATUSES).optional(),
  branchId: z.string().trim().min(1).optional(),
});
export type TransferQuery = z.infer<typeof transferQuerySchema>;

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export const stockLossSchema = z
  .object({
    quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1000000),
    reason: z.string().trim().min(3, 'Please provide a reason').max(300),
  })
  .strict();
export type StockLossInput = z.infer<typeof stockLossSchema>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
