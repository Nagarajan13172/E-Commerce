import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  USER_ROLES,
  USER_STATUSES,
  ADDRESS_LABELS,
  type UserRole,
  type UserStatus,
} from '@ecom/shared';

export interface IAddress {
  _id: Types.ObjectId;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export interface IWishlistEntry {
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  addedAt: Date;
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  addresses: Types.DocumentArray<IAddress>;
  wishlist: IWishlistEntry[];

  emailVerifiedAt?: Date;
  lastLoginAt?: Date;
  marketingOptIn: boolean;

  /**
   * Bumped to invalidate every outstanding access token for this user at once.
   * Access tokens are stateless JWTs, so there is otherwise no way to revoke one
   * before it expires; embedding this counter as a claim and comparing on each
   * request gives instant revocation on password change, role change or ban.
   */
  tokenVersion: number;

  failedLoginAttempts: number;
  lockedUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  isLocked(): boolean;
  defaultShippingAddress(): IAddress | undefined;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModelType = Model<IUser, Record<string, never>, IUserMethods>;

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String, enum: ADDRESS_LABELS, default: 'home' },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    landmark: { type: String, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true, maxlength: 60 },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    isDefaultShipping: { type: Boolean, default: false },
    isDefaultBilling: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

const userSchema = new Schema<IUser, UserModelType, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // `select: false` means every query omits the hash unless it is explicitly
    // asked for. A stray `res.json(user)` therefore cannot leak it.
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    avatarUrl: { type: String },

    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },

    addresses: { type: [addressSchema], default: [] },
    wishlist: {
      type: [
        {
          _id: false,
          product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: Schema.Types.ObjectId },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    marketingOptIn: { type: Boolean, default: false },

    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        // Defence in depth: even if a query explicitly selected these, they must
        // never reach a response body.
        const plain = ret as Record<string, unknown>;
        delete plain.passwordHash;
        delete plain.tokenVersion;
        delete plain.failedLoginAttempts;
        delete plain.lockedUntil;
        delete plain.__v;
        return plain;
      },
    },
  },
);

// Admin customer search: name/email prefix lookups.
userSchema.index({ name: 'text', email: 'text' });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, role: 1, createdAt: -1 });

userSchema.methods.isLocked = function isLocked(this: UserDocument): boolean {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

userSchema.methods.defaultShippingAddress = function defaultShippingAddress(
  this: UserDocument,
): IAddress | undefined {
  return this.addresses.find((a) => a.isDefaultShipping) ?? this.addresses[0];
};

/**
 * Exactly one address may be the default for each purpose. Enforcing it here
 * rather than in the service means it holds no matter which code path writes.
 */
userSchema.pre('save', function normaliseDefaultAddresses() {
  if (this.isModified('addresses') && this.addresses.length > 0) {
    for (const field of ['isDefaultShipping', 'isDefaultBilling'] as const) {
      const flagged = this.addresses.filter((a) => a[field]);
      if (flagged.length > 1) {
        // The most recently flagged wins; clear the rest.
        flagged.slice(0, -1).forEach((a) => {
          a[field] = false;
        });
      } else if (flagged.length === 0) {
        this.addresses[0]![field] = true;
      }
    }
  }
});

export const User = model<IUser, UserModelType>('User', userSchema);
