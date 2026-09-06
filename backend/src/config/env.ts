import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Load the nearest `.env` by walking up from the current working directory, so
 * the API behaves identically whether it is started from the repo root
 * (`pnpm dev`), from `backend`, or by Vitest.
 *
 * Uses Node's built-in `process.loadEnvFile` — no dotenv dependency. Real
 * environment variables always win: `loadEnvFile` does not overwrite anything
 * already present, which is what we want in Docker and CI.
 */
function loadDotEnvFile(): void {
  const fileName = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

  let dir = resolve(process.cwd());
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // No file found: rely purely on real environment variables (Docker, CI, prod).
}

loadDotEnvFile();

/**
 * The ONLY place `process.env` is read.
 *
 * Everything is parsed once at boot and the process refuses to start on a bad
 * or missing value — a misconfigured secret fails loudly at deploy time instead
 * of silently at 3am when the first customer tries to pay.
 */

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const csvOrigins = z
  .string()
  .default('http://localhost:5173')
  .transform((v) =>
    v
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

/** Secrets must be long enough to be worth having. */
const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters — generate one with: openssl rand -base64 48`);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    CLIENT_URL: z.url(),
    API_URL: z.url(),
    CORS_ORIGINS: csvOrigins,

    MONGODB_URI: z.string().startsWith('mongodb'),
    MONGODB_URI_TEST: z.string().startsWith('mongodb').optional(),

    JWT_SECRET: secret('JWT_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    CSRF_SECRET: secret('CSRF_SECRET'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_DOMAIN: z.string().default('localhost'),
    COOKIE_SECURE: booleanish.default(false),
    REQUIRE_VERIFIED_EMAIL_FOR_CHECKOUT: booleanish.default(false),

    REDIS_URL: z.string().startsWith('redis').optional().or(z.literal('')),

    STORAGE_ENDPOINT: z.url(),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_ACCESS_KEY: z.string().min(3),
    STORAGE_SECRET_KEY: z.string().min(3),
    STORAGE_BUCKET: z.string().min(3),
    STORAGE_PUBLIC_URL: z.url(),
    STORAGE_FORCE_PATH_STYLE: booleanish.default(true),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(100).default(10),

    PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
    PAYMENT_CURRENCY: z.enum(['INR', 'USD', 'EUR']).default('INR'),
    MOCK_PAYMENT_KEY_ID: z.string().default('mock_key_local'),
    MOCK_PAYMENT_KEY_SECRET: z.string().min(8).default('mock_secret_local_change_me'),
    MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(8).default('mock_webhook_secret_local'),
    RAZORPAY_KEY_ID: z.string().optional().or(z.literal('')),
    RAZORPAY_KEY_SECRET: z.string().optional().or(z.literal('')),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),

    EMAIL_PROVIDER: z.enum(['smtp', 'console']).default('console'),
    EMAIL_FROM: z.string().default('Aurora Store <no-reply@aurora.local>'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().optional().or(z.literal('')),
    SMTP_PASS: z.string().optional().or(z.literal('')),

    DEFAULT_TAX_RATE: z.coerce.number().min(0).max(1).default(0.18),
    FREE_SHIPPING_THRESHOLD: z.coerce.number().nonnegative().default(999),
    DEFAULT_SHIPPING_FEE: z.coerce.number().nonnegative().default(49),
    STOCK_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    ORDER_RETURN_WINDOW_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  })
  // Selecting a provider without its credentials is a deploy-time mistake, so
  // catch it at boot rather than at the first checkout.
  .refine(
    (e) => e.PAYMENT_PROVIDER !== 'razorpay' || (e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET),
    {
      message:
        'PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to be set',
      path: ['RAZORPAY_KEY_ID'],
    },
  )
  // Cookies without Secure over a public origin would be sent in clear text.
  .refine((e) => e.NODE_ENV !== 'production' || e.COOKIE_SECURE, {
    message: 'COOKIE_SECURE must be true in production',
    path: ['COOKIE_SECURE'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.PAYMENT_PROVIDER !== 'mock', {
    message: 'PAYMENT_PROVIDER=mock must never be used in production',
    path: ['PAYMENT_PROVIDER'],
  });

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // The logger depends on env, so this one message has to use stderr directly.
    console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
    console.error('Copy .env.example to .env and fill in the missing values.\n');
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

export type Env = typeof env;
