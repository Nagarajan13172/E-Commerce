import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { env, isProduction } from './config/env.js';
import { createLogger } from './config/logger.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { attachCsrfToken, verifyCsrf } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import v1Routes from './routes/v1/index.js';

const log = createLogger('app');

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy (nginx, Fly, Render), req.ip must come from
  // X-Forwarded-For or every client shares one rate-limit bucket. Trusting the
  // header unconditionally would let anyone spoof their IP, so it is scoped to
  // one hop in production and to loopback in development.
  app.set('trust proxy', isProduction ? 1 : 'loopback');
  app.disable('x-powered-by');

  // ── Observability ─────────────────────────────────────────────────────────
  app.use(requestId);
  app.use(requestLogger);

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      // The API serves JSON, not HTML, so a restrictive CSP here costs nothing.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Credentials are enabled (cookie auth), so the origin must be an explicit
  // allowlist — `*` is invalid with credentials and would be unsafe anyway.
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl and server-to-server requests send no Origin header.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin.replace(/\/$/, ''))) return callback(null, true);
        log.warn({ origin }, 'Blocked by CORS');
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86400,
    }),
  );

  // ── Payment webhooks ──────────────────────────────────────────────────────
  // Mounted BEFORE the JSON parser: signature verification must run against the
  // exact bytes the provider signed, and `express.json()` would consume the
  // stream and reserialise it (key order and whitespace change, HMAC breaks).
  // They are also exempt from CSRF — no cookies, authenticated by HMAC instead.
  app.use(
    `${env.API_PREFIX}/webhooks`,
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req, _res, next) => {
      req.rawBody = req.body as Buffer;
      next();
    },
  );

  // ── Body parsing ──────────────────────────────────────────────────────────
  // Capped deliberately: file uploads go straight to object storage via
  // presigned URLs, so no legitimate request needs a large JSON body.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(cookieParser());
  app.use(compression());

  // ── Rate limiting + CSRF ──────────────────────────────────────────────────
  app.use(globalLimiter);
  app.use(attachCsrfToken);
  app.use(env.API_PREFIX, verifyCsrf);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use(env.API_PREFIX, v1Routes);

  // ── Fallbacks ─────────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
