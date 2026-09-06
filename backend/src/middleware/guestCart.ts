import type { RequestHandler } from 'express';
import { GUEST_CART_COOKIE, setGuestCartCookie } from '../utils/cookies.js';
import { newGuestId } from '../services/cart.service.js';

/**
 * Give anonymous shoppers a stable cart identity.
 *
 * Guests must be able to fill a bag before signing in — forcing an account
 * first is the single largest source of abandonment in e-commerce. The id is a
 * random UUID in an httpOnly cookie, so it is not readable or forgeable by page
 * scripts, and it identifies nothing about the person.
 *
 * A cookie is only issued when a guest actually needs one, so a crawler hitting
 * product pages does not create a cart row per request.
 */
export const attachGuestCart =
  (options: { create?: boolean } = {}): RequestHandler =>
  (req, res, next) => {
    // A signed-in shopper uses their own cart; a guest id would be ambiguous.
    if (req.user) return next();

    const existing = req.cookies?.[GUEST_CART_COOKIE] as string | undefined;
    if (existing) {
      req.guestId = existing;
      return next();
    }

    if (options.create) {
      const guestId = newGuestId();
      setGuestCartCookie(res, guestId);
      req.guestId = guestId;
    }

    next();
  };
