import { env } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import type { PaymentProvider } from './PaymentProvider.js';
import { MockPaymentProvider } from './mock.provider.js';

const log = createLogger('payments');

/**
 * Provider selection, made once at boot.
 *
 * `env.ts` refuses to start with PAYMENT_PROVIDER=mock in production, so the
 * mock cannot reach real customers. Adding Razorpay means implementing
 * `PaymentProvider` and one more branch here.
 */
function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case 'razorpay':
      // Intentionally not implemented yet — see the README. Failing loudly at
      // boot is far better than silently falling back to the mock and taking
      // fake payments in production.
      throw new Error(
        'PAYMENT_PROVIDER=razorpay is selected but the Razorpay adapter is not implemented yet.',
      );
    case 'mock':
    default:
      log.info('Using the mock payment provider (Razorpay-compatible contract)');
      return new MockPaymentProvider();
  }
}

export const paymentProvider: PaymentProvider = createPaymentProvider();

/** Typed handle for the dev-only simulation endpoint and for tests. */
export function getMockProvider(): MockPaymentProvider | undefined {
  return paymentProvider instanceof MockPaymentProvider ? paymentProvider : undefined;
}

export * from './PaymentProvider.js';
export { MockPaymentProvider } from './mock.provider.js';
