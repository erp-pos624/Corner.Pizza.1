import { z } from 'zod';
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  STAFF_ORDER_CHANNELS,
} from '../constants.js';
import { optionalTrimmedString, paginationSchema } from './common.js';
import { moneyString } from './menu.js';

export const orderItemInputSchema = z
  .object({
    menuItemId: z.string().trim().min(1),
    sizeId: z.string().trim().min(1).nullable().optional(),
    quantity: z.coerce.number().int().min(1).max(99).default(1),
    toppingIds: z.array(z.string().trim().min(1)).max(20).default([]),
    specialInstructions: optionalTrimmedString(300),
  })
  .strict();
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/** One tendered amount. Cash may exceed its share (change is returned). */
export const orderPaymentInputSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: moneyString.refine((value) => Number(value) > 0, 'Payment must be greater than zero'),
    reference: optionalTrimmedString(60),
  })
  .strict();
export type OrderPaymentInput = z.infer<typeof orderPaymentInputSchema>;

const uniquePaymentMethods = (payments: readonly { method: string }[]): boolean =>
  new Set(payments.map((payment) => payment.method)).size === payments.length;

export const orderCreateSchema = z
  .object({
    /** Client-generated key so a retried checkout returns the original order. */
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
    type: z.enum(ORDER_TYPES),
    customerId: z.string().trim().min(1).nullable().optional(),
    customerName: optionalTrimmedString(120),
    customerPhone: optionalTrimmedString(30),
    customerAddress: optionalTrimmedString(300),
    customerLat: z.number().min(-90).max(90).nullable().optional(),
    customerLng: z.number().min(-180).max(180).nullable().optional(),
    tableId: z.string().trim().min(1).nullable().optional(),
    tableNumber: optionalTrimmedString(20),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one item').max(80),
    discountId: z.string().trim().min(1).nullable().optional(),
    notes: optionalTrimmedString(600),
    /** Where the order came from; website orders use the public API instead. */
    channel: z.enum(STAFF_ORDER_CHANNELS).optional(),
    /** Aggregator order number, e.g. the Talabat order id. */
    externalRef: optionalTrimmedString(60),
    /** Dine-in tabs are opened before the guests pay at the end of the meal. */
    payLater: z.boolean().default(false),
    /** Delivery orders paid in cash to the driver at the door. */
    isCod: z.boolean().default(false),
    payments: z
      .array(orderPaymentInputSchema)
      .max(PAYMENT_METHODS.length)
      .default([])
      .refine(uniquePaymentMethods, 'Each payment method can only be used once'),
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
    if (value.type === 'DELIVERY' && !value.customerAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A delivery address is required for delivery orders',
        path: ['customerAddress'],
      });
    }
    if (value.payLater && value.type !== 'DINE_IN') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Open tabs are only available for dine-in orders',
        path: ['payLater'],
      });
    }
    if (value.isCod && value.type !== 'DELIVERY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cash on delivery is only available for delivery orders',
        path: ['isCod'],
      });
    }
    if (value.isCod && value.payments.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Remove the payments for a cash-on-delivery order',
        path: ['payments'],
      });
    }
    if (!value.payLater && !value.isCod && value.payments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one payment',
        path: ['payments'],
      });
    }
    if (value.payLater && value.payments.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An open tab cannot take payment until it is settled',
        path: ['payments'],
      });
    }
  });
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** Extra items added to a dine-in tab before the guests settle the bill. */
export const orderAddItemsSchema = z
  .object({
    items: z.array(orderItemInputSchema).min(1, 'Add at least one item').max(40),
  })
  .strict();
export type OrderAddItemsInput = z.infer<typeof orderAddItemsSchema>;

/** Settles an open tab with one or more tenders. */
export const orderSettleSchema = z
  .object({
    payments: z
      .array(orderPaymentInputSchema)
      .min(1, 'Add at least one payment')
      .max(PAYMENT_METHODS.length)
      .refine(uniquePaymentMethods, 'Each payment method can only be used once'),
  })
  .strict();
export type OrderSettleInput = z.infer<typeof orderSettleSchema>;

export const orderRefundSchema = z
  .object({
    amount: moneyString.refine((value) => Number(value) > 0, 'Refund must be greater than zero'),
    method: z.enum(PAYMENT_METHODS),
    reason: z.string().trim().min(3, 'Please provide a refund reason').max(400),
  })
  .strict();
export type OrderRefundInput = z.infer<typeof orderRefundSchema>;

export const orderQuerySchema = paginationSchema.extend({
  q: optionalTrimmedString(120),
  status: z.enum(ORDER_STATUSES).optional(),
  type: z.enum(ORDER_TYPES).optional(),
  channel: z.enum(ORDER_CHANNELS).optional(),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
  cashierId: z.string().trim().min(1).optional(),
  branchId: z.string().trim().min(1).optional(),
  tableId: z.string().trim().min(1).optional(),
  openTabs: z.coerce.boolean().optional(),
  today: z.coerce.boolean().optional(),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const orderStatusUpdateSchema = z
  .object({
    // Cancellation has its own audited endpoint and is never a generic transition.
    status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'completed']),
  })
  .strict();
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;

export const orderCancelSchema = z
  .object({
    reason: z.string().trim().min(3, 'Please provide a cancellation reason').max(400),
  })
  .strict();
export type OrderCancelInput = z.infer<typeof orderCancelSchema>;

export const invoiceQuerySchema = paginationSchema.extend({
  q: optionalTrimmedString(120),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
