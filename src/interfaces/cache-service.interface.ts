/**
 * Cache Service Interface
 * Provides LRU caching with TTL support and persistence
 */

export interface ICacheService {
  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or undefined if not found or expired
   */
  get<T>(key: string): T | undefined

  /**
   * Set a value in the cache
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional time-to-live in milliseconds (default: 30 minutes)
   */
  set<T>(key: string, value: T, ttl?: number): void

  /**
   * Delete a value from the cache
   * @param key The cache key
   */
  delete(key: string): void

  /**
   * Clear all cached values
   */
  clear(): void

  /**
   * Check if a key exists in the cache
   * @param key The cache key
   * @returns True if key exists and is not expired
   */
  has(key: string): boolean

  /**
   * Get cache statistics
   * @returns Cache statistics including size, hits, misses, and hit rate
   */
  getStats(): CacheStats

  /**
   * Persist cache to workspace storage
   */
  persist(): Promise<void>

  /**
   * Restore cache from workspace storage
   */
  restore(): Promise<void>
}

export interface CacheStats {
  /** Current number of items in cache */
  size: number
  /** Total number of cache hits */
  hits: number
  /** Total number of cache misses */
  misses: number
  /** Cache hit rate (hits / (hits + misses)) */
  hitRate: number
}

export interface CacheEntry<T> {
  value: T
  expiresAt: number
  accessCount: number
  lastAccessed: number
}
