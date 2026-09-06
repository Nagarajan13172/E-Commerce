import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Attach a correlation id to every request.
 *
 * It is echoed in the `X-Request-Id` response header and included in error
 * bodies, so a user can quote the id from an error toast and it can be found
 * directly in the logs.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  // Only trust an inbound id if it looks like one — otherwise it is a log
  // injection vector.
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  req.id = id;
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
