/** Values that must agree between client-side UX and server-side enforcement. */

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 24,
  MAX_LIMIT: 100,
  ADMIN_DEFAULT_LIMIT: 20,
} as const;

export const CART_LIMITS = {
  MAX_ITEMS: 50,
  MAX_QUANTITY_PER_ITEM: 10,
  GUEST_CART_TTL_DAYS: 30,
} as const;

export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_IMAGES_PER_PRODUCT: 12,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
  ALLOWED_IMAGE_EXTENSIONS: ['jpg', 'jpeg', 'png', 'webp', 'avif'] as const,
} as const;

/** Widths generated for every uploaded product image. */
export const IMAGE_DERIVATIVES = [
  { name: 'thumb', width: 200 },
  { name: 'card', width: 600 },
  { name: 'full', width: 1600 },
] as const;

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  /** At least one lowercase, one uppercase and one digit. */
  PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  MESSAGE: 'Password must be at least 8 characters and include upper case, lower case and a number',
} as const;

export const REVIEW_LIMITS = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MAX_COMMENT_LENGTH: 2000,
  MAX_IMAGES: 5,
} as const;

export const AUTH_LIMITS = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_DURATION_MINUTES: 15,
  RESET_TOKEN_TTL_MINUTES: 60,
  VERIFY_TOKEN_TTL_HOURS: 24,
} as const;
