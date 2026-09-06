import type { Request, RequestHandler } from 'express';
import type { AddCartItemInput, UpdateCartItemInput } from '@ecom/shared';
import * as cartService from '../services/cart.service.js';
import { validatedBody, validatedParams } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';

/** Resolve whose cart this is — signed-in user or cookie-identified guest. */
function owner(req: Request): cartService.CartOwner {
  if (req.user) return { userId: req.user.id };
  if (req.guestId) return { guestId: req.guestId };
  throw AppError.badRequest('No cart session');
}

export const getCart: RequestHandler = async (req, res) => {
  // A visitor with no cookie yet has an empty cart; issuing one on a read would
  // create a row for every crawler that touches the endpoint.
  if (!req.user && !req.guestId) {
    return sendSuccess(res, {
      cart: { id: null, items: [], itemCount: 0, subtotal: 0, currency: 'INR', hasIssues: false },
    });
  }

  sendSuccess(res, { cart: await cartService.getCart(owner(req)) });
};

export const addItem: RequestHandler = async (req, res) => {
  const input = validatedBody<AddCartItemInput>(req);
  const cart = await cartService.addItem(owner(req), input);

  sendSuccess(res, { cart }, { message: 'Added to your bag' });
};

export const updateItem: RequestHandler = async (req, res) => {
  const { itemId } = validatedParams<{ itemId: string }>(req);
  const { quantity } = validatedBody<UpdateCartItemInput>(req);
  const cart = await cartService.updateItemQuantity(owner(req), itemId, quantity);

  sendSuccess(res, { cart });
};

export const removeItem: RequestHandler = async (req, res) => {
  const { itemId } = validatedParams<{ itemId: string }>(req);
  const cart = await cartService.removeItem(owner(req), itemId);

  sendSuccess(res, { cart }, { message: 'Removed from your bag' });
};

export const clearCart: RequestHandler = async (req, res) => {
  sendSuccess(res, { cart: await cartService.clearCart(owner(req)) });
};
