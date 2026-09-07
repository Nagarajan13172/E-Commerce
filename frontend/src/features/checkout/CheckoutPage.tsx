import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, Lock, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { PageLoader } from '@/components/common/PageLoader';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  completeStep,
  goToStep,
  resetCheckout,
  selectAddress,
  selectDeliveryMethod as chooseDeliveryMethod,
} from '@/store/slices/checkoutSlice';
import { selectCheckout } from '@/store/selectors';
import { useCart } from '@/features/cart/api/queries';
import { useAuth } from '@/features/auth/api/queries';
import { useCheckoutQuote } from './api/queries';
import { CheckoutSteps } from './components/CheckoutSteps';
import { AddressStep } from './components/AddressStep';
import { DeliveryStep } from './components/DeliveryStep';
import { OrderSummary } from './components/OrderSummary';
import { CouponInput } from './components/CouponInput';
import { formatCurrency } from '@/lib/format';

/**
 * Multi-step checkout.
 *
 * The split of responsibility on this page is the whole architecture in
 * miniature:
 *
 *   Redux         which step, which address highlighted, which delivery speed —
 *                 in-progress choices the server has no opinion about.
 *   TanStack Query the cart, the saved addresses, and the *price* of those
 *                 choices. Every figure on screen comes from `/checkout/quote`.
 *
 * Nothing about money is computed in this file.
 */
export default function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, isResolving } = useAuth();
  const checkout = useAppSelector(selectCheckout);

  const { data: cart, isPending: isCartPending } = useCart();

  const quote = useCheckoutQuote({
    addressId: checkout.addressId,
    deliveryMethod: checkout.deliveryMethod,
    // Pointless to price an empty bag, and the endpoint rejects it anyway.
    enabled: Boolean(cart && cart.items.length > 0),
  });

  // Contact is settled the moment we know who is signed in, so a returning
  // customer is not made to click through a step that asks them nothing.
  useEffect(() => {
    if (user && !checkout.completed.includes('contact')) {
      dispatch(completeStep('contact'));
    }
  }, [user, checkout.completed, dispatch]);

  // Leaving checkout abandons the wizard; coming back should start clean rather
  // than resuming a half-finished flow against a cart that may have changed.
  useEffect(() => () => void dispatch(resetCheckout()), [dispatch]);

  if (isResolving || isCartPending) return <PageLoader />;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Seo title="Checkout" noIndex />
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Add something to your bag before checking out."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const blockingIssues = (quote.data?.issues ?? []).filter(
    (issue) => issue.type !== 'price_changed',
  );
  const priceChanges = (quote.data?.issues ?? []).filter((issue) => issue.type === 'price_changed');

  return (
    <>
      <Seo title="Checkout" noIndex />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/cart">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to bag
            </Link>
          </Button>
        </div>

        <CheckoutSteps
          current={checkout.step}
          completed={checkout.completed}
          onSelect={(step) => dispatch(goToStep(step))}
        />

        <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            {/* Anything that would stop the order is shown at the top of the
                flow, not discovered at the final step. */}
            {blockingIssues.length > 0 && (
              <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <AlertDescription>
                  <p className="font-medium">Your bag needs attention</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm">
                    {blockingIssues.map((issue) => (
                      <li key={`${issue.itemId}-${issue.type}`}>{issue.message}</li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/cart">Edit your bag</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {priceChanges.length > 0 && (
              <Alert className="mb-6">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <AlertDescription>
                  <p className="font-medium">Some prices have changed</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm">
                    {priceChanges.map((issue) => (
                      <li key={issue.itemId}>{issue.message}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs">The total below reflects the current prices.</p>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardContent className="pt-6">
                {checkout.step === 'contact' && (
                  <ContactStep
                    email={user?.email}
                    onContinue={() => dispatch(completeStep('contact'))}
                    onSignIn={() => navigate('/login?next=%2Fcheckout')}
                  />
                )}

                {checkout.step === 'address' && (
                  <>
                    <h2 className="mb-4 text-base font-semibold">Where should we deliver?</h2>
                    <AddressStep
                      selectedId={checkout.addressId}
                      onSelect={(id) => dispatch(selectAddress(id))}
                      onContinue={() => dispatch(completeStep('address'))}
                    />
                  </>
                )}

                {checkout.step === 'delivery' && (
                  <>
                    <h2 className="mb-4 text-base font-semibold">How fast do you need it?</h2>
                    <DeliveryStep
                      selected={checkout.deliveryMethod}
                      quote={quote.data}
                      onSelect={(method) => dispatch(chooseDeliveryMethod(method))}
                      onContinue={() => dispatch(completeStep('delivery'))}
                    />
                  </>
                )}

                {checkout.step === 'review' && (
                  <ReviewStep
                    quote={quote.data}
                    canPlaceOrder={quote.data?.canPlaceOrder ?? false}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <Card className="lg:sticky lg:top-40">
            <CardContent className="pt-6">
              <h2 className="mb-4 text-base font-semibold">Order summary</h2>

              {quote.isError ? (
                <ErrorState error={quote.error} onRetry={() => void quote.refetch()} />
              ) : (
                <>
                  <ul className="mb-4 space-y-3">
                    {cart.items.slice(0, 4).map((line) => (
                      <li key={line.itemId} className="flex gap-3">
                        <img
                          src={line.product.thumbnail}
                          alt=""
                          className="bg-muted size-12 shrink-0 rounded-md object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm">{line.product.name}</p>
                          <p className="text-muted-foreground text-xs tabular">
                            Qty {line.quantity} · {formatCurrency(line.lineTotal)}
                          </p>
                        </div>
                      </li>
                    ))}
                    {cart.items.length > 4 && (
                      <li className="text-muted-foreground text-xs">
                        and {cart.items.length - 4} more item
                        {cart.items.length - 4 === 1 ? '' : 's'}
                      </li>
                    )}
                  </ul>

                  <Separator className="mb-4" />

                  <div className="mb-4">
                    <CouponInput coupon={quote.data?.coupon} />
                  </div>

                  <OrderSummary
                    pricing={quote.data?.pricing}
                    itemCount={quote.data?.itemCount}
                    isLoading={quote.isPending}
                    isRefreshing={quote.isFetching && !quote.isPending}
                  />

                  <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-xs">
                    <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    Totals are calculated on our servers and verified again before payment.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ContactStep({
  email,
  onContinue,
  onSignIn,
}: {
  email?: string;
  onContinue: () => void;
  onSignIn: () => void;
}) {
  if (email) {
    return (
      <>
        <h2 className="mb-2 text-base font-semibold">Contact</h2>
        <p className="text-muted-foreground text-sm">
          We&rsquo;ll send order updates to <strong className="text-foreground">{email}</strong>.
        </p>
        <Button type="button" onClick={onContinue} className="mt-5">
          Continue
        </Button>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-2 text-base font-semibold">Sign in to continue</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        An account lets you track this order, save your address for next time, and review what you
        bought.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={onSignIn}>
          Sign in
        </Button>
        <Button asChild variant="outline">
          <Link to="/register?next=%2Fcheckout">Create an account</Link>
        </Button>
      </div>
    </>
  );
}

function ReviewStep({
  quote,
  canPlaceOrder,
}: {
  quote?: {
    shippingAddress?: {
      fullName: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      phone: string;
    };
  };
  canPlaceOrder: boolean;
}) {
  const address = quote?.shippingAddress;

  return (
    <>
      <h2 className="mb-4 text-base font-semibold">Review your order</h2>

      {address && (
        <div className="mb-5">
          <h3 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
            Delivering to
          </h3>
          <address className="text-sm leading-relaxed not-italic">
            <span className="font-medium">{address.fullName}</span>
            <br />
            {address.line1}
            {address.line2 && (
              <>
                <br />
                {address.line2}
              </>
            )}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            <span className="text-muted-foreground tabular">{address.phone}</span>
          </address>
        </div>
      )}

      <Separator className="my-5" />

      {/* Payment is wired in the next phase. The button is deliberately inert
          and says so, rather than pretending to take money. */}
      <Button type="button" size="lg" className="w-full" disabled>
        <Lock className="size-4" aria-hidden="true" />
        Continue to payment
      </Button>
      <p className="text-muted-foreground mt-2.5 text-center text-xs">
        {canPlaceOrder
          ? 'Payment and order placement arrive in the next phase.'
          : 'Resolve the issues above to continue.'}
      </p>
    </>
  );
}
