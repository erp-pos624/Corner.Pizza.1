import { describe, expect, it } from 'vitest';
import { defaultTemplateFor, type PrinterDto } from '@posshope/shared';
import {
  buildReceipt,
  columnsFor,
  receiptToEscPos,
  receiptToHtml,
  type PrintableOrder,
  type ReceiptBlock,
  type ReceiptLabels,
} from './receipt';
import { printersForJob, sampleOrder } from './print-service';

const labels: ReceiptLabels = {
  receipt: 'RECEIPT',
  kitchenTicket: 'KITCHEN COPY',
  dispatchTicket: 'DISPATCH',
  order: 'Order',
  invoice: 'Invoice',
  date: 'Date',
  type: 'Service',
  channel: 'Source',
  table: 'Table',
  cashier: 'Cashier',
  customer: 'Guest',
  phone: 'Phone',
  address: 'Address',
  notes: 'Notes',
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax (14.00%)',
  taxIncluded: 'Incl. VAT (14.00%)',
  delivery: 'Delivery',
  total: 'TOTAL',
  change: 'Change',
  orderTypeLabel: (type) => type,
  channelLabel: (channel) => (channel === 'TALABAT' ? 'Talabat' : channel),
  paymentLabel: (method) => method,
  formatMoney: (value) => `EGP ${value}`,
  formatDateTime: () => '25/11/2026 14:00',
};
const store = { name: 'Corner Pizza', address: 'EASTERN COURT, REHAB 2', phone: '01557075252', email: 'order@eatcornerpizza.com', logoDataUrl: null };

function textOf(blocks: ReceiptBlock[]): string {
  return blocks
    .map((block) =>
      block.kind === 'text' ? block.text : block.kind === 'row' ? `${block.left} | ${block.right}` : block.kind,
    )
    .join('\n');
}

function order(overrides: Partial<PrintableOrder> = {}): PrintableOrder {
  return {
    ...sampleOrder(),
    lines: [
      { name: 'Margherita', sizeName: 'M', quantity: 1, toppings: [], note: null, lineTotal: '210.00', categoryId: 'pizza' },
      { name: 'V-Cola', sizeName: null, quantity: 1, toppings: [], note: null, lineTotal: '40.00', categoryId: 'drinks' },
    ],
    subtotal: '250.00',
    tax: '30.70',
    taxIncluded: '30.70',
    total: '250.00',
    ...overrides,
  };
}

describe('customer receipt', () => {
  const blocks = buildReceipt({ kind: 'CUSTOMER', order: order(), store, template: defaultTemplateFor('CUSTOMER_RECEIPT'), labels });
  const text = textOf(blocks);

  it('shows the menu price as the total and the VAT as included, never added', () => {
    expect(text).toContain('TOTAL | EGP 250.00');
    expect(text).toContain('Incl. VAT (14.00%) | EGP 30.70');
    expect(text).not.toContain('Tax (14.00%)');
  });

  it('prints store contact details and the Talabat order number', () => {
    expect(text).toContain('order@eatcornerpizza.com');
    expect(text).toContain('01557075252');
    expect(text).toContain('Source | Talabat #123456789');
  });

  it('adds an exclusive-tax row only for VAT added on top', () => {
    const mixed = textOf(
      buildReceipt({
        kind: 'CUSTOMER',
        order: order({ tax: '44.70', taxIncluded: '30.70', total: '264.00' }),
        store,
        template: defaultTemplateFor('CUSTOMER_RECEIPT'),
        labels,
      }),
    );
    expect(mixed).toContain('Tax (14.00%) | EGP 14.00');
    expect(mixed).toContain('Incl. VAT (14.00%) | EGP 30.70');
  });
});

describe('kitchen ticket', () => {
  it('hides every price by default', () => {
    const text = textOf(
      buildReceipt({ kind: 'KITCHEN', order: order(), store, template: defaultTemplateFor('KITCHEN_ALL'), labels }),
    );
    expect(text).toContain('1 × Margherita (M)');
    expect(text).not.toContain('EGP');
    expect(text).not.toContain('TOTAL');
  });

  it('prints only the selected categories on a category printer', () => {
    const text = textOf(
      buildReceipt({
        kind: 'KITCHEN',
        order: order(),
        store,
        template: defaultTemplateFor('KITCHEN_BY_CATEGORY'),
        labels,
        categoryIds: ['drinks'],
      }),
    );
    expect(text).toContain('V-Cola');
    expect(text).not.toContain('Margherita');
  });
});

describe('renderers', () => {
  const blocks = buildReceipt({ kind: 'CUSTOMER', order: order(), store, template: defaultTemplateFor('CUSTOMER_RECEIPT'), labels });

  it('sizes the HTML page to the roll and escapes text', () => {
    const html = receiptToHtml(
      [...blocks, { kind: 'text', text: '<script>x</script>' }],
      58,
      'NORMAL',
    );
    expect(html).toContain('size: 58mm auto');
    expect(html).toContain('width: 48mm');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x');
  });

  it('renders a QR code as inline SVG', () => {
    const html = receiptToHtml([{ kind: 'qr', data: 'https://eatcornerpizza.com' }], 80, 'NORMAL');
    expect(html).toContain('<svg');
  });

  it('produces ESC/POS starting with init and ending with a cut', () => {
    const bytes = receiptToEscPos(blocks, 80);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(Array.from(bytes).every((byte) => byte < 0x80 || byte === 0x00)).toBe(true);
    expect(columnsFor(58)).toBe(32);
  });
});

describe('printer routing', () => {
  const base: PrinterDto = {
    id: 'p',
    branchId: 'b',
    name: 'Counter',
    connection: 'SPOOLER',
    deviceName: 'Deli S580P',
    host: null,
    port: 9100,
    paperWidth: 80,
    role: 'CUSTOMER_RECEIPT',
    categoryIds: [],
    channels: [],
    copies: 1,
    isActive: true,
    sortOrder: 0,
    template: defaultTemplateFor('CUSTOMER_RECEIPT'),
    updatedAt: '',
  };
  const counter = base;
  const downstairs = { ...base, id: 'd', name: 'Downstairs', role: 'KITCHEN_ALL' as const };
  const upstairs = { ...base, id: 'u', name: 'Upstairs', role: 'KITCHEN_BY_CATEGORY' as const, categoryIds: ['drinks'] };
  const off = { ...base, id: 'o', name: 'Spare', role: 'KITCHEN_ALL' as const, isActive: false };
  const websiteOnly = { ...base, id: 'w', name: 'Web', role: 'KITCHEN_ALL' as const, channels: ['ONLINE' as const] };
  const fleet = [counter, downstairs, upstairs, off, websiteOnly];

  it('sends kitchen jobs to active kitchen printers with matching lines and channel', () => {
    const names = printersForJob('KITCHEN', fleet, order()).map((printer) => printer.name);
    expect(names).toEqual(['Downstairs', 'Upstairs']);
  });

  it('skips a category printer when no line belongs to its categories', () => {
    const pizzaOnly = order({ lines: [order().lines[0]!] });
    expect(printersForJob('KITCHEN', fleet, pizzaOnly).map((printer) => printer.name)).toEqual(['Downstairs']);
  });

  it('sends receipts only to receipt printers', () => {
    expect(printersForJob('CUSTOMER_RECEIPT', fleet, order()).map((printer) => printer.name)).toEqual(['Counter']);
  });
});
