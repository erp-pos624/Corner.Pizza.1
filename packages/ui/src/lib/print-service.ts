/**
 * Routes print jobs to the station printers configured in the dashboard.
 *
 * A job (customer receipt, kitchen ticket, dispatch slip, Z-report) goes to
 * every active printer whose role matches, whose channel rule allows the
 * order, and — for category printers — that has at least one matching line.
 * The desktop app prints silently to Windows printers installed on this
 * machine and streams ESC/POS to LAN printers; anything else falls back to
 * the system print dialog.
 */
import type {
  KitchenOrderDto,
  OrderDto,
  PrinterDto,
  PrinterRole,
  SettingsDto,
  ShiftDto,
} from '@posshope/shared';
import { CORNER_LOGO_DATA_URL } from '../assets/corner-logo-data';
import { translate } from '../i18n/dictionaries';
import { getBridge, hasBridge } from './bridge';
import {
  formatDateTime,
  formatMoney,
  orderChannelLabel,
  orderTypeLabel,
  paymentMethodLabel,
} from './format';
import { getActiveLanguage } from './language';
import {
  buildReceipt,
  linesFor,
  receiptToEscPos,
  receiptToHtml,
  toBase64,
  type PrintableOrder,
  type ReceiptBlock,
  type ReceiptKind,
  type ReceiptLabels,
  type StoreInfo,
} from './receipt';

export type PrintJobKind = 'CUSTOMER_RECEIPT' | 'KITCHEN' | 'DELIVERY_DISPATCH' | 'SHIFT_Z_REPORT';

const ROLES_FOR_JOB: Record<PrintJobKind, readonly PrinterRole[]> = {
  CUSTOMER_RECEIPT: ['CUSTOMER_RECEIPT'],
  KITCHEN: ['KITCHEN_ALL', 'KITCHEN_BY_CATEGORY'],
  DELIVERY_DISPATCH: ['DELIVERY_DISPATCH'],
  SHIFT_Z_REPORT: ['SHIFT_Z_REPORT'],
};

const KIND_FOR_JOB: Record<Exclude<PrintJobKind, 'SHIFT_Z_REPORT'>, ReceiptKind> = {
  CUSTOMER_RECEIPT: 'CUSTOMER',
  KITCHEN: 'KITCHEN',
  DELIVERY_DISPATCH: 'DISPATCH',
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function t(key: string, vars?: Record<string, string | number>): string {
  return translate(getActiveLanguage(), key as never, vars);
}

export function receiptLabels(taxRate: string | null): ReceiptLabels {
  const rate = Number(taxRate ?? 0).toFixed(2);
  return {
    receipt: t('invoices.receipt.customer'),
    kitchenTicket: t('invoices.document.kitchenCopy'),
    dispatchTicket: t('invoices.receipt.dispatch'),
    order: t('invoices.document.order'),
    invoice: t('invoices.document.invoice'),
    date: t('invoices.document.date'),
    type: t('invoices.document.service'),
    channel: t('invoices.receipt.channel'),
    table: t('invoices.receipt.table'),
    cashier: t('invoices.document.cashier'),
    customer: t('invoices.document.guest'),
    phone: t('invoices.document.phone'),
    address: t('invoices.document.address'),
    notes: t('invoices.document.notes'),
    subtotal: t('invoices.document.subtotal'),
    discount: t('invoices.document.discount'),
    tax: t('invoices.document.tax', { rate }),
    taxIncluded: t('invoices.document.taxIncluded', { rate }),
    delivery: t('invoices.document.delivery'),
    total: t('invoices.document.total'),
    change: t('invoices.document.change'),
    orderTypeLabel,
    channelLabel: orderChannelLabel,
    paymentLabel: (method) => paymentMethodLabel(method as never),
    formatMoney: (value) => formatMoney(value),
    formatDateTime: (iso) => formatDateTime(iso),
  };
}

export function storeInfo(settings: SettingsDto | null | undefined): StoreInfo {
  return {
    name: settings?.name ?? 'Corner Pizza',
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
    logoDataUrl: CORNER_LOGO_DATA_URL,
  };
}

export function printableFromOrder(
  order: OrderDto,
  categoryOf: (menuItemId: string) => string | null = () => null,
  taxRate: string | null = null,
): PrintableOrder {
  return {
    orderNumber: order.orderNumber,
    invoiceNumber: order.invoice?.invoiceNumber ?? null,
    createdAt: order.createdAt,
    type: order.type,
    channel: order.channel,
    externalRef: order.externalRef ?? null,
    tableNumber: order.tableNumber,
    cashierName: order.cashierName,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    notes: order.notes,
    lines: order.items.map((item) => ({
      name: item.name,
      sizeName: item.sizeName,
      quantity: item.quantity,
      toppings: item.toppings.map((topping) => topping.name),
      note: item.specialInstructions,
      lineTotal: item.lineTotal,
      categoryId: categoryOf(item.menuItemId),
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    discountLabel: order.discountLabel,
    tax: order.tax,
    taxIncluded: order.taxIncluded,
    taxRate,
    deliveryFee: order.deliveryFee,
    total: order.total,
    payments: order.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
    changeDue: order.changeDue,
    paymentNote: order.isCod && order.paymentStatus === 'UNPAID' ? t('invoices.receipt.cod') : null,
  };
}

export function printableFromKitchen(order: KitchenOrderDto): PrintableOrder {
  return {
    orderNumber: order.orderNumber,
    invoiceNumber: null,
    createdAt: order.createdAt,
    type: order.type,
    channel: order.channel,
    externalRef: order.externalRef ?? null,
    tableNumber: order.tableNumber,
    cashierName: null,
    customerName: null,
    customerPhone: null,
    customerAddress: null,
    notes: order.notes,
    lines: order.items.map((item) => ({
      name: item.name,
      sizeName: item.sizeName,
      quantity: item.quantity,
      toppings: item.toppings,
      note: item.specialInstructions,
      lineTotal: null,
      categoryId: item.categoryId ?? null,
    })),
    subtotal: null,
    discount: null,
    discountLabel: null,
    tax: null,
    taxIncluded: null,
    taxRate: null,
    deliveryFee: null,
    total: null,
    payments: [],
    changeDue: null,
    paymentNote: null,
  };
}

/** A realistic order for previews and test prints. */
export function sampleOrder(): PrintableOrder {
  return {
    orderNumber: '1042',
    invoiceNumber: 'INV-2026-001042',
    createdAt: new Date().toISOString(),
    type: 'TAKEAWAY',
    channel: 'TALABAT',
    externalRef: '123456789',
    tableNumber: null,
    cashierName: 'Cashier',
    customerName: 'Test Customer',
    customerPhone: '01000000000',
    customerAddress: 'Rehab 2, Group 123',
    notes: 'Test print — no charge',
    lines: [
      { name: 'Margherita', sizeName: 'M', quantity: 1, toppings: [], note: 'Well done', lineTotal: '210.00', categoryId: null },
      { name: 'BBQ Wings', sizeName: '6pc', quantity: 2, toppings: [], note: null, lineTotal: '280.00', categoryId: null },
      { name: 'V-Cola', sizeName: null, quantity: 1, toppings: [], note: null, lineTotal: '40.00', categoryId: null },
    ],
    subtotal: '530.00',
    discount: '0.00',
    discountLabel: null,
    tax: '65.09',
    taxIncluded: '65.09',
    taxRate: '14.00',
    deliveryFee: '0.00',
    total: '530.00',
    payments: [{ method: 'WALLET', amount: '530.00' }],
    changeDue: '0.00',
    paymentNote: null,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function blocksFor(
  printer: PrinterDto,
  kind: ReceiptKind,
  order: PrintableOrder,
  settings: SettingsDto | null | undefined,
): ReceiptBlock[] {
  return buildReceipt({
    kind,
    order,
    store: storeInfo(settings),
    template: printer.template,
    labels: receiptLabels(order.taxRate ?? settings?.taxRate ?? null),
    categoryIds: printer.role === 'KITCHEN_BY_CATEGORY' ? printer.categoryIds : [],
  });
}

export function zReportBlocks(shift: ShiftDto, settings: SettingsDto | null | undefined): ReceiptBlock[] {
  const totals = shift.totals;
  const money = (value: string | null): string => (value == null ? '—' : formatMoney(value));
  const row = (left: string, right: string, bold = false): ReceiptBlock => ({ kind: 'row', left, right, bold });
  return [
    { kind: 'text', text: storeInfo(settings).name, align: 'center', bold: true, size: 'lg' },
    { kind: 'text', text: t('invoices.receipt.zReport'), align: 'center', bold: true, size: 'md' },
    { kind: 'text', text: `${shift.shiftNumber} · ${shift.branchName}`, align: 'center', size: 'sm' },
    { kind: 'text', text: `${formatDateTime(shift.openedAt)} → ${shift.closedAt ? formatDateTime(shift.closedAt) : '—'}`, align: 'center', size: 'sm' },
    { kind: 'divider' },
    row(t('shifts.totals.orders'), String(totals.ordersCount)),
    row(t('shifts.totals.grossSales'), money(totals.grossSales), true),
    row(t('shifts.totals.cashPayments'), money(totals.cashPayments)),
    row(t('shifts.totals.cardPayments'), money(totals.cardPayments)),
    row(t('shifts.totals.walletPayments'), money(totals.walletPayments)),
    row(t('shifts.totals.discounts'), money(totals.discounts)),
    row(t('shifts.totals.tax'), money(totals.tax)),
    row(t('shifts.totals.refunds'), money(totals.refundsTotal)),
    { kind: 'divider' },
    row(t('shifts.totals.openingFloat'), money(totals.openingFloat)),
    row(t('shifts.totals.expectedCash'), money(totals.expectedCash), true),
    row(t('shifts.totals.countedCash'), money(totals.countedCash)),
    row(t('shifts.totals.variance'), money(totals.variance), true),
  ];
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface DispatchResult {
  /** Printers that received the job. */
  sent: string[];
  failed: Array<{ printer: string; error: string }>;
  /** True when no configured printer could take the job (caller may fall back). */
  noRoute: boolean;
}

function printingBridge() {
  return hasBridge() ? (getBridge().printing ?? null) : null;
}

/** Prints an HTML document through a hidden iframe (browser, or no silent route). */
export function printHtmlWithDialog(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.srcdoc = html;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        window.setTimeout(() => {
          frame.remove();
          resolve();
        }, 1000);
      }
    };
    document.body.appendChild(frame);
  });
}

async function sendToPrinter(
  printer: PrinterDto,
  blocks: ReceiptBlock[],
  installed: Set<string> | null,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const bridge = printingBridge();
  if (printer.connection === 'NETWORK') {
    if (!bridge || !printer.host) return { ok: false, skipped: true };
    const data = toBase64(receiptToEscPos(blocks, printer.paperWidth));
    for (let copy = 0; copy < printer.copies; copy += 1) {
      const result = await bridge.printRaw({ host: printer.host, port: printer.port, dataBase64: data });
      if (!result.ok) return { ok: false, error: result.error };
    }
    return { ok: true };
  }
  if (!bridge || !printer.deviceName || !installed?.has(printer.deviceName)) {
    return { ok: false, skipped: true };
  }
  const result = await bridge.printHtml({
    html: receiptToHtml(blocks, printer.paperWidth, printer.template.fontScale),
    deviceName: printer.deviceName,
    paperWidthMm: printer.paperWidth,
    silent: true,
    copies: printer.copies,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function installedPrinters(): Promise<Set<string> | null> {
  const bridge = printingBridge();
  if (!bridge) return null;
  try {
    return new Set((await bridge.listPrinters()).map((printer) => printer.name));
  } catch {
    return new Set();
  }
}

export function printersForJob(
  job: PrintJobKind,
  printers: readonly PrinterDto[],
  order: PrintableOrder | null,
): PrinterDto[] {
  return printers.filter((printer) => {
    if (!printer.isActive || !ROLES_FOR_JOB[job].includes(printer.role)) return false;
    if (order && printer.channels.length > 0 && !printer.channels.includes(order.channel)) return false;
    if (order && printer.role === 'KITCHEN_BY_CATEGORY') {
      return linesFor(order, printer.categoryIds).length > 0;
    }
    return true;
  });
}

export async function dispatchPrint(params: {
  job: PrintJobKind;
  printers: readonly PrinterDto[];
  settings: SettingsDto | null | undefined;
  order?: PrintableOrder;
  shift?: ShiftDto;
}): Promise<DispatchResult> {
  const { job, printers, settings } = params;
  const order = params.order ?? null;
  const targets = printersForJob(job, printers, order);
  const result: DispatchResult = { sent: [], failed: [], noRoute: false };
  if (targets.length === 0) return { ...result, noRoute: true };

  const installed = await installedPrinters();
  for (const printer of targets) {
    const blocks =
      job === 'SHIFT_Z_REPORT'
        ? params.shift
          ? zReportBlocks(params.shift, settings)
          : []
        : order
          ? blocksFor(printer, KIND_FOR_JOB[job], order, settings)
          : [];
    if (blocks.length === 0) continue;
    const outcome = await sendToPrinter(printer, blocks, installed);
    if (outcome.ok) result.sent.push(printer.name);
    else if (!outcome.skipped) result.failed.push({ printer: printer.name, error: outcome.error ?? 'Failed' });
  }
  result.noRoute = result.sent.length === 0 && result.failed.length === 0;
  return result;
}

/** One printer, sample order: the dashboard's "Test print" button. */
export async function testPrint(
  printer: PrinterDto,
  settings: SettingsDto | null | undefined,
): Promise<{ ok: boolean; error?: string; usedDialog?: boolean }> {
  const kind: ReceiptKind = printer.role.startsWith('KITCHEN')
    ? 'KITCHEN'
    : printer.role === 'DELIVERY_DISPATCH'
      ? 'DISPATCH'
      : 'CUSTOMER';
  const blocks = blocksFor({ ...printer, role: printer.role === 'KITCHEN_BY_CATEGORY' ? 'KITCHEN_ALL' : printer.role }, kind, sampleOrder(), settings);
  const outcome = await sendToPrinter(printer, blocks, await installedPrinters());
  if (outcome.ok) return { ok: true };
  if (outcome.skipped) {
    // Not reachable silently from here (browser, or printer on another PC).
    await printHtmlWithDialog(receiptToHtml(blocks, printer.paperWidth, printer.template.fontScale));
    return { ok: true, usedDialog: true };
  }
  return { ok: false, error: outcome.error };
}

export function previewHtml(
  printer: PrinterDto,
  settings: SettingsDto | null | undefined,
): string {
  const kind: ReceiptKind = printer.role.startsWith('KITCHEN')
    ? 'KITCHEN'
    : printer.role === 'DELIVERY_DISPATCH'
      ? 'DISPATCH'
      : 'CUSTOMER';
  const blocks = blocksFor({ ...printer, role: printer.role === 'KITCHEN_BY_CATEGORY' ? 'KITCHEN_ALL' : printer.role }, kind, sampleOrder(), settings);
  return receiptToHtml(blocks, printer.paperWidth, printer.template.fontScale);
}

export async function listLocalPrinters(): Promise<string[]> {
  const bridge = printingBridge();
  if (!bridge) return [];
  try {
    return (await bridge.listPrinters()).map((printer) => printer.name);
  } catch {
    return [];
  }
}

export function canPrintSilently(): boolean {
  return printingBridge() !== null;
}
