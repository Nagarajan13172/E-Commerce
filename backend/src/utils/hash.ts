import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Password hashing and opaque-token hashing.
 *
 * Two distinct problems that are often wrongly conflated:
 *
 * - **Passwords** are low-entropy and human-chosen, so they need a *slow*,
 *   memory-hard KDF (argon2id) to make offline cracking expensive.
 * - **Tokens** we generate ourselves are already 256 bits of entropy, so they
 *   need only a *fast* one-way hash (SHA-256). Running argon2 on every refresh
 *   would add ~50ms to every token rotation to defend against a brute force that
 *   is already computationally impossible.
 */

/**
 * argon2id parameters. These are the OWASP-recommended baseline: 19 MiB of
 * memory, 2 iterations, 1 degree of parallelism. Memory cost is the important
 * dial — it is what makes GPU and ASIC attacks uneconomic.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed or truncated hash must read as "wrong password", never throw.
    return false;
  }
}

/**
 * A dummy verification used when the email does not exist.
 *
 * Without it, "unknown email" returns in ~1ms while "known email, wrong
 * password" takes ~50ms — a timing oracle that lets an attacker enumerate which
 * addresses have accounts. Burning the same work in both paths closes it.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$KYqRJmYPh0h1oJK1nSJ0zqSpZ1lXvJZ9F8kL0mNqRxY';

export async function burnPasswordVerification(): Promise<void> {
  await argon2.verify(DUMMY_HASH, 'timing-equalisation').catch(() => false);
}

/** A URL-safe, cryptographically random secret. 32 bytes = 256 bits. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * One-way hash for tokens at rest.
 *
 * Refresh, reset and verification tokens are stored hashed so that a database
 * leak does not hand an attacker a set of working credentials. Lookups hash the
 * incoming token and query by that, so the plaintext never touches the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison for any secret compared in application code. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
