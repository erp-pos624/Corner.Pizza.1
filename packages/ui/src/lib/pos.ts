import type { MenuItemDto, PaymentMethod } from '@posshope/shared';

export interface CartTopping {
  id: string;
  name: string;
  price: number;
}

export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  sizeId: string | null;
  sizeName: string | null;
  unitPrice: number;
  /** Copied from the menu item: true when the price already includes VAT. */
  taxInclusive: boolean;
  toppings: CartTopping[];
  quantity: number;
  specialInstructions: string;
}

export interface CustomerForm {
  id: string | null;
  name: string;
  phone: string;
  address: string;
}

export const EMPTY_CUSTOMER: CustomerForm = { id: null, name: '', phone: '', address: '' };

export interface PaymentLine {
  key: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
}

export function newPaymentLine(method: PaymentMethod): PaymentLine {
  return {
    key: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    method,
    amount: '',
    reference: '',
  };
}

export function itemPrice(item: MenuItemDto): number {
  if (item.hasSizes && item.sizes.length > 0) {
    return Math.min(...item.sizes.map((size) => Number(size.price)));
  }
  return Number(item.basePrice);
}

export function money(value: number): number {
  return Math.round(value * 100);
}

export function fromMinor(value: number): string {
  return (value / 100).toFixed(2);
}

export function lineUnitPrice(line: CartLine): number {
  return line.unitPrice + line.toppings.reduce((sum, topping) => sum + topping.price, 0);
}

export function lineTotal(line: CartLine): number {
  return lineUnitPrice(line) * line.quantity;
}
