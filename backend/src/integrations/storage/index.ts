import { S3Storage } from './s3.storage.js';
import type { StorageService } from './StorageService.js';

export const storage: StorageService = new S3Storage();
export * from './StorageService.js';
