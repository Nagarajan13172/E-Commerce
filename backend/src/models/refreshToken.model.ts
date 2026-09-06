import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Refresh tokens, stored hashed, rotated on every use, with reuse detection.
 *
 * Why opaque tokens in a collection rather than a second JWT:
 * a JWT refresh token cannot be revoked before it expires. A stolen one stays
 * valid for its full lifetime — for a 30-day refresh token, that is a 30-day
 * account compromise with no way to intervene. Storing them lets us revoke
 * instantly and, more importantly, *detect theft*.
 *
 * How detection works: tokens form a `family` seeded at login. Each refresh
 * revokes the presented token and issues a successor. If a token that was
 * already rotated is presented again, either the legitimate client replayed it
 * or an attacker is using a stolen copy — and we cannot tell which. The safe
 * response is to revoke the entire family, forcing a fresh login.
 */
export interface IRefreshToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** SHA-256 of the token. The plaintext is never stored. */
  tokenHash: string;
  /** Shared by every token descended from one login. */
  family: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** Set when this token was rotated, so a replay is distinguishable. */
  replacedByHash?: string;
  reasonRevoked?: 'rotated' | 'logout' | 'reuse_detected' | 'password_changed' | 'admin_revoked';
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

const refreshTokenSchema = new Schema<IRefreshToken, Model<IRefreshToken>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedByHash: { type: String },
    reasonRevoked: {
      type: String,
      enum: ['rotated', 'logout', 'reuse_detected', 'password_changed', 'admin_revoked'],
    },
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);

// Revoking a whole family on reuse detection is a single indexed update.
refreshTokenSchema.index({ user: 1, family: 1 });

/**
 * TTL cleanup. Expired rows are kept for a grace period past `expiresAt` rather
 * than deleted on the dot: if a stolen token is replayed just after expiry we
 * still want the row present to recognise it as reuse rather than as an unknown
 * token.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
