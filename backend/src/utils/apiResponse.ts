import type { Response } from 'express';
import type { ErrorCode } from '@ecom/shared';
import type { FieldError } from './AppError.js';

/**
 * One response envelope for the entire API, so every client can branch on the
 * same shape instead of special-casing each endpoint.
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta | CursorMeta | Record<string, unknown>;
}

export interface ErrorBody {
  success: false;
  message: string;
  code: ErrorCode;
  errors?: FieldError[];
  requestId?: string;
  stack?: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { message?: string; status?: number; meta?: SuccessBody<T>['meta'] } = {},
): Response {
  const body: SuccessBody<T> = { success: true, data };
  if (options.message) body.message = options.message;
  if (options.meta) body.meta = options.meta;
  return res.status(options.status ?? 200).json(body);
}

export function sendCreated<T>(res: Response, data: T, message?: string): Response {
  return sendSuccess(res, data, { status: 201, ...(message ? { message } : {}) });
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function buildCursorMeta(limit: number, nextCursor: string | null): CursorMeta {
  return { limit, nextCursor, hasMore: nextCursor !== null };
}
