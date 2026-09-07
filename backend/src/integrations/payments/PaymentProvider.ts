import type { PaymentMethod, PaymentStatus } from '@ecom/shared';

export interface CreateProviderOrderInput {
  amount: number;
  currency: string;
  /** Our order number, so the provider dashboard is reconcilable. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface ProviderOrder {
  providerOrderId: string;
  amount: number;
  currency: string;
  /** Public key the browser checkout needs. Never the secret. */
  keyId: string;
}

export interface VerifySignatureInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface ParsedWebhook {
  /** Provider's event id — the deduplication key. */
  eventId: string;
  type: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  amount?: number;
  status: PaymentStatus;
  method?: PaymentMethod;
}

export interface ProviderRefund {
  refundId: string;
  amount: number;
  status: 'processed' | 'pending' | 'failed';
}

/**
 * Payment provider abstraction.
 *
 * Shaped after Razorpay specifically — create an order server-side, let the
 * browser pay against it, then verify an HMAC signature — because that is the
 * provider this store is built for. Stripe and others fit the same shape.
 *
 * Business logic depends only on this interface. `MockProvider` implements it
 * with *real* HMAC-SHA256 signing over a local secret, so signature
 * verification, webhook handling and idempotency are genuinely exercised in
 * development rather than stubbed out. Swapping in Razorpay is then an adapter,
 * not a rewrite of the checkout.
 */
export interface PaymentProvider {
  readonly name: string;
  /** The publishable key id the browser needs. */
  readonly publicKeyId: string;

  createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder>;

  /** Verify the signature the checkout hands back after a successful payment. */
  verifyPaymentSignature(input: VerifySignatureInput): boolean;

  /** Verify a webhook against the EXACT bytes received. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;

  parseWebhook(rawBody: Buffer): ParsedWebhook;

  refund(input: {
    providerPaymentId: string;
    amount: number;
    notes?: Record<string, string>;
  }): Promise<ProviderRefund>;
}
