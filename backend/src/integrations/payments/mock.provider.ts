import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import { ERROR_CODES } from '@ecom/shared';
import type {
  CreateProviderOrderInput,
  ParsedWebhook,
  PaymentProvider,
  ProviderOrder,
  ProviderRefund,
  VerifySignatureInput,
} from './PaymentProvider.js';

const log = createLogger('payments:mock');

/**
 * Development payment provider.
 *
 * Deliberately NOT a stub that returns `{ ok: true }`. It reproduces Razorpay's
 * contract exactly — including HMAC-SHA256 signatures over
 * `order_id|payment_id` for payments and over the raw body for webhooks — so
 * the code paths that matter most are genuinely exercised:
 *
 *   • signature verification actually verifies something,
 *   • a forged signature is actually rejected,
 *   • webhook idempotency is tested against real duplicate deliveries.
 *
 * A stub would let all three ship broken and only fail in production, against
 * real money. Swapping to Razorpay becomes an adapter that speaks HTTP instead
 * of computing locally, with no change above this interface.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly publicKeyId = env.MOCK_PAYMENT_KEY_ID;

  private get secret(): string {
    return env.MOCK_PAYMENT_KEY_SECRET;
  }

  private get webhookSecret(): string {
    return env.MOCK_PAYMENT_WEBHOOK_SECRET;
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    const providerOrderId = `mock_order_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

    log.debug({ providerOrderId, amount: input.amount, receipt: input.receipt }, 'Created order');

    return {
      providerOrderId,
      // Providers work in minor units; keeping that here means the real adapter
      // is a drop-in and no conversion is forgotten at the boundary.
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      keyId: this.publicKeyId,
    };
  }

  /**
   * Verify the checkout callback signature.
   *
   * Razorpay signs `order_id|payment_id` with the key secret; this does the
   * same. `timingSafeEqual` is not decoration — comparing signatures with `===`
   * leaks how many leading bytes matched, which is enough to forge one byte at
   * a time.
   */
  verifyPaymentSignature({
    providerOrderId,
    providerPaymentId,
    signature,
  }: VerifySignatureInput): boolean {
    const expected = createHmac('sha256', this.secret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');

    return safeEqualHex(expected, signature);
  }

  /**
   * Verify a webhook against the raw bytes.
   *
   * Must be the exact body received. Re-serialising parsed JSON changes key
   * order and whitespace, and the HMAC no longer matches — which is why the
   * webhook route mounts `express.raw` before the JSON parser.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  }

  parseWebhook(rawBody: Buffer): ParsedWebhook {
    let payload: MockWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MockWebhookPayload;
    } catch {
      throw AppError.badRequest('Webhook body is not valid JSON');
    }

    if (!payload.event || !payload.id) {
      throw AppError.badRequest('Webhook is missing an event id or type');
    }

    const entity = payload.payload?.payment?.entity;

    return {
      eventId: payload.id,
      type: payload.event,
      providerOrderId: entity?.order_id,
      providerPaymentId: entity?.id,
      amount: entity?.amount !== undefined ? entity.amount / 100 : undefined,
      status: payload.event === 'payment.captured' ? 'paid' : 'failed',
      method: entity?.method,
    };
  }

  async refund(input: { providerPaymentId: string; amount: number }): Promise<ProviderRefund> {
    log.debug({ paymentId: input.providerPaymentId, amount: input.amount }, 'Refund issued');

    return {
      refundId: `mock_rfnd_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
      amount: input.amount,
      status: 'processed',
    };
  }

  // ── Development helpers ───────────────────────────────────────────────────
  // Only reachable through the dev-only simulate endpoint, which is refused
  // outright when PAYMENT_PROVIDER is not `mock`.

  /** Produce the signature a real checkout would hand back. */
  signPayment(providerOrderId: string, providerPaymentId: string): string {
    return createHmac('sha256', this.secret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
  }

  /** Produce a signed webhook body, for exercising the real handler. */
  buildWebhook(params: {
    eventId?: string;
    event: 'payment.captured' | 'payment.failed';
    providerOrderId: string;
    providerPaymentId: string;
    amount: number;
    method?: string;
  }): { body: string; signature: string } {
    const payload: MockWebhookPayload = {
      id: params.eventId ?? `mock_evt_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
      event: params.event,
      payload: {
        payment: {
          entity: {
            id: params.providerPaymentId,
            order_id: params.providerOrderId,
            amount: Math.round(params.amount * 100),
            method: (params.method ?? 'upi') as never,
          },
        },
      },
    };

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    return { body, signature };
  }
}

interface MockWebhookPayload {
  id: string;
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        method?: 'card' | 'upi' | 'netbanking' | 'wallet' | 'cod' | 'mock';
      };
    };
  };
}

/** Constant-time comparison of two hex digests of possibly different lengths. */
function safeEqualHex(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

export { ERROR_CODES };
