import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, Loader2, Lock, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/format';
import {
  createCheckoutSession,
  simulatePayment,
  verifyPayment,
} from '@/features/orders/api/orders.api';
import { useInvalidateAfterOrder } from '@/features/orders/api/queries';
import type { DeliveryMethod } from '@ecom/shared';
import type { CheckoutQuote } from '../api/checkout.api';

interface PaymentStepProps {
  quote?: CheckoutQuote;
  addressId?: string;
  deliveryMethod: DeliveryMethod;
}

type Phase = 'idle' | 'creating' | 'paying' | 'verifying';

/**
 * Place the order and take payment.
 *
 * The sequence mirrors what a real provider requires, because the mock
 * implements the same contract:
 *
 *   1. Create the order server-side. Stock is reserved and a provider order is
 *      opened. The browser never learns the price — it is told what to pay.
 *   2. The customer pays against that provider order.
 *   3. The signature returned is verified SERVER-side before the order is
 *      confirmed. Nothing the browser says about success is believed.
 *
 * A webhook confirms the same order independently, so a customer who closes
 * the tab mid-payment still gets a confirmed order. Both paths are idempotent.
 */
export function PaymentStep({ quote, addressId, deliveryMethod }: PaymentStepProps) {
  const navigate = useNavigate();
  const invalidateAfterOrder = useInvalidateAfterOrder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Generated once per attempt sequence, so a double click or a retry after a
  // dropped response replays the first order instead of creating a second.
  const [idempotencyKey] = useState(
    () => `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const isBusy = phase !== 'idle';

  const pay = async (outcome: 'success' | 'failure') => {
    setError(null);

    try {
      setPhase('creating');
      const session = await createCheckoutSession({ addressId, deliveryMethod }, idempotencyKey);

      setPhase('paying');
      const simulated = await simulatePayment(session.payment.providerOrderId, outcome);

      if (simulated.outcome === 'failure') {
        setPhase('idle');
        setError('The payment was declined. You have not been charged — please try again.');
        invalidateAfterOrder();
        return;
      }

      setPhase('verifying');
      await verifyPayment({
        providerOrderId: simulated.providerOrderId,
        providerPaymentId: simulated.providerPaymentId,
        signature: simulated.signature,
      });

      invalidateAfterOrder();
      toast.success('Payment confirmed');
      navigate(`/orders/${session.order.orderNumber}/confirmation`, { replace: true });
    } catch (err) {
      setPhase('idle');
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong taking your payment. You have not been charged.',
      );
    }
  };

  const total = quote?.pricing.grandTotal ?? 0;
  const currency = quote?.pricing.currency ?? 'INR';

  return (
    <>
      <h2 className="mb-1 text-base font-semibold">Payment</h2>
      <p className="text-muted-foreground mb-5 text-sm">
        You will be charged {formatCurrency(total, currency)}.
      </p>

      {error && (
        <Alert variant="destructive" className="mb-5">
          <XCircle className="size-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="bg-muted/40 rounded-lg border p-4">
        <div className="flex items-center gap-2.5">
          <CreditCard className="text-muted-foreground size-5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Mock payment provider</p>
            <p className="text-muted-foreground text-xs">
              Signs and verifies with real HMAC-SHA256, exactly as the live provider will
            </p>
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="mt-5 w-full"
        disabled={isBusy || !quote?.canPlaceOrder}
        onClick={() => void pay('success')}
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Lock className="size-4" aria-hidden="true" />
        )}
        {phase === 'creating' && 'Reserving your items…'}
        {phase === 'paying' && 'Taking payment…'}
        {phase === 'verifying' && 'Verifying payment…'}
        {phase === 'idle' && `Pay ${formatCurrency(total, currency)}`}
      </Button>

      {/* Exercising the decline path is as important as the happy one — it is
          what proves stock is released rather than stranded. */}
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full"
        disabled={isBusy}
        onClick={() => void pay('failure')}
      >
        Simulate a declined payment
      </Button>

      <Separator className="my-5" />

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Your payment is verified on our servers before the order is confirmed. Card details never
        reach this application.
      </p>
    </>
  );
}
