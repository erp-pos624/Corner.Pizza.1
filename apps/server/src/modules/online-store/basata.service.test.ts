import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    BASATA_BASE_URL: undefined as string | undefined,
    BASATA_API_KEY: undefined as string | undefined,
    BASATA_MERCHANT_ID: undefined as string | undefined,
    BASATA_WEBHOOK_SECRET: undefined as string | undefined,
    BASATA_CHECKOUT_RETURN_URL: undefined as string | undefined,
    BASATA_ALLOW_SIMULATION: undefined as 'true' | 'false' | undefined,
  },
  isProduction: false,
}));

vi.mock('../../env.js', () => ({
  get env() {
    return mocks.env;
  },
  get isProduction() {
    return mocks.isProduction;
  },
}));

import { AppError, ValidationError } from '../../lib/errors.js';
import {
  basataCallbackUrl,
  createBasataIntent,
  isBasataConfigured,
  isBasataSimulationAllowed,
  parseBasataWebhook,
  verifyBasataSignature,
} from './basata.service.js';

function enableGateway(overrides: Partial<typeof mocks.env> = {}): void {
  Object.assign(mocks.env, {
    BASATA_BASE_URL: 'https://api.basata.test',
    BASATA_API_KEY: 'key_test',
    BASATA_MERCHANT_ID: 'merchant_1',
    ...overrides,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mocks.isProduction = false;
  Object.assign(mocks.env, {
    BASATA_BASE_URL: undefined,
    BASATA_API_KEY: undefined,
    BASATA_MERCHANT_ID: undefined,
    BASATA_WEBHOOK_SECRET: undefined,
    BASATA_CHECKOUT_RETURN_URL: undefined,
    BASATA_ALLOW_SIMULATION: undefined,
  });
});

describe('isBasataConfigured', () => {
  it('stays unconfigured until the merchant keys are present', () => {
    expect(isBasataConfigured()).toBe(false);
    mocks.env.BASATA_BASE_URL = 'https://api.basata.test';
    mocks.env.BASATA_API_KEY = 'key_test';
    expect(isBasataConfigured()).toBe(false);
    mocks.env.BASATA_MERCHANT_ID = 'merchant_1';
    expect(isBasataConfigured()).toBe(true);
  });
});

describe('isBasataSimulationAllowed', () => {
  it('allows simulation outside production by default', () => {
    expect(isBasataSimulationAllowed()).toBe(true);
    mocks.isProduction = true;
    expect(isBasataSimulationAllowed()).toBe(false);
  });

  it('honours the explicit override in both directions', () => {
    mocks.isProduction = true;
    mocks.env.BASATA_ALLOW_SIMULATION = 'true';
    expect(isBasataSimulationAllowed()).toBe(true);
    mocks.isProduction = false;
    mocks.env.BASATA_ALLOW_SIMULATION = 'false';
    expect(isBasataSimulationAllowed()).toBe(false);
  });
});

describe('verifyBasataSignature', () => {
  const body = Buffer.from(JSON.stringify({ reference: 'ONL-1', status: 'paid' }));

  it('accepts a matching sha256 HMAC', () => {
    mocks.env.BASATA_WEBHOOK_SECRET = 'whsec_test';
    const signature = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(verifyBasataSignature(body, signature)).toBe(true);
    expect(verifyBasataSignature(body, `sha256=${signature}`)).toBe(true);
    expect(verifyBasataSignature(body, signature.toUpperCase())).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    mocks.env.BASATA_WEBHOOK_SECRET = 'whsec_test';
    const signature = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(verifyBasataSignature(Buffer.from('{"reference":"ONL-2"}'), signature)).toBe(false);
  });

  it('rejects malformed or missing signatures and secrets', () => {
    mocks.env.BASATA_WEBHOOK_SECRET = 'whsec_test';
    expect(verifyBasataSignature(body, 'not-a-signature')).toBe(false);
    expect(verifyBasataSignature(body, undefined)).toBe(false);
    mocks.env.BASATA_WEBHOOK_SECRET = undefined;
    expect(verifyBasataSignature(body, 'a'.repeat(64))).toBe(false);
  });
});

describe('parseBasataWebhook', () => {
  const parse = (payload: unknown): ReturnType<typeof parseBasataWebhook> =>
    parseBasataWebhook(Buffer.from(JSON.stringify(payload)));

  it('maps nested gateway events', () => {
    const event = parse({
      data: { reference: 'ONL-1', status: 'captured', id: 'pi_9', amount: '139.00' },
    });
    expect(event).toEqual({
      reference: 'ONL-1',
      status: 'PAID',
      providerRef: 'pi_9',
      amount: '139.00',
      rawPayload: {
        data: { reference: 'ONL-1', status: 'captured', id: 'pi_9', amount: '139.00' },
      },
    });
  });

  it('reads root-level payloads and merchant references', () => {
    expect(parse({ reference: 'ONL-2', event: 'payment_failed' }).status).toBe('FAILED');
    expect(
      parse({ data: { merchant_reference: 'ONL-3', payment_status: 'succeeded' } }).reference,
    ).toBe('ONL-3');
    expect(parse({ data: { reference: 'ONL-4', status: 'canceled' } }).status).toBe('CANCELLED');
    expect(parse({ data: { reference: 'ONL-5', status: 'voided' } }).status).toBe('CANCELLED');
    expect(parse({ data: { reference: 'ONL-6', status: 'expired' } }).status).toBe('EXPIRED');
  });

  it('rejects payloads without a reference', () => {
    expect(() => parse({ data: { status: 'paid' } })).toThrow(ValidationError);
  });

  it('rejects unsupported statuses', () => {
    expect(() => parse({ data: { reference: 'ONL-7', status: 'refunded' } })).toThrow(
      ValidationError,
    );
  });

  it('rejects bodies that are not JSON', () => {
    expect(() => parseBasataWebhook(Buffer.from('<xml/>'))).toThrow(ValidationError);
  });
});

describe('createBasataIntent', () => {
  const params = {
    reference: 'ONL-1',
    amount: '139.00',
    currency: 'EGP',
    customerName: 'Mona Ali',
    customerPhone: '01012345678',
  };

  it('returns a simulated intent when keys are missing', async () => {
    const result = await createBasataIntent(params);
    expect(result).toEqual({
      providerRef: null,
      checkoutUrl: null,
      rawPayload: { simulated: true, reference: 'ONL-1' },
      simulated: true,
    });
  });

  it('posts the intent and extracts the checkout URL', async () => {
    enableGateway();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: 'pi_1', checkoutUrl: 'https://pay.basata.test/checkout/pi_1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createBasataIntent(params);

    expect(result).toMatchObject({
      providerRef: 'pi_1',
      checkoutUrl: 'https://pay.basata.test/checkout/pi_1',
      simulated: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.basata.test/v1/payment-intents');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key_test');
    expect(JSON.parse(String(init.body))).toMatchObject({
      merchantId: 'merchant_1',
      reference: 'ONL-1',
      amount: '139.00',
      currency: 'EGP',
      customer: { name: 'Mona Ali', phone: '01012345678' },
    });
  });

  it('surfaces provider rejections', async () => {
    enableGateway();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid merchant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(createBasataIntent(params)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR',
      message: 'Invalid merchant',
    });
  });

  it('fails when the provider does not return a checkout page', async () => {
    enableGateway();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'pi_1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(createBasataIntent(params)).rejects.toBeInstanceOf(AppError);
  });

  it('reports an unreachable provider', async () => {
    enableGateway();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(createBasataIntent(params)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      statusCode: 502,
    });
  });
});

describe('basataCallbackUrl', () => {
  it('returns null without a configured return page', () => {
    expect(basataCallbackUrl('ONL-1')).toBeNull();
  });

  it('appends the reference to the storefront return URL', () => {
    mocks.env.BASATA_CHECKOUT_RETURN_URL = 'https://shop.test/payment/return?lang=en';
    const url = new URL(basataCallbackUrl('ONL-1')!);
    expect(url.origin + url.pathname).toBe('https://shop.test/payment/return');
    expect(url.searchParams.get('reference')).toBe('ONL-1');
    expect(url.searchParams.get('lang')).toBe('en');
  });
});
