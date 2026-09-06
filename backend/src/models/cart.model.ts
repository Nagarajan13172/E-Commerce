import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { CART_LIMITS } from '@ecom/shared';

/**
 * Server-owned cart, for both signed-in users and guests.
 *
 * The cart lives on the server, not in the browser, because a client-side cart
 * drifts: prices change, stock runs out, and the user opens a second tab. The
 * server is the only place that can answer "what is actually in this cart, at
 * what price, and can it still be bought".
 *
 * `priceSnapshot` is stored for *change detection only* — never for charging.
 * Reading a cart re-prices every line from the live product, compares against
 * the snapshot, and surfaces "the price of this item changed" in the UI. The
 * amount charged always comes from the product document at checkout time.
 */
export interface ICartItem {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  quantity: number;
  /** What the price was when the item was added. Display/diff only. */
  priceSnapshot: number;
  addedAt: Date;
}

export interface ICart {
  _id: Types.ObjectId;
  /** Set for a signed-in shopper. Mutually exclusive with `guestId`. */
  user?: Types.ObjectId;
  /** Random id held in a signed httpOnly cookie for anonymous shoppers. */
  guestId?: string;
  items: Types.DocumentArray<ICartItem>;
  couponCode?: string;
  currency: string;
  /** Guest carts expire; a signed-in cart persists indefinitely. */
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CartDocument = HydratedDocument<ICart>;

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: CART_LIMITS.MAX_QUANTITY_PER_ITEM,
    },
    priceSnapshot: { type: Number, required: true, min: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const cartSchema = new Schema<ICart, Model<ICart>>(
  {
    // Sparse unique: exactly one cart per user, and one per guest id, while
    // allowing the other field to be absent on every document.
    user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    guestId: { type: String, unique: true, sparse: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, uppercase: true, trim: true },
    currency: { type: String, default: 'INR' },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

// TTL sweep for abandoned guest carts. Signed-in carts leave `expiresAt` unset,
// and a TTL index ignores documents where the field is missing — so they persist.
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Cart = model<ICart>('Cart', cartSchema);
