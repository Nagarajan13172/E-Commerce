export interface UploadInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** Cache-Control for the stored object; public assets get a long max-age. */
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  lastModified?: Date;
  etag?: string;
}

export interface PresignedUpload {
  url: string;
  key: string;
  /** Headers the browser MUST send on the PUT or the signature will not match. */
  headers: Record<string, string>;
  expiresIn: number;
}

/**
 * Object storage abstraction.
 *
 * The implementation talks S3, which means the identical code path serves MinIO
 * locally, AWS S3, Cloudflare R2 or any other S3-compatible backend — switching
 * is a config change, not a rewrite. Business logic never imports an SDK.
 *
 * Keys are namespaced by visibility:
 *   public/**   anonymously readable — product imagery, stable cacheable URLs
 *   private/**  presigned GET only   — invoices, return labels
 */
export interface StorageService {
  upload(input: UploadInput): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  exists(key: string): Promise<boolean>;
  head(key: string): Promise<StoredObject | null>;
  /** First `bytes` of an object — used to verify magic bytes after upload. */
  getRange(key: string, bytes: number): Promise<Buffer>;
  /** Stable browser-facing URL. Only meaningful for `public/` keys. */
  getPublicUrl(key: string): string;
  getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<PresignedUpload>;
  getPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  list(prefix: string, maxKeys?: number): Promise<StoredObject[]>;
  /** Create the bucket and apply its policy if needed. Idempotent. */
  ensureBucket(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export const STORAGE_PREFIX = {
  PRODUCTS: 'public/products',
  CATEGORIES: 'public/categories',
  BRANDS: 'public/brands',
  AVATARS: 'public/avatars',
  REVIEWS: 'public/reviews',
  INVOICES: 'private/invoices',
} as const;
