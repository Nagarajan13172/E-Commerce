import { LRUCache } from 'lru-cache';
import type { CacheService } from './CacheService.js';

/**
 * In-process cache used when Redis is not configured.
 *
 * Deliberately bounded: an unbounded Map here would be a slow memory leak. Note
 * that this cache is per-process, so with multiple API instances each keeps its
 * own copy — acceptable for the read-mostly catalog data we cache, and the
 * reason production should set REDIS_URL.
 */
export class MemoryCache implements CacheService {
  // Values are boxed because lru-cache rejects nullish values, and because a
  // box lets a legitimately cached `null` be told apart from a cache miss.
  private readonly store: LRUCache<string, { value: unknown }>;

  constructor(max = 1000, defaultTtlSeconds = 300) {
    this.store = new LRUCache({ max, ttl: defaultTtlSeconds * 1000 });
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    return entry ? (entry.value as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, { value }, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}
