import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { CART_LIMITS, ERROR_CODES, type AddCartItemInput } from '@ecom/shared';
import { Cart, type CartDocument } from '../models/cart.model.js';
import { Product, type IProductVariant } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('cart');

/**
 * Cart.
 *
 * The single rule that shapes this whole file: **prices are never read from the
 * request and never trusted from storage.** Every read re-prices each line from
 * the live product document. The stored `priceSnapshot` exists only to detect
 * that a price moved since the item was added, so the UI can say so.
 *
 * The same applies to stock. A cart is not a reservation — stock is only held
 * at checkout — so a line that was available yesterday may not be today, and the
 * cart has to say that plainly rather than letting checkout fail mysteriously.
 */

export interface CartLine {
  itemId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string;
    thumbnail?: string;
    brandName?: string;
  };
  variant?: { id: string; sku: string; optionValues: { name: string; value: string }[] };
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  lineTotal: number;
  /** Units that can actually be bought right now. */
  availableStock: number;
  /** Set when the live price differs from the snapshot taken at add-to-cart. */
  priceChanged?: { from: number; to: number };
  /** Set when the line cannot be fulfilled as it stands. */
  issue?: 'out_of_stock' | 'insufficient_stock' | 'unavailable';
}

export interface CartView {
  id: string | null;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  currency: string;
  /** True when any line needs the customer's attention before checkout. */
  hasIssues: boolean;
}

const EMPTY_CART: CartView = {
  id: null,
  items: [],
  itemCount: 0,
  subtotal: 0,
  currency: 'INR',
  hasIssues: false,
};

export interface CartOwner {
  userId?: string;
  guestId?: string;
}

function ownerFilter(owner: CartOwner) {
  if (owner.userId) return { user: owner.userId };
  if (owner.guestId) return { guestId: owner.guestId };
  throw AppError.badRequest('No cart identity');
}

/** A signed-in cart never expires; a guest cart is swept after 30 days. */
function guestExpiry(): Date {
  return new Date(Date.now() + CART_LIMITS.GUEST_CART_TTL_DAYS * 86_400_000);
}

export function newGuestId(): string {
  return randomUUID();
}

async function findOrCreateCart(owner: CartOwner): Promise<CartDocument> {
  const filter = ownerFilter(owner);
  const existing = await Cart.findOne(filter);
  if (existing) return existing;

  return Cart.create({
    ...filter,
    items: [],
    currency: 'INR',
    ...(owner.guestId ? { expiresAt: guestExpiry() } : {}),
  });
}

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * Build the customer-facing cart.
 *
 * One query loads every referenced product, then lines are priced in memory —
 * so a ten-item cart costs one round trip rather than ten (the N+1 this would
 * otherwise be).
 */
export async function getCart(owner: CartOwner): Promise<CartView> {
  const cart = await Cart.findOne(ownerFilter(owner));
  if (!cart || cart.items.length === 0)
    return { ...EMPTY_CART, id: cart ? String(cart._id) : null };

  const productIds = cart.items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select(
      'name slug sku thumbnail price compareAtPrice variants status deletedAt brand totalStock',
    )
    .populate('brand', 'name')
    .lean();

  const productById = new Map(products.map((p) => [String(p._id), p]));

  const lines: CartLine[] = [];
  let subtotal = 0;
  let hasIssues = false;

  for (const item of cart.items) {
    const product = productById.get(String(item.product));

    // The product was archived or deleted after it was added.
    if (!product || product.status !== 'active' || product.deletedAt) {
      hasIssues = true;
      lines.push({
        itemId: String(item._id),
        product: {
          id: String(item.product),
          name: product?.name ?? 'Unavailable product',
          slug: product?.slug ?? '',
          sku: product?.sku ?? '',
          thumbnail: product?.thumbnail,
        },
        quantity: item.quantity,
        unitPrice: item.priceSnapshot,
        lineTotal: 0,
        availableStock: 0,
        issue: 'unavailable',
      });
      continue;
    }

    const variant = item.variantId
      ? (product.variants as IProductVariant[]).find(
          (v) => String(v._id) === String(item.variantId),
        )
      : undefined;

    // The variant was removed or deactivated since it was added.
    if (item.variantId && (!variant || !variant.isActive)) {
      hasIssues = true;
      lines.push({
        itemId: String(item._id),
        product: {
          id: String(product._id),
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          thumbnail: product.thumbnail,
        },
        quantity: item.quantity,
        unitPrice: item.priceSnapshot,
        lineTotal: 0,
        availableStock: 0,
        issue: 'unavailable',
      });
      continue;
    }

    // Live price wins, always.
    const unitPrice = variant?.price ?? product.price;
    const compareAtPrice = variant?.compareAtPrice ?? product.compareAtPrice;
    const availableStock = variant ? variant.stock.available : (product.totalStock ?? 0);

    const line: CartLine = {
      itemId: String(item._id),
      product: {
        id: String(product._id),
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        thumbnail: product.thumbnail,
        brandName: (product.brand as unknown as { name?: string })?.name,
      },
      ...(variant
        ? {
            variant: {
              id: String(variant._id),
              sku: variant.sku,
              optionValues: variant.optionValues,
            },
          }
        : {}),
      quantity: item.quantity,
      unitPrice,
      compareAtPrice,
      lineTotal: unitPrice * item.quantity,
      availableStock,
    };

    if (unitPrice !== item.priceSnapshot) {
      line.priceChanged = { from: item.priceSnapshot, to: unitPrice };
    }

    if (availableStock === 0) {
      line.issue = 'out_of_stock';
      line.lineTotal = 0;
      hasIssues = true;
    } else if (availableStock < item.quantity) {
      line.issue = 'insufficient_stock';
      hasIssues = true;
    }

    subtotal += line.lineTotal;
    lines.push(line);
  }

  return {
    id: String(cart._id),
    items: lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: Math.round(subtotal * 100) / 100,
    currency: cart.currency,
    hasIssues,
  };
}

// ── Write ───────────────────────────────────────────────────────────────────

export async function addItem(owner: CartOwner, input: AddCartItemInput): Promise<CartView> {
  const product = await Product.findOne({
    _id: input.productId,
    status: 'active' as const,
    deletedAt: { $exists: false },
  }).select('price variants totalStock');

  if (!product) {
    throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);
  }

  const variant = input.variantId
    ? product.variants.find((v) => String(v._id) === input.variantId)
    : undefined;

  if (input.variantId && (!variant || !variant.isActive)) {
    throw AppError.notFound('Variant', ERROR_CODES.VARIANT_NOT_FOUND);
  }

  // A product with variants must be added as a specific variant, or the cart
  // would hold a line that no inventory row corresponds to.
  if (!input.variantId && product.variants.length > 0) {
    throw AppError.badRequest('Choose an option before adding this to your bag');
  }

  const availableStock = variant ? variant.stock.available : (product.totalStock ?? 0);
  if (availableStock === 0) {
    throw AppError.unprocessable('This item is out of stock', ERROR_CODES.INSUFFICIENT_STOCK);
  }

  const cart = await findOrCreateCart(owner);

  const existingLine = cart.items.find(
    (item) =>
      String(item.product) === input.productId &&
      String(item.variantId ?? '') === (input.variantId ?? ''),
  );

  const desiredQuantity = (existingLine?.quantity ?? 0) + input.quantity;

  // Checked against live stock, not the requested amount, so a customer cannot
  // stack repeated adds past what exists.
  if (desiredQuantity > availableStock) {
    throw AppError.unprocessable(
      availableStock === (existingLine?.quantity ?? 0)
        ? 'You already have all available stock in your bag'
        : `Only ${availableStock} left in stock`,
      ERROR_CODES.INSUFFICIENT_STOCK,
      { available: availableStock },
    );
  }

  if (desiredQuantity > CART_LIMITS.MAX_QUANTITY_PER_ITEM) {
    throw AppError.unprocessable(
      `Limit ${CART_LIMITS.MAX_QUANTITY_PER_ITEM} per item`,
      ERROR_CODES.INVALID_INPUT,
    );
  }

  if (existingLine) {
    existingLine.quantity = desiredQuantity;
  } else {
    if (cart.items.length >= CART_LIMITS.MAX_ITEMS) {
      throw AppError.unprocessable(
        `A bag can hold at most ${CART_LIMITS.MAX_ITEMS} different items`,
        ERROR_CODES.INVALID_INPUT,
      );
    }
    cart.items.push({
      product: product._id,
      variantId: variant?._id,
      quantity: input.quantity,
      // Snapshot for change detection only — never used to charge.
      priceSnapshot: variant?.price ?? product.price,
      addedAt: new Date(),
    } as never);
  }

  if (owner.guestId) cart.expiresAt = guestExpiry();
  await cart.save();

  return getCart(owner);
}

export async function updateItemQuantity(
  owner: CartOwner,
  itemId: string,
  quantity: number,
): Promise<CartView> {
  const cart = await Cart.findOne(ownerFilter(owner));
  if (!cart) throw AppError.notFound('Cart');

  const item = cart.items.id(itemId);
  if (!item) throw AppError.notFound('Cart item');

  // Zero means remove, so a quantity stepper can reach empty naturally.
  if (quantity === 0) {
    cart.items.pull({ _id: itemId });
    await cart.save();
    return getCart(owner);
  }

  const product = await Product.findById(item.product).select('variants totalStock');
  const variant = item.variantId
    ? product?.variants.find((v) => String(v._id) === String(item.variantId))
    : undefined;
  const availableStock = variant ? variant.stock.available : (product?.totalStock ?? 0);

  if (quantity > availableStock) {
    throw AppError.unprocessable(
      `Only ${availableStock} left in stock`,
      ERROR_CODES.INSUFFICIENT_STOCK,
      {
        available: availableStock,
      },
    );
  }

  item.quantity = quantity;
  await cart.save();

  return getCart(owner);
}

export async function removeItem(owner: CartOwner, itemId: string): Promise<CartView> {
  const cart = await Cart.findOne(ownerFilter(owner));
  if (!cart) throw AppError.notFound('Cart');

  cart.items.pull({ _id: itemId });
  await cart.save();

  return getCart(owner);
}

export async function clearCart(owner: CartOwner): Promise<CartView> {
  await Cart.updateOne(ownerFilter(owner), { $set: { items: [], couponCode: undefined } });
  return getCart(owner);
}

/**
 * Merge a guest cart into the signed-in cart on login.
 *
 * Quantities are summed rather than replaced — someone who added two of
 * something while logged out and already had one should end with three, not
 * lose either. The sum is capped at live stock so the merge cannot produce a
 * line that could never be bought.
 */
export async function mergeGuestCart(userId: string, guestId: string): Promise<void> {
  const guestCart = await Cart.findOne({ guestId });
  if (!guestCart || guestCart.items.length === 0) {
    await guestCart?.deleteOne();
    return;
  }

  const userCart = await findOrCreateCart({ userId });

  const products = await Product.find({ _id: { $in: guestCart.items.map((i) => i.product) } })
    .select('variants totalStock')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  for (const guestItem of guestCart.items) {
    const existing = userCart.items.find(
      (item) =>
        String(item.product) === String(guestItem.product) &&
        String(item.variantId ?? '') === String(guestItem.variantId ?? ''),
    );

    const product = productById.get(String(guestItem.product));
    const variant = guestItem.variantId
      ? (product?.variants as IProductVariant[] | undefined)?.find(
          (v) => String(v._id) === String(guestItem.variantId),
        )
      : undefined;
    const availableStock = variant ? variant.stock.available : (product?.totalStock ?? 0);

    if (availableStock === 0) continue;

    if (existing) {
      existing.quantity = Math.min(
        existing.quantity + guestItem.quantity,
        availableStock,
        CART_LIMITS.MAX_QUANTITY_PER_ITEM,
      );
    } else if (userCart.items.length < CART_LIMITS.MAX_ITEMS) {
      userCart.items.push({
        product: guestItem.product,
        variantId: guestItem.variantId,
        quantity: Math.min(guestItem.quantity, availableStock, CART_LIMITS.MAX_QUANTITY_PER_ITEM),
        priceSnapshot: guestItem.priceSnapshot,
        addedAt: guestItem.addedAt,
      } as never);
    }
  }

  // The signed-in cart persists indefinitely, so the guest TTL is dropped.
  userCart.expiresAt = undefined;
  await userCart.save();
  await guestCart.deleteOne();

  log.debug({ userId, guestId }, 'Merged guest cart into user cart');
}

export type { Types };
