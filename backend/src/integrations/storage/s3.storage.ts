import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import { ERROR_CODES } from '@ecom/shared';
import type {
  PresignedUpload,
  StorageService,
  StoredObject,
  UploadInput,
} from './StorageService.js';

const log = createLogger('storage');

/**
 * S3-compatible storage.
 *
 * `forcePathStyle` is what makes this work against MinIO (which serves
 * `host/bucket/key` rather than `bucket.host/key`); the same client talks to
 * real S3 with the flag off.
 */
export class S3Storage implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.STORAGE_BUCKET;
    this.client = new S3Client({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY,
        secretAccessKey: env.STORAGE_SECRET_KEY,
      },
    });
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          // Object keys are content-addressed (they contain a uuid), so a long
          // immutable max-age is safe and keeps images off the origin.
          CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
          Metadata: input.metadata,
        }),
      );
      return { key: input.key, size: input.body.byteLength, contentType: input.contentType };
    } catch (err) {
      log.error({ err, key: input.key }, 'Upload failed');
      throw new AppError(500, ERROR_CODES.STORAGE_ERROR, 'Failed to store file', { cause: err });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      log.error({ err, key }, 'Delete failed');
      throw new AppError(500, ERROR_CODES.STORAGE_ERROR, 'Failed to delete file', { cause: err });
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!keys.length) return;
    // S3 caps DeleteObjects at 1000 keys per call.
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
        lastModified: res.LastModified,
        etag: res.ETag,
      };
    } catch {
      return null;
    }
  }

  async getRange(key: string, bytes: number): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  getPublicUrl(key: string): string {
    return `${env.STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }

  /**
   * Presigned PUT so the browser uploads straight to storage.
   *
   * The signature covers Content-Type, so the client cannot declare one type to
   * the API and then upload another — and `media/confirm` still re-checks the
   * actual magic bytes afterwards.
   */
  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
    return {
      url,
      key,
      headers: { 'Content-Type': contentType },
      expiresIn: expiresInSeconds,
    };
  }

  async getPresignedGetUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async list(prefix: string, maxKeys = 100): Promise<StoredObject[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: maxKeys }),
    );
    return (res.Contents ?? []).map((o) => ({
      key: o.Key ?? '',
      size: o.Size ?? 0,
      contentType: 'application/octet-stream',
      lastModified: o.LastModified,
      etag: o.ETag,
    }));
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      log.debug({ bucket: this.bucket }, 'Bucket present');
    } catch {
      log.info({ bucket: this.bucket }, 'Creating bucket');
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
