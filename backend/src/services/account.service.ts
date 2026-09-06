import type { AddressInput, UpdateAddressInput } from '@ecom/shared';
import { ERROR_CODES } from '@ecom/shared';
import { User, type IAddress } from '../models/user.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';

/**
 * Customer account data: addresses and wishlist.
 *
 * Both live as subdocuments on the user rather than in their own collections.
 * They are small, bounded, always read together with the user, and never queried
 * independently — so embedding avoids a join for no cost. A wishlist that grew
 * into the thousands would argue for splitting it out; a shopping wishlist does
 * not.
 */

const MAX_ADDRESSES = 10;
const MAX_WISHLIST = 200;

// ── Addresses ───────────────────────────────────────────────────────────────

export async function listAddresses(userId: string): Promise<IAddress[]> {
  const user = await User.findById(userId).select('addresses').lean();
  if (!user) throw AppError.notFound('Account');
  return user.addresses;
}

export async function addAddress(userId: string, input: AddressInput): Promise<IAddress[]> {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw AppError.notFound('Account');

  if (user.addresses.length >= MAX_ADDRESSES) {
    throw AppError.unprocessable(
      `You can save at most ${MAX_ADDRESSES} addresses`,
      ERROR_CODES.INVALID_INPUT,
    );
  }

  // The first address saved becomes the default whether or not it was asked
  // for — otherwise checkout would have nothing preselected.
  const isFirst = user.addresses.length === 0;
  user.addresses.push({
    ...input,
    isDefaultShipping: isFirst || input.isDefaultShipping,
    isDefaultBilling: isFirst || input.isDefaultBilling,
  } as never);

  // The model's pre-save hook guarantees exactly one default of each kind.
  await user.save();
  return user.addresses;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<IAddress[]> {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw AppError.notFound('Account');

  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address');

  Object.assign(address, input);
  await user.save();
  return user.addresses;
}

export async function deleteAddress(userId: string, addressId: string): Promise<IAddress[]> {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw AppError.notFound('Account');

  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address');

  const wasDefaultShipping = address.isDefaultShipping;
  const wasDefaultBilling = address.isDefaultBilling;

  user.addresses.pull({ _id: addressId });

  // Promote a replacement rather than leaving the account with no default,
  // which would silently break the checkout preselection.
  if (user.addresses.length > 0) {
    if (wasDefaultShipping) user.addresses[0]!.isDefaultShipping = true;
    if (wasDefaultBilling) user.addresses[0]!.isDefaultBilling = true;
  }

  await user.save();
  return user.addresses;
}

export async function setDefaultAddress(
  userId: string,
  addressId: string,
  kind: 'shipping' | 'billing',
): Promise<IAddress[]> {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw AppError.notFound('Account');

  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address');

  const field = kind === 'shipping' ? 'isDefaultShipping' : 'isDefaultBilling';
  for (const candidate of user.addresses) candidate[field] = false;
  address[field] = true;

  await user.save();
  return user.addresses;
}

// ── Wishlist ────────────────────────────────────────────────────────────────

/**
 * The wishlist, hydrated with live product data.
 *
 * Prices and availability come from the products, not from what was stored when
 * the item was saved — a wishlist showing a stale price is worse than useless,
 * since its entire purpose is deciding whether to buy later.
 */
export async function getWishlist(userId: string) {
  const user = await User.findById(userId).select('wishlist').lean();
  if (!user) throw AppError.notFound('Account');
  if (user.wishlist.length === 0) return [];

  const products = await Product.find({
    _id: { $in: user.wishlist.map((w) => w.product) },
    status: 'active' as const,
    deletedAt: { $exists: false },
  })
    .select(
      'name slug sku thumbnail images price compareAtPrice priceRange discountPercent rating inStock totalStock variantCount brand',
    )
    .populate('brand', 'name slug')
    .lean();

  const productById = new Map(products.map((p) => [String(p._id), p]));

  // Preserve the order the customer added them in (newest first), and silently
  // drop products that have since been removed from the catalog.
  return user.wishlist
    .slice()
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
    .map((entry) => {
      const product = productById.get(String(entry.product));
      return product ? { ...product, addedAt: entry.addedAt } : null;
    })
    .filter(Boolean);
}

export async function addToWishlist(userId: string, productId: string, variantId?: string) {
  const exists = await Product.exists({
    _id: productId,
    status: 'active' as const,
    deletedAt: { $exists: false },
  });
  if (!exists) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

  const user = await User.findById(userId).select('wishlist');
  if (!user) throw AppError.notFound('Account');

  const already = user.wishlist.some((w) => String(w.product) === productId);
  // Adding twice is a no-op rather than an error: a double-tapped heart should
  // not produce a red toast.
  if (already) return getWishlist(userId);

  if (user.wishlist.length >= MAX_WISHLIST) {
    throw AppError.unprocessable(
      `Your wishlist can hold at most ${MAX_WISHLIST} items`,
      ERROR_CODES.INVALID_INPUT,
    );
  }

  user.wishlist.push({
    product: productId as never,
    variantId: variantId as never,
    addedAt: new Date(),
  });
  await user.save();

  return getWishlist(userId);
}

export async function removeFromWishlist(userId: string, productId: string) {
  await User.updateOne({ _id: userId }, { $pull: { wishlist: { product: productId } } });
  return getWishlist(userId);
}

/** Ids only — used by listing pages to render the heart state without a join. */
export async function getWishlistProductIds(userId: string): Promise<string[]> {
  const user = await User.findById(userId).select('wishlist').lean();
  return (user?.wishlist ?? []).map((w) => String(w.product));
}
