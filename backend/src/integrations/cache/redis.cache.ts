import { Redis } from 'ioredis';
import type { CacheService } from './CacheService.js';
import { createLogger } from '../../config/logger.js';

const log = createLogger('cache:redis');

/**
 * Redis-backed cache.
 *
 * Every operation is failure-tolerant: if Redis is down, reads return a miss and
 * writes are dropped rather than throwing. A cache outage must degrade
 * performance, never take the storefront offline.
 */
export class RedisCache implements CacheService {
  constructor(private readonly client: Redis) {}

  static create(url: string): RedisCache {
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      // Commands issued before the socket is ready (module-load time, e.g. the
      // rate-limit store loading its Lua script) are buffered rather than
      // thrown away. maxRetriesPerRequest still makes a real outage fail fast.
      enableOfflineQueue: true,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    client.on('error', (err) => log.warn({ err }, 'Redis error — falling through to origin'));
    client.on('connect', () => log.info('Redis connected'));
    return new RedisCache(client);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      log.debug({ err, key }, 'Cache read failed');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      log.debug({ err, key }, 'Cache write failed');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      log.debug({ err, key }, 'Cache delete failed');
    }
  }

  /** Uses SCAN rather than KEYS: KEYS blocks the Redis event loop. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      log.debug({ err, prefix }, 'Cache prefix invalidation failed');
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
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }

  /** Exposed so the rate limiter can share this connection. */
  get raw(): Redis {
    return this.client;
  }
}
