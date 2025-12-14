/**
 * Cache Service Implementation
 * Implements LRU cache with TTL support and persistence
 */

import * as vscode from 'vscode'
import { CACHE_DEFAULTS, RESOURCE_LIMITS } from '../constants'
import { CacheEntry, CacheStats, ICacheService } from '../interfaces'

/**
 * CacheService implements an LRU (Least Recently Used) cache with TTL support
 * Features:
 * - Automatic eviction of least recently used items when cache is full
 * - Time-to-live (TTL) expiration for cached items
 * - Persistence to workspace storage
 * - Cache statistics tracking (hits, misses, hit rate)
 */
export class CacheService implements ICacheService {
  private cache: Map<string, CacheEntry<unknown>>
  private accessOrder: string[] // Track access order for LRU
  private hits: number
  private misses: number
  private cleanupTimer: NodeJS.Timeout | undefined
  private context: vscode.ExtensionContext | undefined

  constructor(context?: vscode.ExtensionContext) {
    this.cache = new Map()
    this.accessOrder = []
    this.hits = 0
    this.misses = 0
    this.context = context

    // Start periodic cleanup of expired entries
    this.startCleanupTimer()
  }

  /**
   * Get a value from the cache
   * Updates access order for LRU and tracks cache hits/misses
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      this.misses++
      return undefined
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      this.misses++
      return undefined
    }

    // Update access tracking
    entry.accessCount++
    entry.lastAccessed = Date.now()
    this.updateAccessOrder(key)
    this.hits++

    return entry.value
  }

  /**
   * Set a value in the cache
   * Implements LRU eviction when cache is full
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? CACHE_DEFAULTS.defaultTTL)

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
    }

    // Check if we need to evict entries
    if (!this.cache.has(key) && this.cache.size >= CACHE_DEFAULTS.maxEntries) {
      this.evictLRU()
    }

    // Check cache size limit
    this.enforceMaxCacheSize()

    this.cache.set(key, entry as CacheEntry<unknown>)
    this.updateAccessOrder(key)
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): void {
    this.cache.delete(key)
    this.removeFromAccessOrder(key)
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.hits = 0
    this.misses = 0
  }

  /**
   * Check if a key exists in the cache and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      return false
    }

    return true
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    }
  }

  /**
   * Persist cache to workspace storage
   */
  async persist(): Promise<void> {
    if (!this.context) {
      throw new Error('Cannot persist cache: ExtensionContext not provided')
    }

    try {
      // Convert cache to serializable format
      const serializedCache: Record<string, CacheEntry<unknown>> = {}

      for (const [key, entry] of this.cache.entries()) {
        // Only persist non-expired entries
        if (Date.now() <= entry.expiresAt) {
          serializedCache[key] = entry
        }
      }

      await this.context.workspaceState.update('cacheData', serializedCache)
      await this.context.workspaceState.update(
        'cacheAccessOrder',
        this.accessOrder
      )
      await this.context.workspaceState.update('cacheStats', {
        hits: this.hits,
        misses: this.misses,
      })
    } catch (error) {
      // Log error but don't throw - persistence failure shouldn't break the extension
      console.error('Failed to persist cache:', error)
    }
  }

  /**
   * Restore cache from workspace storage
   */
  async restore(): Promise<void> {
    if (!this.context) {
      throw new Error('Cannot restore cache: ExtensionContext not provided')
    }

    try {
      const serializedCache =
        this.context.workspaceState.get<Record<string, CacheEntry<unknown>>>(
          'cacheData'
        )

      const accessOrder =
        this.context.workspaceState.get<string[]>('cacheAccessOrder')

      const stats = this.context.workspaceState.get<{
        hits: number
        misses: number
      }>('cacheStats')

      if (serializedCache) {
        // Restore cache entries, filtering out expired ones
        const now = Date.now()
        for (const [key, entry] of Object.entries(serializedCache)) {
          if (now <= entry.expiresAt) {
            this.cache.set(key, entry)
          }
        }
      }

      if (accessOrder) {
        // Filter access order to only include keys that exist in cache
        this.accessOrder = accessOrder.filter(key => this.cache.has(key))
      }

      if (stats) {
        this.hits = stats.hits
        this.misses = stats.misses
      }
    } catch (error) {
      // Log error but don't throw - restoration failure shouldn't break the extension
      console.error('Failed to restore cache:', error)
      this.clear()
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * Update access order for LRU tracking
   * Moves the key to the end of the access order (most recently used)
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key)
    this.accessOrder.push(key)
  }

  /**
   * Remove a key from the access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return
    }

    // The first item in accessOrder is the least recently used
    const lruKey = this.accessOrder[0]
    if (lruKey) {
      this.cache.delete(lruKey)
    }
    this.accessOrder.shift()
  }

  /**
   * Enforce maximum cache size limit
   * Evicts entries if cache size exceeds the limit
   */
  private enforceMaxCacheSize(): void {
    // Estimate cache size (rough approximation)
    const estimatedSize = this.estimateCacheSize()

    if (estimatedSize > RESOURCE_LIMITS.maxCacheSize) {
      // Evict oldest entries until we're under the limit
      while (
        this.accessOrder.length > 0 &&
        this.estimateCacheSize() > RESOURCE_LIMITS.maxCacheSize * 0.8
      ) {
        this.evictLRU()
      }
    }
  }

  /**
   * Estimate the size of the cache in bytes
   * This is a rough approximation
   */
  private estimateCacheSize(): number {
    let size = 0

    for (const [key, entry] of this.cache.entries()) {
      // Estimate key size
      size += key.length * 2 // UTF-16 characters

      // Estimate entry size (rough approximation)
      size += JSON.stringify(entry.value).length * 2
      size += 32 // Overhead for entry metadata
    }

    return size
  }

  /**
   * Start periodic cleanup timer to remove expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries()
    }, CACHE_DEFAULTS.cleanupInterval)
  }

  /**
   * Remove expired entries from the cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
    }
  }
}
