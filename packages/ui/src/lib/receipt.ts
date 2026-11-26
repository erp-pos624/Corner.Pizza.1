/**
 * Receipt and ticket layout, independent of the output device.
 *
 * `buildReceipt` turns an order plus a printer template into a list of
 * blocks. `receiptToHtml` renders those blocks for the Windows spooler (and
 * the dashboard preview); `receiptToEscPos` renders them as raw ESC/POS bytes
 * for network printers. Both read the same blocks, so preview and paper match.
 */
import qrcode from 'qrcode-generator';
import {
  fromMinorUnits,
  toMinorUnits,
  type FontScale,
  type OrderChannel,
  type OrderType,
  type PaperWidth,
  type ReceiptTemplate,
} from '@posshope/shared';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type ReceiptKind = 'CUSTOMER' | 'KITCHEN' | 'DISPATCH';

export interface PrintableLine {
  name: string;
  sizeName: string | null;
  quantity: number;
  toppings: string[];
  note: string | null;
  /** Line total as a decimal string; null on kitchen data (no prices). */
  lineTotal: string | null;
  categoryId: string | null;
}

export interface PrintableOrder {
  orderNumber: string;
  invoiceNumber: string | null;
  createdAt: string;
  type: OrderType;
  channel: OrderChannel;
  externalRef: string | null;
  tableNumber: string | null;
  cashierName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  notes: string | null;
  lines: PrintableLine[];
  subtotal: string | null;
  discount: string | null;
  discountLabel: string | null;
  tax: string | null;
  taxIncluded: string | null;
  taxRate: string | null;
  deliveryFee: string | null;
  total: string | null;
  payments: Array<{ method: string; amount: string }>;
  changeDue: string | null;
  paymentNote: string | null;
}

export interface StoreInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
}

/** Every label the layout prints, already translated by the caller. */
export interface ReceiptLabels {
  receipt: string;
  kitchenTicket: string;
  dispatchTicket: string;
  order: string;
  invoice: string;
  date: string;
  type: string;
  channel: string;
  table: string;
  cashier: string;
  customer: string;
  phone: string;
  address: string;
  notes: string;
  subtotal: string;
  discount: string;
  tax: string;
  taxIncluded: string;
  delivery: string;
  total: string;
  change: string;
  orderTypeLabel: (type: OrderType) => string;
  channelLabel: (channel: OrderChannel) => string;
  paymentLabel: (method: string) => string;
  formatMoney: (value: string) => string;
  formatDateTime: (iso: string) => string;
}

export type ReceiptBlock =
  | { kind: 'logo'; src: string }
  | {
      kind: 'text';
      text: string;
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
      size?: 'sm' | 'md' | 'lg' | 'xl';
    }
  | { kind: 'row'; left: string; right: string; bold?: boolean; size?: 'sm' | 'md' | 'lg' }
  | { kind: 'divider' }
  | { kind: 'qr'; data: string };

export interface BuildOptions {
  kind: ReceiptKind;
  order: PrintableOrder;
  store: StoreInfo;
  template: ReceiptTemplate;
  labels: ReceiptLabels;
  /** KITCHEN_BY_CATEGORY: only these categories print; empty prints everything. */
  categoryIds?: readonly string[];
}

function hasAmount(value: string | null | undefined): value is string {
  return value != null && Number(value) !== 0;
}

/** Lines this printer should receive, or an empty list when nothing applies. */
export function linesFor(order: PrintableOrder, categoryIds: readonly string[] = []): PrintableLine[] {
  if (categoryIds.length === 0) return order.lines;
  return order.lines.filter((line) => line.categoryId && categoryIds.includes(line.categoryId));
}

export function buildReceipt(options: BuildOptions): ReceiptBlock[] {
  const { kind, order, store, template, labels } = options;
  const lines = linesFor(order, options.categoryIds);
  const money = (value: string): string => labels.formatMoney(value);
  const showPrices = template.showPrices;
  const blocks: ReceiptBlock[] = [];

  // Header
  if (template.showLogo && store.logoDataUrl) blocks.push({ kind: 'logo', src: store.logoDataUrl });
  if (kind === 'CUSTOMER' || template.showStoreDetails) {
    blocks.push({ kind: 'text', text: store.name, align: 'center', bold: true, size: 'lg' });
  }
  if (template.showStoreDetails) {
    for (const detail of [store.address, store.phone, store.email]) {
      if (detail) blocks.push({ kind: 'text', text: detail, align: 'center', size: 'sm' });
    }
  }
  if (template.headerNote) {
    blocks.push({ kind: 'text', text: template.headerNote, align: 'center', size: 'sm' });
  }

  const title =
    kind === 'KITCHEN' ? labels.kitchenTicket : kind === 'DISPATCH' ? labels.dispatchTicket : labels.receipt;
  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: title, align: 'center', bold: true, size: 'md' });
  blocks.push({
    kind: 'text',
    text: `${labels.order} #${order.orderNumber}`,
    align: 'center',
    bold: true,
    size: kind === 'KITCHEN' ? 'xl' : 'lg',
  });

  // Order details
  if (template.showOrderMeta) {
    if (kind === 'CUSTOMER' && order.invoiceNumber) {
      blocks.push({ kind: 'row', left: labels.invoice, right: order.invoiceNumber, size: 'sm' });
    }
    blocks.push({ kind: 'row', left: labels.date, right: labels.formatDateTime(order.createdAt), size: 'sm' });
    blocks.push({ kind: 'row', left: labels.type, right: labels.orderTypeLabel(order.type), size: 'sm' });
    if (order.channel !== 'POS') {
      const channel = labels.channelLabel(order.channel);
      blocks.push({
        kind: 'row',
        left: labels.channel,
        right: order.externalRef ? `${channel} #${order.externalRef}` : channel,
        bold: true,
        size: kind === 'KITCHEN' ? 'md' : 'sm',
      });
    }
    if (order.tableNumber) {
      blocks.push({ kind: 'row', left: labels.table, right: order.tableNumber, bold: kind === 'KITCHEN', size: 'sm' });
    }
    if (order.cashierName && kind === 'CUSTOMER') {
      blocks.push({ kind: 'row', left: labels.cashier, right: order.cashierName, size: 'sm' });
    }
  }

  if (template.showCustomer || kind === 'DISPATCH') {
    const customerRows: Array<[string, string | null]> = [
      [labels.customer, order.customerName],
      [labels.phone, order.customerPhone],
      [labels.address, order.customerAddress],
    ];
    if (customerRows.some(([, value]) => value)) blocks.push({ kind: 'divider' });
    for (const [label, value] of customerRows) {
      if (value) blocks.push({ kind: 'row', left: label, right: value, size: kind === 'DISPATCH' ? 'md' : 'sm' });
    }
  }

  // Items
  blocks.push({ kind: 'divider' });
  const itemSize = kind === 'KITCHEN' ? 'lg' : 'md';
  for (const line of lines) {
    const name = `${line.quantity} × ${line.name}${line.sizeName ? ` (${line.sizeName})` : ''}`;
    if (showPrices && line.lineTotal) {
      blocks.push({ kind: 'row', left: name, right: money(line.lineTotal), bold: kind === 'KITCHEN', size: itemSize === 'lg' ? 'lg' : 'md' });
    } else {
      blocks.push({ kind: 'text', text: name, bold: true, size: itemSize });
    }
    if (line.toppings.length > 0) {
      blocks.push({ kind: 'text', text: `  + ${line.toppings.join(', ')}`, size: kind === 'KITCHEN' ? 'md' : 'sm' });
    }
    if (template.showItemNotes && line.note) {
      blocks.push({ kind: 'text', text: `  “${line.note}”`, bold: kind === 'KITCHEN', size: kind === 'KITCHEN' ? 'md' : 'sm' });
    }
  }
  if (order.notes && (template.showItemNotes || kind !== 'CUSTOMER')) {
    blocks.push({ kind: 'divider' });
    blocks.push({ kind: 'text', text: `${labels.notes}: ${order.notes}`, bold: true, size: 'md' });
  }

  // Totals
  if (showPrices && order.total) {
    blocks.push({ kind: 'divider' });
    if (order.subtotal) blocks.push({ kind: 'row', left: labels.subtotal, right: money(order.subtotal) });
    if (hasAmount(order.discount)) {
      blocks.push({
        kind: 'row',
        left: order.discountLabel ? `${labels.discount} · ${order.discountLabel}` : labels.discount,
        right: `−${money(order.discount)}`,
      });
    }
    const includedMinor = order.taxIncluded ? toMinorUnits(order.taxIncluded) : 0;
    const addedMinor = order.tax ? toMinorUnits(order.tax) - includedMinor : 0;
    if (addedMinor > 0) {
      blocks.push({ kind: 'row', left: labels.tax, right: money(fromMinorUnits(addedMinor)) });
    }
    if (hasAmount(order.deliveryFee)) {
      blocks.push({ kind: 'row', left: labels.delivery, right: money(order.deliveryFee) });
    }
    blocks.push({ kind: 'row', left: labels.total, right: money(order.total), bold: true, size: 'lg' });
    if (template.showVatLine && includedMinor > 0) {
      blocks.push({ kind: 'row', left: labels.taxIncluded, right: money(fromMinorUnits(includedMinor)), size: 'sm' });
    }
  }

  if (template.showPayments && showPrices && (order.payments.length > 0 || order.paymentNote)) {
    blocks.push({ kind: 'divider' });
    for (const payment of order.payments) {
      blocks.push({ kind: 'row', left: labels.paymentLabel(payment.method), right: money(payment.amount), size: 'sm' });
    }
    if (hasAmount(order.changeDue)) {
      blocks.push({ kind: 'row', left: labels.change, right: money(order.changeDue), size: 'sm' });
    }
    if (order.paymentNote) blocks.push({ kind: 'text', text: order.paymentNote, bold: true, size: 'sm' });
  }

  // Footer
  if (template.footerEn || template.footerAr) blocks.push({ kind: 'divider' });
  if (template.footerEn) blocks.push({ kind: 'text', text: template.footerEn, align: 'center', size: 'sm' });
  if (template.footerAr) blocks.push({ kind: 'text', text: template.footerAr, align: 'center', size: 'sm' });
  if (template.showQr && template.qrUrl) blocks.push({ kind: 'qr', data: template.qrUrl });
  return blocks;
}

// ---------------------------------------------------------------------------
// HTML (Windows spooler + preview)
// ---------------------------------------------------------------------------

const FONT_PX: Record<FontScale, Record<'sm' | 'md' | 'lg' | 'xl', number>> = {
  COMPACT: { sm: 9, md: 10.5, lg: 13, xl: 17 },
  NORMAL: { sm: 10.5, md: 12, lg: 15, xl: 20 },
  LARGE: { sm: 12, md: 14, lg: 18, xl: 24 },
};

/** Printable width inside the roll's margins, in millimetres. */
export function printableWidthMm(paper: PaperWidth): number {
  return paper === 58 ? 48 : 72;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function qrSvg(data: string): string {
  const code = qrcode(0, 'M');
  code.addData(data);
  code.make();
  return code.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

export function receiptToHtml(
  blocks: readonly ReceiptBlock[],
  paper: PaperWidth,
  fontScale: FontScale,
): string {
  const px = FONT_PX[fontScale];
  const width = printableWidthMm(paper);
  const body = blocks
    .map((block) => {
      switch (block.kind) {
        case 'logo':
          return `<div class="c"><img src="${escapeHtml(block.src)}" alt="" class="logo"></div>`;
        case 'divider':
          return '<hr>';
        case 'qr':
          return `<div class="c qr">${qrSvg(block.data)}</div>`;
        case 'row':
          return `<div class="row${block.bold ? ' b' : ''}" style="font-size:${px[block.size ?? 'md']}px"><span dir="auto">${escapeHtml(block.left)}</span><span dir="auto" class="r">${escapeHtml(block.right)}</span></div>`;
        case 'text':
          return `<div dir="auto" class="${block.align === 'center' ? 'c' : block.align === 'right' ? 'rt' : ''}${block.bold ? ' b' : ''}" style="font-size:${px[block.size ?? 'md']}px">${escapeHtml(block.text)}</div>`;
        default:
          return '';
      }
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
@page { size: ${paper}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${width}mm; margin: 0 auto; padding: 2mm 0 6mm; font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif; line-height: 1.3; }
.c { text-align: center; } .rt { text-align: right; } .b { font-weight: 700; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.row .r { text-align: end; white-space: nowrap; }
hr { border: 0; border-top: 1px dashed #000; margin: 1.5mm 0; }
.logo { max-width: 26mm; max-height: 18mm; }
.qr svg { width: 26mm; height: 26mm; margin-top: 2mm; }
</style></head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// ESC/POS (network printers)
// ---------------------------------------------------------------------------

/** Characters per line in font A. */
export function columnsFor(paper: PaperWidth): number {
  return paper === 58 ? 32 : 48;
}

/**
 * ESC/POS printers print ASCII reliably; Arabic needs printer-specific code
 * pages, so non-ASCII text is dropped here. Use a Windows spooler printer for
 * Arabic receipts.
 */
function ascii(value: string): string {
  return value
    .replace(/[×]/gu, 'x')
    .replace(/[“”]/gu, '"')
    .replace(/[−–—]/gu, '-')
    .replace(/[^\x20-\x7E]/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trimEnd();
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width);
    const at = cut > width / 2 ? cut : width;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function receiptToEscPos(blocks: readonly ReceiptBlock[], paper: PaperWidth): Uint8Array {
  const cols = columnsFor(paper);
  const bytes: number[] = [];
  const push = (...values: number[]): void => {
    bytes.push(...values);
  };
  const write = (text: string): void => {
    for (const char of text) push(char.charCodeAt(0) & 0x7f);
    push(0x0a);
  };
  const align = (value: 'left' | 'center' | 'right' = 'left'): void =>
    push(0x1b, 0x61, value === 'center' ? 1 : value === 'right' ? 2 : 0);
  const bold = (on: boolean): void => push(0x1b, 0x45, on ? 1 : 0);
  const size = (value: 'sm' | 'md' | 'lg' | 'xl' = 'md'): number => {
    const factor = value === 'xl' ? 0x11 : value === 'lg' ? 0x01 : 0x00;
    push(0x1d, 0x21, factor);
    return value === 'xl' ? Math.floor(cols / 2) : cols;
  };

  push(0x1b, 0x40); // initialise
  for (const block of blocks) {
    switch (block.kind) {
      case 'logo':
        break; // raster logos need printer-specific setup; skipped on raw TCP
      case 'divider':
        align('left');
        size('md');
        write('-'.repeat(cols));
        break;
      case 'text': {
        const text = ascii(block.text);
        if (!text) break;
        align(block.align);
        bold(Boolean(block.bold));
        const width = size(block.size);
        for (const line of wrap(text, width)) write(line);
        bold(false);
        break;
      }
      case 'row': {
        const left = ascii(block.left);
        const right = ascii(block.right);
        if (!left && !right) break;
        align('left');
        bold(Boolean(block.bold));
        const width = size(block.size === 'lg' ? 'md' : block.size);
        const room = Math.max(width - right.length - 1, 4);
        const leftLines = wrap(left, room);
        const first = leftLines.shift() ?? '';
        write(`${first}${' '.repeat(Math.max(width - first.length - right.length, 1))}${right}`);
        for (const line of leftLines) write(line);
        bold(false);
        break;
      }
      case 'qr': {
        const data = Array.from(ascii(block.data)).map((char) => char.charCodeAt(0));
        if (data.length === 0) break;
        align('center');
        const length = data.length + 3;
        push(0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00); // model 2
        push(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06); // module size
        push(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
        push(0x1d, 0x28, 0x6b, length & 0xff, length >> 8, 0x31, 0x50, 0x30, ...data);
        push(0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
        push(0x0a);
        break;
      }
      default:
        break;
    }
  }
  size('md');
  align('left');
  push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00); // feed and partial cut
  return Uint8Array.from(bytes);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
