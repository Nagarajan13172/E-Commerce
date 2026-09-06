import { ERROR_CODES, type ErrorCode } from '@ecom/shared';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Every error the application raises on purpose.
 *
 * `isOperational` separates "expected, describable failures" (bad coupon, out of
 * stock, forbidden) from genuine bugs. Operational errors are safe to show a
 * user; everything else becomes a generic 500 with the details kept in the logs.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly errors: FieldError[];
  readonly isOperational = true;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { errors?: FieldError[]; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = options.errors ?? [];
    this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }

  // ── 400 ───────────────────────────────────────────────────────────────────
  static badRequest(message: string, code: ErrorCode = ERROR_CODES.INVALID_INPUT) {
    return new AppError(400, code, message);
  }

  static validation(message = 'Validation failed', errors: FieldError[] = []) {
    return new AppError(422, ERROR_CODES.VALIDATION_ERROR, message, { errors });
  }

  // ── 401 ───────────────────────────────────────────────────────────────────
  static unauthenticated(
    message = 'Authentication required',
    code: ErrorCode = ERROR_CODES.UNAUTHENTICATED,
  ) {
    return new AppError(401, code, message);
  }

  // ── 403 ───────────────────────────────────────────────────────────────────
  static forbidden(
    message = 'You do not have permission to do that',
    code: ErrorCode = ERROR_CODES.FORBIDDEN,
  ) {
    return new AppError(403, code, message);
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  static notFound(resource = 'Resource', code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    return new AppError(404, code, `${resource} not found`);
  }

  // ── 409 ───────────────────────────────────────────────────────────────────
  static conflict(
    message: string,
    code: ErrorCode = ERROR_CODES.DUPLICATE_RESOURCE,
    details?: Record<string, unknown>,
  ) {
    return new AppError(409, code, message, { details });
  }

  /** Business-rule violations that are not the client's fault syntactically. */
  static unprocessable(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    return new AppError(422, code, message, { details });
  }

  static tooManyRequests(message = 'Too many requests, please slow down') {
    return new AppError(429, ERROR_CODES.RATE_LIMIT_EXCEEDED, message);
  }

  static internal(
    message = 'Something went wrong',
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
    cause?: unknown,
  ) {
    return new AppError(500, code, message, { cause });
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);
  }
}

/** True for errors we raised deliberately and can safely describe to a client. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
