import { z } from 'zod';
import {
  ADJUSTMENT_CATEGORIES,
  ATTENDANCE_STATUSES,
  EMPLOYMENT_STATUSES,
  SALARY_TYPES,
  payrollMonthSchemaPattern,
} from '../constants.js';
import { dateOnlySchema, optionalTrimmedString, paginationSchema } from './common.js';
import { moneyString } from './menu.js';

const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'Time must use HH:mm format');

const payrollMonthField = z
  .string()
  .trim()
  .regex(payrollMonthSchemaPattern, 'Month must use YYYY-MM format');

export const employeeQuerySchema = paginationSchema.extend({
  q: optionalTrimmedString(120),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
  branchId: z.string().trim().min(1).optional(),
  lang: z.string().max(8).optional(),
});
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

export const employeeCreateSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Employee name is required').max(120),
    phone: optionalTrimmedString(30),
    jobTitle: z.string().trim().min(2, 'Job title is required').max(80),
    branchId: z.string().trim().min(1).nullable().optional(),
    hireDate: dateOnlySchema,
    basicSalary: moneyString,
    salaryType: z.enum(SALARY_TYPES).default('MONTHLY'),
    status: z.enum(EMPLOYMENT_STATUSES).default('ACTIVE'),
  })
  .strict();
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export const attendanceQuerySchema = paginationSchema.extend({
  month: payrollMonthField.optional(),
  date: dateOnlySchema.optional(),
  employeeId: z.string().trim().min(1).optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  lang: z.string().max(8).optional(),
});
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;

export const attendanceUpsertSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Choose an employee'),
    date: dateOnlySchema,
    checkIn: timeOfDaySchema.optional(),
    checkOut: timeOfDaySchema.optional(),
    status: z.enum(ATTENDANCE_STATUSES).default('PRESENT'),
    note: optionalTrimmedString(300),
  })
  .strict()
  .refine((value) => !(value.checkIn && value.checkOut) || value.checkOut > value.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });
export type AttendanceUpsertInput = z.infer<typeof attendanceUpsertSchema>;

export const adjustmentQuerySchema = paginationSchema.extend({
  payrollMonth: payrollMonthField.optional(),
  employeeId: z.string().trim().min(1).optional(),
  category: z.enum(ADJUSTMENT_CATEGORIES).optional(),
  lang: z.string().max(8).optional(),
});
export type AdjustmentQuery = z.infer<typeof adjustmentQuerySchema>;

export const adjustmentCreateSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Choose an employee'),
    category: z.enum(ADJUSTMENT_CATEGORIES),
    amount: moneyString.refine((value) => Number(value) > 0, 'Amount must be greater than zero'),
    date: dateOnlySchema,
    reason: z.string().trim().min(3, 'Please provide a reason').max(300),
    payrollMonth: payrollMonthField,
  })
  .strict();
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;

export const adjustmentUpdateSchema = adjustmentCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type AdjustmentUpdateInput = z.infer<typeof adjustmentUpdateSchema>;

export const payrollMonthQuerySchema = z
  .object({ month: payrollMonthField, lang: z.string().max(8).optional() })
  .strict();
export type PayrollMonthQuery = z.infer<typeof payrollMonthQuerySchema>;

export const payrollGenerateSchema = z
  .object({
    month: payrollMonthField,
    notes: optionalTrimmedString(300),
  })
  .strict();
export type PayrollGenerateInput = z.infer<typeof payrollGenerateSchema>;

export const payrollReopenSchema = z
  .object({
    reason: z.string().trim().min(3, 'A reason is required to reopen payroll').max(300),
  })
  .strict();
export type PayrollReopenInput = z.infer<typeof payrollReopenSchema>;

export const payrollPaymentSchema = z
  .object({ status: z.enum(['UNPAID', 'PAID']) })
  .strict();
export type PayrollPaymentInput = z.infer<typeof payrollPaymentSchema>;

export const hrSettingsUpdateSchema = z
  .object({
    workStart: timeOfDaySchema,
    workEnd: timeOfDaySchema,
    graceMinutes: z.coerce.number().int().min(0).max(120),
    lateDeductionPerMinute: moneyString,
    absenceDeductionMultiplier: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/u, 'Enter a valid multiplier')
      .refine((value) => Number(value) <= 5, 'Multiplier cannot exceed 5'),
    weeklyDaysOff: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  })
  .strict()
  .refine((value) => value.workEnd > value.workStart, {
    message: 'Work end must be after work start',
    path: ['workEnd'],
  });
export type HrSettingsUpdateInput = z.infer<typeof hrSettingsUpdateSchema>;
