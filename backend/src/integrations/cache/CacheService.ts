/**
 * Cache abstraction.
 *
 * Two implementations ship: an in-process LRU and Redis. Redis is used when
 * REDIS_URL is set, and the app is fully functional without it — caching is an
 * optimisation here, never a correctness dependency. Nothing that must be
 * correct (cart contents, stock levels, prices at checkout) is ever cached.
 */
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Invalidate a whole family of keys, e.g. `product:*` after a product write. */
  delByPrefix(prefix: string): Promise<void>;
  /** Read-through helper: return the cached value or compute, store and return it. */
  wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
  isHealthy(): Promise<boolean>;
  disconnect(): Promise<void>;
}

/** Namespaced key builders, so invalidation prefixes stay consistent. */
export const cacheKeys = {
  categoryTree: () => 'category:tree',
  categoryBySlug: (slug: string) => `category:slug:${slug}`,
  brandList: () => 'brand:list',
  productBySlug: (slug: string) => `product:slug:${slug}`,
  productFacets: (hash: string) => `product:facets:${hash}`,
  homepage: () => 'home:sections',
  settings: () => 'settings:public',
} as const;

export const CACHE_TTL = {
  SHORT: 60,
  MEDIUM: 5 * 60,
  LONG: 30 * 60,
} as const;
