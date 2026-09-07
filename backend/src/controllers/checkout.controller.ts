import type { Request, RequestHandler } from 'express';
import type { ApplyCouponInput, CheckoutQuoteInput } from '@ecom/shared';
import * as checkoutService from '../services/checkout.service.js';
import * as cartService from '../services/cart.service.js';
import { listPublicCoupons } from '../services/coupon.service.js';
import { validatedBody } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

function owner(req: Request): cartService.CartOwner {
  if (req.user) return { userId: req.user.id };
  if (req.guestId) return { guestId: req.guestId };
  throw AppError.badRequest('No cart session');
}

/**
 * Server-priced quote for the current cart.
 *
 * POST rather than GET because the choices that affect the price (address,
 * delivery speed) are a body, and because a quote must never be cached — it
 * reflects live stock and live prices.
 */
export const quote: RequestHandler = async (req, res) => {
  const input = validatedBody<CheckoutQuoteInput>(req);
  sendSuccess(res, { quote: await checkoutService.quote(owner(req), input) });
};

export const applyCoupon: RequestHandler = async (req, res) => {
  const { code } = validatedBody<ApplyCouponInput>(req);
  const cart = await cartService.applyCoupon(owner(req), code);

  sendSuccess(res, { cart }, { message: `Coupon ${code} applied` });
};

export const removeCoupon: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    { cart: await cartService.removeCoupon(owner(req)) },
    { message: 'Coupon removed' },
  );
};

/** Publicly advertised offers. Customer-specific coupons are never listed. */
export const listOffers: RequestHandler = async (_req, res) => {
  sendSuccess(res, { items: await listPublicCoupons() });
};
