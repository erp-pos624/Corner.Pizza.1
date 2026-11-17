import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError, ValidationError } from '../../lib/errors.js';
import { env, isProduction } from '../../env.js';

export type BasataEventStatus = 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface BasataIntentResult {
  providerRef: string | null;
  checkoutUrl: string | null;
  rawPayload: unknown;
  simulated: boolean;
}

export interface BasataWebhookEvent {
  reference: string;
  status: BasataEventStatus;
  providerRef: string | null;
  amount: string | null;
  rawPayload: unknown;
}

const WEBHOOK_STATUS_MAP: Record<string, BasataEventStatus> = {
  paid: 'PAID',
  captured: 'PAID',
  succeeded: 'PAID',
  success: 'PAID',
  completed: 'PAID',
  paid_online: 'PAID',
  failed: 'FAILED',
  declined: 'FAILED',
  error: 'FAILED',
  payment_failed: 'FAILED',
  expired: 'EXPIRED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  voided: 'CANCELLED',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function isBasataConfigured(): boolean {
  return Boolean(env.BASATA_BASE_URL && env.BASATA_API_KEY && env.BASATA_MERCHANT_ID);
}

/**
 * Without live merchant keys the gateway cannot be called. Simulation is
 * allowed outside production so the whole lifecycle stays testable.
 */
export function isBasataSimulationAllowed(): boolean {
  if (env.BASATA_ALLOW_SIMULATION) return env.BASATA_ALLOW_SIMULATION === 'true';
  return !isProduction;
}

function joinUrl(base: string, path: string): string {
  return new URL(path.replace(/^\//u, ''), base.replace(/\/?$/u, '/')).toString();
}

export async function createBasataIntent(params: {
  reference: string;
  amount: string;
  currency: string;
  customerName: string;
  customerPhone: string;
  returnUrl?: string | null;
}): Promise<BasataIntentResult> {
  if (!isBasataConfigured()) {
    return {
      providerRef: null,
      checkoutUrl: null,
      rawPayload: { simulated: true, reference: params.reference },
      simulated: true,
    };
  }

  let response: Response;
  try {
    response = await fetch(joinUrl(env.BASATA_BASE_URL!, 'v1/payment-intents'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${env.BASATA_API_KEY!}`,
      },
      body: JSON.stringify({
        merchantId: env.BASATA_MERCHANT_ID,
        reference: params.reference,
        amount: params.amount,
        currency: params.currency,
        customer: { name: params.customerName, phone: params.customerPhone },
        returnUrl: params.returnUrl ?? env.BASATA_CHECKOUT_RETURN_URL ?? null,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new AppError('The payment provider is unreachable. Please try again.', {
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      cause: error,
    });
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 2_000) };
  }

  if (!response.ok) {
    const body = asRecord(payload);
    const message =
      pickString(body.message, body.error, asRecord(body.error).message) ??
      'The payment provider rejected the checkout request';
    throw new AppError(message, {
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
      details: { status: response.status },
    });
  }

  const body = asRecord(payload);
  const data = asRecord(body.data);
  const providerRef = pickString(
    data.id,
    data.intentId,
    data.paymentId,
    body.id,
    body.intentId,
    body.paymentId,
  );
  const checkoutUrl = pickString(
    data.checkoutUrl,
    data.paymentUrl,
    data.redirectUrl,
    data.url,
    body.checkoutUrl,
    body.paymentUrl,
    body.redirectUrl,
    body.url,
  );

  if (!checkoutUrl) {
    throw new AppError('The payment provider did not return a checkout page', {
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  }

  return { providerRef, checkoutUrl, rawPayload: payload, simulated: false };
}

export function verifyBasataSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = env.BASATA_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const provided = signature
    .replace(/^sha256=/iu, '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(provided)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function parseBasataWebhook(rawBody: Buffer): BasataWebhookEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ValidationError('The webhook payload is not valid JSON');
  }

  const root = asRecord(payload);
  const data = asRecord(root.data);
  const reference = pickString(
    data.reference,
    data.merchantReference,
    data.merchant_reference,
    data.orderReference,
    root.reference,
    root.merchantReference,
    root.merchant_reference,
    root.orderReference,
  );
  if (!reference) throw new ValidationError('The webhook payload is missing the payment reference');

  const statusRaw = pickString(
    data.status,
    data.paymentStatus,
    data.payment_status,
    data.event,
    root.status,
    root.paymentStatus,
    root.event,
  );
  const status = statusRaw ? WEBHOOK_STATUS_MAP[statusRaw.toLowerCase()] : undefined;
  if (!status) {
    throw new ValidationError(`Unsupported Basata payment status: ${statusRaw ?? '(missing)'}`);
  }

  return {
    reference,
    status,
    providerRef: pickString(data.id, data.paymentId, root.id, root.paymentId),
    amount: pickString(data.amount, data.total, root.amount, root.total),
    rawPayload: payload,
  };
}

/** Route callback redirects through the storefront; this only reads state. */
export function basataCallbackUrl(reference: string): string | null {
  if (!env.BASATA_CHECKOUT_RETURN_URL) return null;
  const url = new URL(env.BASATA_CHECKOUT_RETURN_URL);
  url.searchParams.set('reference', reference);
  return url.toString();
}
