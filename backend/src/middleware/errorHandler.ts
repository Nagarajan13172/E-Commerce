import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ERROR_CODES, type ErrorCode } from '@ecom/shared';
import { AppError, isAppError, type FieldError } from '../utils/AppError.js';
import type { ErrorBody } from '../utils/apiResponse.js';
import { isProduction } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('error');

/** Mongo duplicate-key errors carry the offending index in `keyValue`. */
interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

/**
 * Translate any thrown value into the API's error envelope.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so controllers need no try/catch and no asyncHandler wrapper.
 */
function normalize(err: unknown): AppError {
  if (isAppError(err)) return err;

  // ── Zod: a validator ran outside the validate() middleware ────────────────
  if (err instanceof ZodError) {
    const errors: FieldError[] = err.issues.map((issue) => ({
      field: issue.path.join('.') || '_root',
      message: issue.message,
    }));
    return AppError.validation('Validation failed', errors);
  }

  // ── Mongoose document validation ──────────────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    const errors: FieldError[] = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return AppError.validation('Validation failed', errors);
  }

  // ── Malformed ObjectId etc. ───────────────────────────────────────────────
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, ERROR_CODES.MALFORMED_ID, `Invalid value for "${err.path}"`);
  }

  if (err instanceof mongoose.Error.DocumentNotFoundError) {
    return AppError.notFound('Resource');
  }

  // ── Duplicate key: map the index to a specific, actionable code ───────────
  const mongoErr = err as MongoServerError;
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
    const codeByField: Record<string, ErrorCode> = {
      email: ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      slug: ERROR_CODES.SLUG_TAKEN,
      sku: ERROR_CODES.SKU_TAKEN,
      'variants.sku': ERROR_CODES.SKU_TAKEN,
      code: ERROR_CODES.DUPLICATE_RESOURCE,
    };
    return AppError.conflict(
      `A record with that ${field} already exists`,
      codeByField[field] ?? ERROR_CODES.DUPLICATE_RESOURCE,
      { field },
    );
  }

  // ── JWT ───────────────────────────────────────────────────────────────────
  if (err instanceof Error) {
    if (err.name === 'TokenExpiredError') {
      return AppError.unauthenticated('Your session has expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return AppError.unauthenticated('Invalid session token', ERROR_CODES.TOKEN_INVALID);
    }
    // Body larger than the configured limit.
    if ('type' in err && err.type === 'entity.too.large') {
      return new AppError(413, ERROR_CODES.FILE_TOO_LARGE, 'Request body is too large');
    }
    // Malformed JSON body.
    if (err instanceof SyntaxError && 'body' in err) {
      return AppError.badRequest('Request body is not valid JSON');
    }
  }

  // ── Anything else is a bug, not an expected failure ───────────────────────
  return AppError.internal('Something went wrong', ERROR_CODES.INTERNAL_ERROR, err);
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);
  const requestId = res.locals.requestId as string | undefined;

  // 5xx means we broke something — log the whole error with its stack. 4xx is
  // routine client behaviour and would otherwise drown the logs.
  const logPayload = {
    err: appError,
    requestId,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id,
    code: appError.code,
    ...(appError.cause ? { cause: appError.cause } : {}),
  };

  if (appError.statusCode >= 500) {
    log.error(logPayload, appError.message);
  } else if (appError.statusCode === 429) {
    log.warn(logPayload, appError.message);
  } else {
    log.debug(logPayload, appError.message);
  }

  const body: ErrorBody = {
    success: false,
    // Never leak the internals of an unexpected failure to the client.
    message: appError.statusCode >= 500 && isProduction ? 'Something went wrong' : appError.message,
    code: appError.code,
  };
  if (appError.errors.length) body.errors = appError.errors;
  if (requestId) body.requestId = requestId;
  if (!isProduction && appError.statusCode >= 500) body.stack = appError.stack;

  res.status(appError.statusCode).json(body);
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
};
