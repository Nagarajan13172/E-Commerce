import type { UserRole } from '@ecom/shared';

/**
 * Request augmentation.
 *
 * Note `validated` rather than overwriting `req.query`: in Express 5 `req.query`
 * is a getter, so assigning to it throws. Parsed input therefore lands here, and
 * controllers read `req.validated.query` — which also makes it obvious at a
 * glance whether a handler is reading raw or validated input.
 */
declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
      tokenVersion: number;
      emailVerified: boolean;
    }

    interface Request {
      user?: AuthenticatedUser;
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      /** Correlation id echoed in responses and every log line. */
      id?: string;
      /** Raw body, captured only on webhook routes for signature verification. */
      rawBody?: Buffer;
      /** Guest cart identity for anonymous shoppers. */
      guestId?: string;
    }
  }
}

export {};
