import type { OrderItemInput } from '@posshope/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The cart holds *what* the customer chose — item, size, toppings, quantity,
 * note — plus labels for display. It deliberately holds no prices: every
 * amount shown comes from the server's quote for these selections.
 *
 * It is stored per browser, not per account, so a guest's cart is still there
 * after they register or sign in.
 */
export interface CartLine {
  /** Stable identity: same item + size + toppings + note merge into one line. */
  key: string;
  menuItemId: string;
  sizeId: string | null;
  toppingIds: string[];
  quantity: number;
  specialInstructions: string;
  // Display-only snapshot, refreshed from the menu whenever it loads.
  name: string;
  sizeName: string | null;
  toppingNames: string[];
  imageUrl: string | null;
}

export interface DeliveryPoint {
  lat: number;
  lng: number;
}

interface CartState {
  lines: CartLine[];
  fulfillment: 'DELIVERY' | 'TAKEAWAY';
  point: DeliveryPoint | null;
  /** One key per checkout attempt, so a double submit creates one order. */
  attemptKey: string;
  add: (line: Omit<CartLine, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setFulfillment: (fulfillment: 'DELIVERY' | 'TAKEAWAY') => void;
  setPoint: (point: DeliveryPoint | null) => void;
  /** Drops lines whose item, size or toppings no longer exist on the menu. */
  reconcile: (isValid: (line: CartLine) => boolean) => number;
}

const MAX_QUANTITY = 20;

function newKey(): string {
  return `web-${crypto.randomUUID()}`;
}

function lineKey(line: Omit<CartLine, 'key'>): string {
  return [
    line.menuItemId,
    line.sizeId ?? '-',
    [...line.toppingIds].sort().join('+'),
    line.specialInstructions.trim().toLowerCase(),
  ].join('|');
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      fulfillment: 'DELIVERY',
      point: null,
      attemptKey: newKey(),

      add: (input) => {
        const key = lineKey(input);
        const existing = get().lines.find((line) => line.key === key);
        set({
          attemptKey: newKey(),
          lines: existing
            ? get().lines.map((line) =>
                line.key === key
                  ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + input.quantity) }
                  : line,
              )
            : [...get().lines, { ...input, key }],
        });
      },

      setQuantity: (key, quantity) =>
        set({
          attemptKey: newKey(),
          lines:
            quantity <= 0
              ? get().lines.filter((line) => line.key !== key)
              : get().lines.map((line) =>
                  line.key === key
                    ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) }
                    : line,
                ),
        }),

      remove: (key) =>
        set({ attemptKey: newKey(), lines: get().lines.filter((line) => line.key !== key) }),

      clear: () => set({ lines: [], attemptKey: newKey() }),

      setFulfillment: (fulfillment) => set({ fulfillment, attemptKey: newKey() }),
      setPoint: (point) => set({ point, attemptKey: newKey() }),

      reconcile: (isValid) => {
        const kept = get().lines.filter(isValid);
        const removed = get().lines.length - kept.length;
        if (removed > 0) set({ lines: kept, attemptKey: newKey() });
        return removed;
      },
    }),
    { name: 'forno-cart', version: 1 },
  ),
);

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function toOrderItems(lines: readonly CartLine[]): OrderItemInput[] {
  return lines.map((line) => ({
    menuItemId: line.menuItemId,
    sizeId: line.sizeId,
    quantity: line.quantity,
    toppingIds: line.toppingIds,
    ...(line.specialInstructions.trim()
      ? { specialInstructions: line.specialInstructions.trim() }
      : {}),
  }));
}
