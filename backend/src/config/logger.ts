import { pino } from 'pino';
import { env, isDevelopment, isTest } from './env.js';

/**
 * Structured logging.
 *
 * `redact` is the important part: request logging would otherwise write session
 * cookies, bearer tokens, passwords and payment signatures straight into the log
 * store, where they live far longer than the session they belong to.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["x-razorpay-signature"]',
  'req.headers["x-webhook-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.confirmPassword',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.tokenHash',
  '*.signature',
  '*.secret',
  '*.keySecret',
  '*.cardNumber',
  '*.cvv',
  'body.password',
  'body.token',
];

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'ecom-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service,env',
        singleLine: false,
      },
    },
  }),
});

/** Child logger for a subsystem, so logs can be filtered by `module`. */
export const createLogger = (module: string) => logger.child({ module });
