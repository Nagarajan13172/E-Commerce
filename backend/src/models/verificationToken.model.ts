import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const VERIFICATION_PURPOSES = ['email_verification', 'password_reset'] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

/**
 * Single-use, hashed, expiring tokens for email verification and password reset.
 *
 * Stored hashed for the same reason as refresh tokens: a database leak must not
 * hand an attacker a working password-reset link for every account.
 *
 * `usedAt` rather than deletion-on-use, so a replayed link can be told apart
 * from a token that never existed — useful signal, and it keeps the failure
 * message honest ("this link has already been used").
 */
export interface IVerificationToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  tokenHash: string;
  purpose: VerificationPurpose;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export type VerificationTokenDocument = HydratedDocument<IVerificationToken>;

const verificationTokenSchema = new Schema<IVerificationToken, Model<IVerificationToken>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: VERIFICATION_PURPOSES, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// "Invalidate any outstanding reset tokens for this user" is one indexed update.
verificationTokenSchema.index({ user: 1, purpose: 1, usedAt: 1 });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const VerificationToken = model<IVerificationToken>(
  'VerificationToken',
  verificationTokenSchema,
);
