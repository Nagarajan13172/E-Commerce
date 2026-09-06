import { env } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import type { CacheService } from './CacheService.js';
import { MemoryCache } from './memory.cache.js';
import { RedisCache } from './redis.cache.js';

const log = createLogger('cache');

/**
 * Pick an implementation once at boot. Callers only ever see the interface, so
 * moving between in-memory and Redis needs no change anywhere else.
 */
function createCache(): CacheService {
  if (env.REDIS_URL) {
    log.info('Using Redis cache');
    return RedisCache.create(env.REDIS_URL);
  }
  log.info('REDIS_URL not set — using in-process LRU cache');
  return new MemoryCache();
}

export const cache: CacheService = createCache();
export * from './CacheService.js';
export { RedisCache } from './redis.cache.js';
export { MemoryCache } from './memory.cache.js';
