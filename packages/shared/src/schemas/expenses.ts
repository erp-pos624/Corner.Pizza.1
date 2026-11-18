import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../constants.js';
import { dateOnlySchema, optionalTrimmedString, paginationSchema } from './common.js';
import { moneyString } from './menu.js';

export const expenseCreateSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().trim().min(2, 'Describe the expense').max(160),
    amount: moneyString.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
    expenseDate: dateOnlySchema,
    branchId: z.string().trim().min(1).nullable().optional(),
    notes: optionalTrimmedString(500),
  })
  .strict();
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const expenseUpdateSchema = expenseCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

export const expenseQuerySchema = paginationSchema.extend({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  branchId: z.string().trim().min(1).optional(),
});
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;
