/**
 * Orders placed on this device without an account. A guest order can only be
 * looked up with its number *and* the phone number on it, so we remember that
 * pair locally to let the customer come back to their tracking page.
 */
interface GuestOrder {
  orderNumber: string;
  phone: string;
  placedAt: string;
}

const KEY = 'forno-guest-orders';
const LIMIT = 10;

export function listGuestOrders(): GuestOrder[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as GuestOrder[]) : [];
  } catch {
    return [];
  }
}

export function rememberGuestOrder(orderNumber: string, phone: string): void {
  try {
    const next = [
      { orderNumber, phone, placedAt: new Date().toISOString() },
      ...listGuestOrders().filter((order) => order.orderNumber !== orderNumber),
    ].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the customer can still track with number + phone.
  }
}

export function guestPhoneFor(orderNumber: string): string | null {
  return listGuestOrders().find((order) => order.orderNumber === orderNumber)?.phone ?? null;
}
