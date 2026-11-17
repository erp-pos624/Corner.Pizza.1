import { z } from 'zod';
import { INVENTORY_MOVEMENT_TYPES } from '../constants.js';
import { optionalTrimmedString, paginationSchema } from './common.js';
import { moneyString } from './menu.js';

export const ingredientQuerySchema = paginationSchema.extend({
  q: optionalTrimmedString(120),
  lowStock: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  categoryId: z.string().trim().min(1).optional(),
});
export type IngredientQuery = z.infer<typeof ingredientQuerySchema>;

export const stockAdjustSchema = z
  .object({
    quantity: z.coerce
      .number()
      .min(-1000000)
      .max(1000000)
      .refine((value) => value !== 0, 'Adjustment cannot be zero'),
    reason: z.string().trim().min(3, 'Please provide a reason').max(300),
  })
  .strict();
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const stockPurchaseSchema = z
  .object({
    quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1000000),
    unitCost: moneyString.optional(),
    supplierId: z.string().trim().min(1).nullable().optional(),
    reference: optionalTrimmedString(120),
    note: optionalTrimmedString(300),
  })
  .strict();
export type StockPurchaseInput = z.infer<typeof stockPurchaseSchema>;

export const movementQuerySchema = paginationSchema.extend({
  ingredientId: z.string().trim().min(1).optional(),
  type: z.enum(INVENTORY_MOVEMENT_TYPES).optional(),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
});
export type MovementQuery = z.infer<typeof movementQuerySchema>;

export const supplierCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Supplier name is required').max(120),
    nameAr: z.string().trim().min(1, 'Arabic supplier name is required').max(120),
    phone: optionalTrimmedString(30),
    email: optionalTrimmedString(160),
    address: optionalTrimmedString(300),
    notes: optionalTrimmedString(500),
    isActive: z.boolean().default(true),
  })
  .strict();
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;

export const supplierUpdateSchema = supplierCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

export const purchaseOrderItemSchema = z
  .object({
    ingredientId: z.string().trim().min(1),
    quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1000000),
    unitPrice: moneyString,
    discount: moneyString.default('0.00'),
    taxRate: z.coerce.number().min(0).max(100).default(0),
  })
  .strict();

export const purchaseOrderCreateSchema = z
  .object({
    supplierId: z.string().trim().min(1, 'Choose a supplier'),
    branchId: z.string().trim().min(1).optional(),
    expectedAt: optionalTrimmedString(10),
    notes: optionalTrimmedString(500),
    discount: moneyString.default('0.00'),
    items: z.array(purchaseOrderItemSchema).min(1, 'Add at least one item').max(100),
  })
  .strict();
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

export const purchaseOrderUpdateSchema = purchaseOrderCreateSchema
  .omit({ items: true })
  .partial()
  .extend({ items: z.array(purchaseOrderItemSchema).min(1).max(100).optional() })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');

export const purchaseOrderStatusSchema = z
  .object({
    action: z.enum(['submit', 'approve', 'cancel']),
    reason: optionalTrimmedString(300),
  })
  .strict();
export type PurchaseOrderStatusInput = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseReceiveSchema = z
  .object({
    supplierInvoiceNo: optionalTrimmedString(120),
    notes: optionalTrimmedString(500),
    items: z
      .array(
        z.object({
          purchaseOrderItemId: z.string().trim().min(1),
          quantity: z.coerce.number().positive('Quantity must be greater than zero').max(1000000),
          unitCost: moneyString.optional(),
        }),
      )
      .min(1, 'Enter the received quantities')
      .max(100),
  })
  .strict();
export type PurchaseReceiveInput = z.infer<typeof purchaseReceiveSchema>;

export const purchaseOrderQuerySchema = paginationSchema.extend({
  q: optionalTrimmedString(120),
  status: z
    .enum(['DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'])
    .optional(),
  supplierId: z.string().trim().min(1).optional(),
  branchId: z.string().trim().min(1).optional(),
  from: optionalTrimmedString(10),
  to: optionalTrimmedString(10),
});
export type PurchaseOrderQuery = z.infer<typeof purchaseOrderQuerySchema>;

// ---------------------------------------------------------------------------
// Alerts & reports
// ---------------------------------------------------------------------------

export const stockAlertQuerySchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
  type: z.enum(['LOW', 'OUT']).optional(),
  branchId: z.string().trim().min(1).optional(),
});
export type StockAlertQuery = z.infer<typeof stockAlertQuerySchema>;

export const inventoryReportQuerySchema = z
  .object({
    from: optionalTrimmedString(10),
    to: optionalTrimmedString(10),
    categoryId: z.string().trim().min(1).optional(),
    supplierId: z.string().trim().min(1).optional(),
    branchId: z.string().trim().min(1).optional(),
    ingredientId: z.string().trim().min(1).optional(),
    lang: z.string().max(8).optional(),
  })
  .strict();
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;

export const storeStockQuerySchema = z
  .object({
    branchId: z.string().trim().min(1).optional(),
    q: optionalTrimmedString(120),
    lang: z.string().max(8).optional(),
  })
  .strict();
