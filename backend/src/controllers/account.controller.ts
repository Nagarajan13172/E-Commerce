import type { RequestHandler } from 'express';
import type { AddressInput, UpdateAddressInput, WishlistItemInput } from '@ecom/shared';
import * as accountService from '../services/account.service.js';
import { validatedBody, validatedParams } from '../middleware/validate.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

/**
 * Customer account endpoints.
 *
 * Every handler scopes to `req.user.id` and never accepts a user id from the
 * request. That is what prevents an IDOR — without it, `PATCH /addresses/:id`
 * would happily edit another customer's address given its id.
 */

export const listAddresses: RequestHandler = async (req, res) => {
  sendSuccess(res, { addresses: await accountService.listAddresses(req.user!.id) });
};

export const addAddress: RequestHandler = async (req, res) => {
  const addresses = await accountService.addAddress(req.user!.id, validatedBody<AddressInput>(req));
  sendCreated(res, { addresses }, 'Address saved');
};

export const updateAddress: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const addresses = await accountService.updateAddress(
    req.user!.id,
    id,
    validatedBody<UpdateAddressInput>(req),
  );
  sendSuccess(res, { addresses }, { message: 'Address updated' });
};

export const deleteAddress: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  sendSuccess(res, { addresses: await accountService.deleteAddress(req.user!.id, id) });
};

export const setDefaultAddress: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const kind = req.query.kind === 'billing' ? 'billing' : 'shipping';
  const addresses = await accountService.setDefaultAddress(req.user!.id, id, kind);

  sendSuccess(res, { addresses }, { message: `Default ${kind} address updated` });
};

export const getWishlist: RequestHandler = async (req, res) => {
  sendSuccess(res, { items: await accountService.getWishlist(req.user!.id) });
};

export const getWishlistIds: RequestHandler = async (req, res) => {
  sendSuccess(res, { productIds: await accountService.getWishlistProductIds(req.user!.id) });
};

export const addToWishlist: RequestHandler = async (req, res) => {
  const { productId, variantId } = validatedBody<WishlistItemInput>(req);
  const items = await accountService.addToWishlist(req.user!.id, productId, variantId);

  sendSuccess(res, { items }, { message: 'Saved to your wishlist' });
};

export const removeFromWishlist: RequestHandler = async (req, res) => {
  const { productId } = validatedParams<{ productId: string }>(req);
  const items = await accountService.removeFromWishlist(req.user!.id, productId);

  sendSuccess(res, { items }, { message: 'Removed from your wishlist' });
};
