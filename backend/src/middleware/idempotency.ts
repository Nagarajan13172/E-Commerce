import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@ecom/shared';
import { IdempotencyKey } from '../models/idempotencyKey.model.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('idempotency');

/**
 * Make a state-changing endpoint safe to retry.
 *
 * Order creation reserves stock and consumes a coupon. A double-clicked button,
 * an impatient refresh, or a mobile connection replaying a request whose
 * response was lost would otherwise produce two orders and hold stock twice.
 *
 * How it works: the first request for a key inserts an `in_progress` row — the
 * unique index makes that insert the lock, so two simultaneous requests cannot
 * both proceed. When it finishes, the response is stored against the key and
 * replayed verbatim for any repeat.
 *
 * `requestHash` guards a subtler bug: a client reusing one key for a genuinely
 * different payload. Returning the first response then would silently give the
 * wrong answer, so a mismatch is an error instead.
 */
const RETENTION_HOURS = 24;

export const idempotent: RequestHandler = async (req, res, next) => {
  const key = req.get('idempotency-key');
  // Optional: a client that does not send one simply gets no protection.
  if (!key) return next();

  if (key.length < 8 || key.length > 200) {
    return next(AppError.badRequest('Idempotency-Key must be between 8 and 200 characters'));
  }

  const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
  const requestHash = createHash('sha256')
    .update(JSON.stringify(req.body ?? {}))
    .digest('hex');

  const existing = await IdempotencyKey.findOne({ key, endpoint });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return next(
        AppError.conflict(
          'This idempotency key was already used with a different request',
          ERROR_CODES.CONCURRENT_MODIFICATION,
        ),
      );
    }

    if (existing.status === 'completed') {
      log.debug({ key, endpoint }, 'Replaying stored response');
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(existing.responseStatus ?? 200).json(existing.responseBody);
    }

    // Still running. Retrying now would race the original, so the client is
    // told to wait rather than being allowed to duplicate the work.
    if (existing.status === 'in_progress') {
      return next(
        AppError.conflict(
          'That request is still being processed. Please wait a moment.',
          ERROR_CODES.CONCURRENT_MODIFICATION,
        ),
      );
    }
  }

  try {
    // The insert IS the lock — the unique index on { key, endpoint } means only
    // one of two simultaneous requests can create this row.
    await IdempotencyKey.create({
      key,
      endpoint,
      requestHash,
      user: req.user?.id,
      status: 'in_progress',
      expiresAt: new Date(Date.now() + RETENTION_HOURS * 3600_000),
    });
  } catch {
    return next(
      AppError.conflict(
        'That request is already being processed',
        ERROR_CODES.CONCURRENT_MODIFICATION,
      ),
    );
  }

  // Capture the response so a retry can be answered without re-running.
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const status = res.statusCode;
    void IdempotencyKey.updateOne(
      { key, endpoint },
      {
        $set: {
          // Only a success is worth replaying: a failed attempt should be
          // retryable, not permanently cached as a failure.
          status: status < 400 ? 'completed' : 'failed',
          responseStatus: status,
          responseBody: status < 400 ? body : undefined,
        },
      },
    ).catch((err) => log.error({ err, key }, 'Failed to record idempotent response'));

    return originalJson(body);
  };

  next();
};
