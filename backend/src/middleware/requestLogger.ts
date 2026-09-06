import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

/**
 * HTTP access logging.
 *
 * Health checks are silenced — a readiness probe every few seconds otherwise
 * produces more log volume than real traffic.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? '',
  autoLogging: {
    ignore: (req) => req.url?.includes('/health') ?? false,
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
