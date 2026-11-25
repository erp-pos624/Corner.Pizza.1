import { z } from 'zod';
import { ORDER_CHANNELS } from '../constants.js';
import { optionalTrimmedString } from './common.js';

/**
 * What a printer is for. A terminal decides which jobs it produces (from its
 * device setup); the printer's role decides which of those jobs it receives.
 */
export const PRINTER_ROLES = [
  'CUSTOMER_RECEIPT',
  'KITCHEN_ALL',
  'KITCHEN_BY_CATEGORY',
  'DELIVERY_DISPATCH',
  'SHIFT_Z_REPORT',
] as const;
export type PrinterRole = (typeof PRINTER_ROLES)[number];

/** SPOOLER = an installed Windows printer (USB or LAN driver); NETWORK = raw ESC/POS over TCP. */
export const PRINTER_CONNECTIONS = ['SPOOLER', 'NETWORK'] as const;
export type PrinterConnection = (typeof PRINTER_CONNECTIONS)[number];

export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export const FONT_SCALES = ['COMPACT', 'NORMAL', 'LARGE'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const receiptTemplateSchema = z
  .object({
    fontScale: z.enum(FONT_SCALES).default('NORMAL'),
    showLogo: z.boolean().default(true),
    showStoreDetails: z.boolean().default(true),
    showOrderMeta: z.boolean().default(true),
    showCustomer: z.boolean().default(true),
    showPrices: z.boolean().default(true),
    showVatLine: z.boolean().default(true),
    showPayments: z.boolean().default(true),
    showItemNotes: z.boolean().default(true),
    headerNote: z.string().trim().max(200).default(''),
    footerEn: z.string().trim().max(300).default(''),
    footerAr: z.string().trim().max(300).default(''),
    showQr: z.boolean().default(false),
    qrUrl: z.string().trim().max(300).default(''),
  })
  .strict();
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;

/** Sensible starting template per role; kitchen tickets never show money. */
export function defaultTemplateFor(role: PrinterRole): ReceiptTemplate {
  const base = receiptTemplateSchema.parse({});
  if (role === 'KITCHEN_ALL' || role === 'KITCHEN_BY_CATEGORY') {
    return {
      ...base,
      fontScale: 'LARGE',
      showLogo: false,
      showStoreDetails: false,
      showCustomer: false,
      showPrices: false,
      showVatLine: false,
      showPayments: false,
    };
  }
  if (role === 'DELIVERY_DISPATCH') {
    return { ...base, showLogo: false, showVatLine: false };
  }
  return base;
}

/** Reads a stored template, filling any missing field from the role default. */
export function resolveTemplate(role: PrinterRole, stored: unknown): ReceiptTemplate {
  const parsed = receiptTemplateSchema.partial().safeParse(stored ?? {});
  return { ...defaultTemplateFor(role), ...(parsed.success ? stripUndefined(parsed.data) : {}) };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

const hostSchema = z
  .string()
  .trim()
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$/u, 'Use an IP address or host name');

const printerFields = {
  name: z.string().trim().min(2).max(80),
  branchId: z.string().trim().min(1).optional(),
  connection: z.enum(PRINTER_CONNECTIONS).default('SPOOLER'),
  deviceName: optionalTrimmedString(200),
  host: hostSchema.optional().nullable(),
  port: z.coerce.number().int().min(1).max(65_535).default(9100),
  paperWidth: z.union([z.literal(58), z.literal(80)]).default(80),
  role: z.enum(PRINTER_ROLES),
  categoryIds: z.array(z.string().trim().min(1)).max(50).default([]),
  channels: z.array(z.enum(ORDER_CHANNELS)).max(ORDER_CHANNELS.length).default([]),
  copies: z.coerce.number().int().min(1).max(5).default(1),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  template: receiptTemplateSchema.partial().optional(),
};

function checkTarget(
  value: { connection?: PrinterConnection; host?: string | null; deviceName?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.connection === 'NETWORK' && !value.host) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host'], message: 'Enter the printer IP address' });
  }
  if (value.connection === 'SPOOLER' && !value.deviceName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deviceName'],
      message: 'Choose the Windows printer name',
    });
  }
}

export const printerCreateSchema = z.object(printerFields).strict().superRefine(checkTarget);
export type PrinterCreateInput = z.infer<typeof printerCreateSchema>;

export const printerUpdateSchema = z
  .object({
    name: printerFields.name.optional(),
    connection: z.enum(PRINTER_CONNECTIONS).optional(),
    deviceName: optionalTrimmedString(200),
    host: hostSchema.optional().nullable(),
    port: z.coerce.number().int().min(1).max(65_535).optional(),
    paperWidth: z.union([z.literal(58), z.literal(80)]).optional(),
    role: z.enum(PRINTER_ROLES).optional(),
    categoryIds: z.array(z.string().trim().min(1)).max(50).optional(),
    channels: z.array(z.enum(ORDER_CHANNELS)).max(ORDER_CHANNELS.length).optional(),
    copies: z.coerce.number().int().min(1).max(5).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    template: receiptTemplateSchema.partial().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');
export type PrinterUpdateInput = z.infer<typeof printerUpdateSchema>;

export interface PrinterDto {
  id: string;
  branchId: string;
  name: string;
  connection: PrinterConnection;
  deviceName: string | null;
  host: string | null;
  port: number;
  paperWidth: PaperWidth;
  role: PrinterRole;
  categoryIds: string[];
  channels: (typeof ORDER_CHANNELS)[number][];
  copies: number;
  isActive: boolean;
  sortOrder: number;
  /** Always complete: stored overrides merged over the role default. */
  template: ReceiptTemplate;
  updatedAt: string;
}
