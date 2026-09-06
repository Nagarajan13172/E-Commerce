import type { RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import { AppError, type FieldError } from '../utils/AppError.js';

interface ValidationTargets {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toFieldErrors(error: ZodError, source: keyof ValidationTargets): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : source,
    message: issue.message,
  }));
}

/**
 * Parse and whitelist request input.
 *
 * This is the API's primary defence against NoSQL injection. `z.object()` strips
 * every key the schema does not declare and coerces what remains to typed
 * primitives, so an operator payload such as `{"email": {"$ne": null}}` cannot
 * survive parsing — it is rejected or flattened long before a Mongoose query
 * sees it. That is why there is no sanitizer middleware in this stack:
 * whitelisting is strictly stronger than blacklisting `$` and `.`.
 *
 * Results land on `req.validated`, never back on `req.query`, because Express 5
 * exposes `req.query` as a getter and assigning to it throws at runtime.
 */
export function validate(targets: ValidationTargets): RequestHandler {
  return (req, _res, next) => {
    const errors: FieldError[] = [];
    req.validated ??= {};

    if (targets.params) {
      const result = targets.params.safeParse(req.params);
      if (result.success) req.validated.params = result.data;
      else errors.push(...toFieldErrors(result.error, 'params'));
    }

    if (targets.query) {
      const result = targets.query.safeParse(req.query);
      if (result.success) req.validated.query = result.data;
      else errors.push(...toFieldErrors(result.error, 'query'));
    }

    if (targets.body) {
      const result = targets.body.safeParse(req.body);
      if (result.success) req.validated.body = result.data;
      else errors.push(...toFieldErrors(result.error, 'body'));
    }

    if (errors.length) return next(AppError.validation('Validation failed', errors));
    next();
  };
}

/**
 * Typed accessors. Controllers call these instead of reaching into
 * `req.validated` directly, so the parsed type is carried through rather than
 * being cast at every use site.
 */
export function validatedBody<T>(req: { validated: { body?: unknown } }): T {
  return req.validated.body as T;
}

export function validatedQuery<T>(req: { validated: { query?: unknown } }): T {
  return req.validated.query as T;
}

export function validatedParams<T>(req: { validated: { params?: unknown } }): T {
  return req.validated.params as T;
}
