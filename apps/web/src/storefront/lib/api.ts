import {
  WEB_CLIENT_HEADER,
  WEB_CLIENT_HEADER_VALUE,
  type CustomerAccountDto,
  type CustomerAddressDto,
  type CustomerAddressInput,
  type CustomerSessionDto,
  type Language,
  type OrderItemInput,
  type Paginated,
  type PublicBranchDto,
  type PublicDeliveryCheckDto,
  type PublicMenuDto,
  type PublicOrderDto,
  type PublicQuoteDto,
} from '@posshope/shared';

/**
 * Storefront API client.
 *
 * Everything goes to `/api/public`. A signed-in customer's access token is
 * kept in this module's memory only; the refresh token lives in an HttpOnly
 * cookie the page cannot read. Prices are never sent: the server computes
 * every amount from item ids and quantities.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First field-level message from a validation error, if any. */
  get fieldMessage(): string | null {
    if (!Array.isArray(this.details)) return null;
    const first = this.details[0] as { message?: string } | undefined;
    return first?.message ?? null;
  }
}

const WEB = { [WEB_CLIENT_HEADER]: WEB_CLIENT_HEADER_VALUE };

/**
 * The server localizes menu content and error messages from this header, so
 * every request carries the language the customer is reading.
 */
const FALLBACKS: Record<Language, { generic: string; network: string }> = {
  en: {
    generic: 'Something went wrong. Please try again.',
    network: 'We could not reach the restaurant. Check your connection and try again.',
  },
  ar: {
    generic: 'حدث خطأ ما. حاول مرة أخرى.',
    network: 'تعذر الوصول إلى المطعم. تحقق من اتصالك وحاول مرة أخرى.',
  },
};

let requestLanguage: Language = 'en';

export function setRequestLanguage(language: Language): void {
  requestLanguage = language;
}

let accessToken: string | null = null;
let refreshing: Promise<CustomerSessionDto | null> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (response.ok) return body as T;
  const error = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
  throw new ApiError(
    error?.message ?? FALLBACKS[requestLanguage].generic,
    response.status,
    error?.code ?? `HTTP_${response.status}`,
    error?.details,
  );
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api/public${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError(
      FALLBACKS[requestLanguage].network,
      0,
      'NETWORK_ERROR',
    );
  }
}

interface Options {
  body?: unknown;
  /** Attach the customer token when one exists. */
  auth?: boolean;
  /** Cookie-backed routes need the CSRF header. */
  web?: boolean;
}

function buildInit(method: string, options: Options): RequestInit {
  return {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.web ? WEB : {}),
      ...(options.auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      'x-language': requestLanguage,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };
}

/** Rotates the session; overlapping callers share one request. */
function refreshSession(): Promise<CustomerSessionDto | null> {
  refreshing ??= (async () => {
    try {
      const response = await send('/account/refresh', buildInit('POST', { web: true }));
      const session = await parse<CustomerSessionDto>(response);
      accessToken = session.accessToken;
      return session;
    } catch {
      accessToken = null;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, options: Options = {}): Promise<T> {
  let response = await send(path, buildInit(method, options));
  if (response.status === 401 && options.auth && accessToken) {
    if (await refreshSession()) {
      response = await send(path, buildInit(method, options));
    } else {
      onSessionLost?.();
    }
  }
  return parse<T>(response);
}

function adopt(session: CustomerSessionDto): CustomerSessionDto {
  accessToken = session.accessToken;
  return session;
}

export interface OrderRequest {
  branchId: string;
  idempotencyKey: string;
  customerName: string;
  customerPhone: string;
  fulfillment: 'DELIVERY' | 'TAKEAWAY';
  customerAddress?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  items: OrderItemInput[];
  paymentMethod: 'CASH' | 'CARD';
  deliveryZoneId?: string | null;
  expectedDeliveryFee?: string;
  notes?: string;
}

export const api = {
  branches: () => request<PublicBranchDto[]>('GET', '/branches'),
  menu: (branchId: string) =>
    request<PublicMenuDto>('GET', `/menu?branchId=${encodeURIComponent(branchId)}`),
  quote: (body: {
    branchId: string;
    fulfillment: 'DELIVERY' | 'TAKEAWAY';
    items: OrderItemInput[];
    customerLat?: number | null;
    customerLng?: number | null;
  }) => request<PublicQuoteDto>('POST', '/orders/quote', { body }),
  checkZone: (body: { branchId: string; lat: number; lng: number }) =>
    request<PublicDeliveryCheckDto>('POST', '/delivery/check-zone', { body }),
  placeOrder: (body: OrderRequest) =>
    request<PublicOrderDto>('POST', '/orders', { body, auth: true }),
  /** Guest lookup: the phone number on the order is the only key. */
  trackOrder: (orderNumber: string, phone: string) =>
    request<PublicOrderDto>(
      'GET',
      `/orders/${encodeURIComponent(orderNumber)}?phone=${encodeURIComponent(phone)}`,
    ),

  account: {
    /** Restores a session from the cookie on page load. */
    restore: () => refreshSession(),
    register: (body: { name: string; phone: string; email?: string; password: string }) =>
      request<CustomerSessionDto>('POST', '/account/register', { body, web: true }).then(adopt),
    login: (body: { identifier: string; password: string }) =>
      request<CustomerSessionDto>('POST', '/account/login', { body, web: true }).then(adopt),
    logout: async () => {
      try {
        await request<void>('POST', '/account/logout', { web: true });
      } finally {
        accessToken = null;
      }
    },
    updateProfile: (body: { name?: string; email?: string | null }) =>
      request<CustomerAccountDto>('PATCH', '/account/me', { body, auth: true }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<CustomerSessionDto>('POST', '/account/change-password', {
        body,
        auth: true,
        web: true,
      }).then(adopt),
    addresses: () => request<CustomerAddressDto[]>('GET', '/account/addresses', { auth: true }),
    createAddress: (body: CustomerAddressInput) =>
      request<CustomerAddressDto>('POST', '/account/addresses', { body, auth: true }),
    updateAddress: (id: string, body: CustomerAddressInput) =>
      request<CustomerAddressDto>('PUT', `/account/addresses/${id}`, { body, auth: true }),
    deleteAddress: (id: string) =>
      request<void>('DELETE', `/account/addresses/${id}`, { auth: true }),
    orders: (page: number) =>
      request<Paginated<PublicOrderDto>>('GET', `/account/orders?page=${page}&pageSize=10`, {
        auth: true,
      }),
    order: (orderNumber: string) =>
      request<PublicOrderDto>('GET', `/account/orders/${encodeURIComponent(orderNumber)}`, {
        auth: true,
      }),
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.fieldMessage ?? error.message;
  return FALLBACKS[requestLanguage].generic;
}
