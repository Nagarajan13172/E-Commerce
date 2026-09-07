import { Link } from 'react-router';
import { AlertTriangle, Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/common/EmptyState';
import { Price } from '@/components/common/Price';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCartDrawerOpen } from '@/store/selectors';
import { setCartDrawerOpen } from '@/store/slices/uiSlice';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '../api/queries';
import { formatCurrency } from '@/lib/format';
import type { CartLine } from '@/types/cart';

/**
 * The bag, as a slide-over.
 *
 * Opening a drawer instead of navigating keeps someone in the flow of browsing
 * after adding an item — leaving the listing page to check the bag is the single
 * most common way a shopper loses their place and does not come back.
 */
export function CartDrawer() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCartDrawerOpen);
  const { data: cart, isPending } = useCart();

  const close = () => dispatch(setCartDrawerOpen(false));

  return (
    <Sheet open={isOpen} onOpenChange={(open) => dispatch(setCartDrawerOpen(open))}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Your bag</SheetTitle>
          <SheetDescription className="sr-only">
            Items you have added, with quantity controls and the running subtotal.
          </SheetDescription>
        </SheetHeader>

        {isPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading your bag</span>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Your bag is empty"
            description="Items you add will appear here."
            action={
              <Button asChild onClick={close}>
                <Link to="/products">Start shopping</Link>
              </Button>
            }
            className="flex-1"
          />
        ) : (
          <>
            {cart.hasIssues && (
              <div className="bg-warning/10 text-warning-foreground border-warning/30 flex items-start gap-2 border-b px-5 py-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>Some items need your attention before checkout.</p>
              </div>
            )}

            <ul className="flex-1 divide-y overflow-y-auto">
              {cart.items.map((line) => (
                <CartDrawerLine key={line.itemId} line={line} onNavigate={close} />
              ))}
            </ul>

            <SheetFooter className="border-t px-5 py-4">
              {cart.coupon?.valid && cart.coupon.discount > 0 && (
                <div className="text-success mb-1.5 flex w-full items-center justify-between text-sm">
                  <span>Discount ({cart.coupon.code})</span>
                  <span className="tabular">
                    −{formatCurrency(cart.coupon.discount, cart.currency)}
                  </span>
                </div>
              )}
              <div className="mb-3 flex w-full items-center justify-between">
                <span className="text-sm font-medium">Subtotal</span>
                <span className="text-lg font-semibold tabular">
                  {formatCurrency(
                    Math.max(0, cart.subtotal - (cart.coupon?.valid ? cart.coupon.discount : 0)),
                    cart.currency,
                  )}
                </span>
              </div>
              <p className="text-muted-foreground mb-3 text-xs">
                Shipping and taxes are calculated at checkout.
              </p>
              <Button asChild className="w-full" size="lg" disabled={cart.hasIssues}>
                <Link to="/checkout" onClick={close}>
                  Checkout
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/cart" onClick={close}>
                  View bag
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartDrawerLine({ line, onNavigate }: { line: CartLine; onNavigate: () => void }) {
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const isUnavailable = line.issue === 'unavailable' || line.issue === 'out_of_stock';

  return (
    <li className="flex gap-3 p-4">
      <Link to={`/products/${line.product.slug}`} onClick={onNavigate} className="shrink-0">
        <img
          src={line.product.thumbnail}
          alt=""
          className="bg-muted size-20 rounded-md object-cover"
          loading="lazy"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to={`/products/${line.product.slug}`}
          onClick={onNavigate}
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {line.product.name}
        </Link>

        {line.variant && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {line.variant.optionValues.map((option) => option.value).join(' · ')}
          </p>
        )}

        {line.issue && (
          <p className="text-destructive mt-1 text-xs font-medium">
            {line.issue === 'out_of_stock' && 'Out of stock'}
            {line.issue === 'unavailable' && 'No longer available'}
            {line.issue === 'insufficient_stock' && `Only ${line.availableStock} left`}
          </p>
        )}

        {line.priceChanged && (
          <p className="text-warning-foreground mt-1 text-xs">
            Price changed to {formatCurrency(line.priceChanged.to)}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-md border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-r-none"
              disabled={updateItem.isPending || isUnavailable}
              onClick={() =>
                updateItem.mutate({ itemId: line.itemId, quantity: line.quantity - 1 })
              }
              aria-label={`Decrease quantity of ${line.product.name}`}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-8 text-center text-sm tabular" aria-live="polite">
              {line.quantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-l-none"
              disabled={
                updateItem.isPending || isUnavailable || line.quantity >= line.availableStock
              }
              onClick={() =>
                updateItem.mutate({ itemId: line.itemId, quantity: line.quantity + 1 })
              }
              aria-label={`Increase quantity of ${line.product.name}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Price amount={line.unitPrice} size="sm" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-7"
              disabled={removeItem.isPending}
              onClick={() => removeItem.mutate(line.itemId)}
              aria-label={`Remove ${line.product.name} from bag`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export { Separator };
