import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DeliveryMethod } from '@ecom/shared';

/**
 * Checkout wizard progress.
 *
 * A textbook case for Redux in this architecture: none of it is server state.
 * Which step the customer is on, which saved address they highlighted, and which
 * delivery speed they picked are *choices in progress* — the server has no
 * opinion about them until they are submitted, and it never sends them back.
 *
 * The amounts those choices produce are emphatically NOT here. Every total comes
 * from `POST /checkout/quote`, recomputed server-side, and is read through
 * TanStack Query. Caching a total in the store would be inventing a second
 * source of truth for money.
 */
export const CHECKOUT_STEPS = ['contact', 'address', 'delivery', 'review'] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export interface CheckoutState {
  step: CheckoutStep;
  /** Which saved address is selected; undefined means "use the default". */
  addressId?: string;
  deliveryMethod: DeliveryMethod;
  /** Email captured for a guest checkout. */
  guestEmail: string;
  /** Steps the customer has completed, so they can jump back but not ahead. */
  completed: CheckoutStep[];
}

const initialState: CheckoutState = {
  step: 'contact',
  deliveryMethod: 'standard',
  guestEmail: '',
  completed: [],
};

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    goToStep(state, action: PayloadAction<CheckoutStep>) {
      const target = action.payload;
      // Only allow moving to a step already completed, or the next one — so a
      // customer cannot skip past choosing an address by editing the URL.
      const furthest = state.completed.length;
      if (CHECKOUT_STEPS.indexOf(target) <= furthest) state.step = target;
    },

    completeStep(state, action: PayloadAction<CheckoutStep>) {
      if (!state.completed.includes(action.payload)) state.completed.push(action.payload);

      const nextIndex = CHECKOUT_STEPS.indexOf(action.payload) + 1;
      const next = CHECKOUT_STEPS[nextIndex];
      if (next) state.step = next;
    },

    selectAddress(state, action: PayloadAction<string | undefined>) {
      state.addressId = action.payload;
    },

    selectDeliveryMethod(state, action: PayloadAction<DeliveryMethod>) {
      state.deliveryMethod = action.payload;
    },

    setGuestEmail(state, action: PayloadAction<string>) {
      state.guestEmail = action.payload;
    },

    /** Called when checkout is left or an order is placed. */
    resetCheckout() {
      return initialState;
    },
  },
});

export const {
  goToStep,
  completeStep,
  selectAddress,
  selectDeliveryMethod,
  setGuestEmail,
  resetCheckout,
} = checkoutSlice.actions;

export const checkoutReducer = checkoutSlice.reducer;
