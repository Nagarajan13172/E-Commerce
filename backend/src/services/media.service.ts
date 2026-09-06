import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import {
  ERROR_CODES,
  IMAGE_DERIVATIVES,
  UPLOAD_LIMITS,
  type ConfirmUploadInput,
  type PresignUploadInput,
} from '@ecom/shared';
import { Media, type MediaDocument } from '../models/media.model.js';
import { storage, STORAGE_PREFIX } from '../integrations/storage/index.js';
import { AppError } from '../utils/AppError.js';
import { toSlug } from '../utils/slug.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const log = createLogger('media');

/**
 * Media uploads.
 *
 * The flow is presign → direct browser PUT → confirm, chosen so that image bytes
 * never pass through Node. A 10MB upload through the API would occupy a request
 * handler for its whole duration; going straight to object storage keeps the API
 * free and gives the browser real progress events.
 *
 * The security consequence is that the server never sees the upload — so
 * `confirmUpload` re-verifies everything the client claimed, against the object
 * that actually landed.
 */

const PREFIX_BY_REF: Record<string, string> = {
  product: STORAGE_PREFIX.PRODUCTS,
  category: STORAGE_PREFIX.CATEGORIES,
  brand: STORAGE_PREFIX.BRANDS,
  review: STORAGE_PREFIX.REVIEWS,
  avatar: STORAGE_PREFIX.AVATARS,
};

/**
 * Issue a presigned PUT URL.
 *
 * The key is server-generated and contains a UUID. Accepting a client-supplied
 * key would let a caller overwrite an existing object — or write outside the
 * intended prefix with a `../` style path — so the only thing taken from the
 * client is a sanitized display name.
 */
export async function createPresignedUpload(
  input: PresignUploadInput,
  userId: string,
): Promise<{ uploadUrl: string; key: string; headers: Record<string, string>; expiresIn: number }> {
  const extension = extname(input.filename).slice(1).toLowerCase();
  const allowed = UPLOAD_LIMITS.ALLOWED_IMAGE_EXTENSIONS as readonly string[];

  if (!allowed.includes(extension)) {
    throw new AppError(
      415,
      ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      `Only ${allowed.join(', ')} images are accepted`,
    );
  }

  if (input.size > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
    throw new AppError(
      413,
      ERROR_CODES.FILE_TOO_LARGE,
      `Images must be smaller than ${env.MAX_UPLOAD_SIZE_MB}MB`,
    );
  }

  const baseName = toSlug(input.filename.replace(/\.[^.]+$/, '')) || 'image';
  const prefix = PREFIX_BY_REF[input.refType] ?? STORAGE_PREFIX.PRODUCTS;
  const key = `${prefix}/${randomUUID()}/${baseName}.${extension}`;

  const presigned = await storage.getPresignedPutUrl(key, input.contentType, 300);
  log.debug({ key, userId }, 'Issued presigned upload');

  return {
    uploadUrl: presigned.url,
    key: presigned.key,
    headers: presigned.headers,
    expiresIn: presigned.expiresIn,
  };
}

/**
 * Verify an uploaded object and record it.
 *
 * This is the security boundary for direct uploads. The presigned URL binds the
 * declared Content-Type, but a client can still upload arbitrary bytes under it
 * — so the real content is checked here:
 *
 * 1. The object exists and is within the size limit (the client could have sent
 *    far more than the size it declared when asking for the URL).
 * 2. Its **magic bytes** identify it as an allowed image. Trusting the declared
 *    Content-Type would let a renamed executable or an HTML file carrying a
 *    script be served from our own origin.
 *
 * Anything that fails is deleted, not merely rejected — an unreferenced object
 * that failed validation should not linger in the bucket.
 */
export async function confirmUpload(
  input: ConfirmUploadInput,
  userId: string,
): Promise<MediaDocument> {
  const existing = await Media.findOne({ key: input.key });
  // Confirming twice is not an error — return what was already recorded.
  if (existing) return existing;

  const head = await storage.head(input.key);
  if (!head) {
    throw AppError.badRequest(
      'That upload was not found. Please try again.',
      ERROR_CODES.UPLOAD_FAILED,
    );
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (head.size > maxBytes) {
    await storage.delete(input.key);
    throw new AppError(
      413,
      ERROR_CODES.FILE_TOO_LARGE,
      `Images must be smaller than ${env.MAX_UPLOAD_SIZE_MB}MB`,
    );
  }

  // 4100 bytes is enough for every signature `file-type` recognises.
  const sample = await storage.getRange(input.key, Math.min(4100, head.size));
  const detected = await fileTypeFromBuffer(sample);
  const allowedMimes = UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES as readonly string[];

  if (!detected || !allowedMimes.includes(detected.mime)) {
    await storage.delete(input.key);
    log.warn(
      { key: input.key, declared: head.contentType, detected: detected?.mime, userId },
      'Rejected upload whose real content is not an allowed image',
    );
    throw new AppError(415, ERROR_CODES.UNSUPPORTED_FILE_TYPE, 'That file is not a valid image');
  }

  const media = await Media.create({
    key: input.key,
    bucket: env.STORAGE_BUCKET,
    url: storage.getPublicUrl(input.key),
    mimeType: detected.mime,
    size: head.size,
    alt: input.alt || undefined,
    refType: input.refType,
    refId: input.refId,
    uploadedBy: userId,
  });

  // Derivatives are generated in the background: the admin should see the image
  // appear immediately, not wait on three resizes and a re-upload.
  void generateDerivatives(media).catch((err) =>
    log.error({ err, key: media.key }, 'Derivative generation failed'),
  );

  return media;
}

/**
 * Produce responsive sizes and a blur placeholder.
 *
 * Serving one 4000px original to a 200px thumbnail slot is the single biggest
 * avoidable cost on a product grid. The tiny base64 placeholder is inlined into
 * the page so a card has something to show immediately instead of a blank box
 * that shifts layout when the real image lands.
 */
export async function generateDerivatives(media: MediaDocument): Promise<void> {
  const original = await storage.getRange(media.key, media.size);
  const image = sharp(original, { failOn: 'error' });
  const metadata = await image.metadata();

  media.width = metadata.width;
  media.height = metadata.height;

  const variants: MediaDocument['variants'] = [];

  for (const { name, width } of IMAGE_DERIVATIVES) {
    // Never upscale: enlarging a 400px source to 1600px adds bytes and no detail.
    if (metadata.width && metadata.width <= width && name !== 'thumb') continue;

    const buffer = await sharp(original)
      .resize({ width, withoutEnlargement: true })
      // WebP for every derivative: broadly supported and materially smaller
      // than JPEG at equivalent quality.
      .webp({ quality: 82 })
      .toBuffer();

    const derivativeKey = media.key.replace(/(\.[^.]+)$/, `-${name}.webp`);
    await storage.upload({ key: derivativeKey, body: buffer, contentType: 'image/webp' });

    const derivativeMeta = await sharp(buffer).metadata();
    variants.push({
      name,
      key: derivativeKey,
      url: storage.getPublicUrl(derivativeKey),
      width: derivativeMeta.width ?? width,
      height: derivativeMeta.height ?? 0,
      size: buffer.byteLength,
    });
  }

  const placeholder = await sharp(original).resize(16).webp({ quality: 40 }).toBuffer();
  media.blurDataUrl = `data:image/webp;base64,${placeholder.toString('base64')}`;
  media.variants = variants;

  await media.save();
  log.debug({ key: media.key, variants: variants.length }, 'Generated image derivatives');
}

type MediaRefType = NonNullable<MediaDocument['refType']>;

export async function listMedia(
  options: { page?: number; limit?: number; refType?: MediaRefType } = {},
) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 40;
  const filter = options.refType ? { refType: options.refType } : {};

  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Media.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/** Remove an asset and every derivative generated from it. */
export async function deleteMedia(id: string): Promise<void> {
  const media = await Media.findById(id);
  if (!media) throw AppError.notFound('Media');

  await storage.deleteMany([media.key, ...media.variants.map((v) => v.key)]);
  await media.deleteOne();
  log.info({ key: media.key }, 'Deleted media and derivatives');
}
