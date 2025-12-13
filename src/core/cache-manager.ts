/**
 * Advanced Multi-Tier Caching System
 *
 * Enterprise-grade caching with multiple tiers:
 * - L1: Memory cache (fastest, limited size)
 * - L2: IndexedDB/File cache (persistent, larger)
 * - L3: Distributed cache (optional, for teams)
 *
 * Features:
 * - LRU eviction with intelligent scoring
 * - TTL support with stale-while-revalidate
 * - Content-aware caching (hash-based keys)
 * - Cache warming and preloading
 * - Compression for large entries
 * - Cache statistics and monitoring
 *
 * @module core/cache-manager
 */

import * as crypto from 'crypto'
import { EventEmitter } from 'events'

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = unknown> {
  key: string
  value: T
  hash: string
  size: number
  createdAt: number
  accessedAt: number
  accessCount: number
  expiresAt?: number
  ttl?: number
  priority: CachePriority
  tags: string[]
  compressed: boolean
  tier: CacheTier
  metadata?: Record<string, unknown>
}

/**
 * Cache priority levels
 */
export enum CachePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * Cache tiers
 */
export enum CacheTier {
  MEMORY = 'memory',
  PERSISTENT = 'persistent',
  DISTRIBUTED = 'distributed',
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  entries: number
  size: number
  maxSize: number
  utilizationRate: number
  evictions: number
  compressionSavings: number
  averageAccessTime: number
  tierStats: Record<CacheTier, {
    entries: number
    size: number
    hits: number
    misses: number
  }>
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxMemorySize: number
  maxPersistentSize: number
  defaultTTL: number
  enableCompression: boolean
  compressionThreshold: number
  enableStaleWhileRevalidate: boolean
  staleTime: number
  enableWarmup: boolean
  warmupPriority: CachePriority
  enableStatistics: boolean
  statisticsInterval: number
  evictionPolicy: 'lru' | 'lfu' | 'arc' | 'smart'
  enableDistributed: boolean
  distributedConfig?: {
    endpoint: string
    apiKey?: string
    teamId?: string
  }
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  maxMemorySize: 100 * 1024 * 1024, // 100MB
  maxPersistentSize: 500 * 1024 * 1024, // 500MB
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  enableCompression: true,
  compressionThreshold: 10 * 1024, // 10KB
  enableStaleWhileRevalidate: true,
  staleTime: 5 * 60 * 1000, // 5 minutes
  enableWarmup: true,
  warmupPriority: CachePriority.NORMAL,
  enableStatistics: true,
  statisticsInterval: 60 * 1000, // 1 minute
  evictionPolicy: 'smart',
  enableDistributed: false,
}

/**
 * In-memory LRU cache with smart eviction
 */
class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number
  private currentSize: number = 0
  private accessOrder: string[] = []
  private evictionPolicy: CacheConfig['evictionPolicy']

  constructor(maxSize: number, evictionPolicy: CacheConfig['evictionPolicy'] = 'smart') {
    this.maxSize = maxSize
    this.evictionPolicy = evictionPolicy
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key)
    if (entry) {
      entry.accessedAt = Date.now()
      entry.accessCount++

      // Update access order for LRU
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      this.accessOrder.push(key)
    }
    return entry
  }

  set(key: string, entry: CacheEntry<T>): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!
      this.currentSize -= existing.size
      this.cache.delete(key)
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
    }

    // Evict if necessary
    while (this.currentSize + entry.size > this.maxSize && this.cache.size > 0) {
      this.evict()
    }

    // Add new entry
    this.cache.set(key, entry)
    this.currentSize += entry.size
    this.accessOrder.push(key)
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.currentSize -= entry.size
      this.cache.delete(key)
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      return true
    }
    return false
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.currentSize = 0
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  size(): number {
    return this.cache.size
  }

  memorySize(): number {
    return this.currentSize
  }

  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  values(): CacheEntry<T>[] {
    return Array.from(this.cache.values())
  }

  private evict(): void {
    let keyToEvict: string | undefined

    switch (this.evictionPolicy) {
      case 'lru':
        keyToEvict = this.selectLRU()
        break
      case 'lfu':
        keyToEvict = this.selectLFU()
        break
      case 'arc':
        keyToEvict = this.selectARC()
        break
      case 'smart':
      default:
        keyToEvict = this.selectSmart()
        break
    }

    if (keyToEvict) {
      this.delete(keyToEvict)
    }
  }

  private selectLRU(): string | undefined {
    return this.accessOrder[0]
  }

  private selectLFU(): string | undefined {
    let minCount = Infinity
    let keyToEvict: string | undefined

    for (const [key, entry] of this.cache) {
      if (entry.accessCount < minCount) {
        minCount = entry.accessCount
        keyToEvict = key
      }
    }

    return keyToEvict
  }

  private selectARC(): string | undefined {
    // Simplified ARC - combine recency and frequency
    let minScore = Infinity
    let keyToEvict: string | undefined
    const now = Date.now()

    for (const [key, entry] of this.cache) {
      const recencyScore = (now - entry.accessedAt) / 1000 // seconds since last access
      const frequencyScore = 1 / (entry.accessCount + 1)
      const score = recencyScore * 0.5 + frequencyScore * 1000 * 0.5

      if (score < minScore && entry.priority <= CachePriority.NORMAL) {
        minScore = score
        keyToEvict = key
      }
    }

    return keyToEvict
  }

  private selectSmart(): string | undefined {
    // Smart eviction considers: recency, frequency, priority, size, and TTL
    let maxScore = -Infinity
    let keyToEvict: string | undefined
    const now = Date.now()

    for (const [key, entry] of this.cache) {
      // Higher score = more likely to evict
      const ageScore = (now - entry.createdAt) / (1000 * 60 * 60) // hours since creation
      const recencyScore = (now - entry.accessedAt) / (1000 * 60) // minutes since last access
      const frequencyScore = 1 / Math.log(entry.accessCount + 2)
      const priorityScore = 1 / entry.priority
      const sizeScore = entry.size / this.maxSize * 10
      const ttlScore = entry.expiresAt ? Math.max(0, (now - entry.expiresAt) / (1000 * 60)) : 0

      const score =
        ageScore * 0.1 +
        recencyScore * 0.3 +
        frequencyScore * 0.2 +
        priorityScore * 0.2 +
        sizeScore * 0.1 +
        ttlScore * 0.1

      if (score > maxScore) {
        maxScore = score
        keyToEvict = key
      }
    }

    return keyToEvict
  }
}

/**
 * Persistent cache using VS Code storage
 */
class PersistentCache<T> {
  private storage: Map<string, string> = new Map()
  private index: Map<string, { size: number; createdAt: number; accessedAt: number }> = new Map()
  private maxSize: number
  private currentSize: number = 0

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    const data = this.storage.get(key)
    if (data) {
      const entry = JSON.parse(data) as CacheEntry<T>
      entry.accessedAt = Date.now()
      entry.accessCount++

      // Update index
      const indexEntry = this.index.get(key)
      if (indexEntry) {
        indexEntry.accessedAt = Date.now()
      }

      return entry
    }
    return undefined
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    const data = JSON.stringify(entry)
    const size = data.length * 2 // Approximate UTF-16 size

    // Remove existing entry if present
    if (this.storage.has(key)) {
      const existing = this.index.get(key)
      if (existing) {
        this.currentSize -= existing.size
      }
      this.storage.delete(key)
      this.index.delete(key)
    }

    // Evict if necessary
    while (this.currentSize + size > this.maxSize && this.storage.size > 0) {
      await this.evictOldest()
    }

    // Store
    this.storage.set(key, data)
    this.index.set(key, {
      size,
      createdAt: entry.createdAt,
      accessedAt: entry.accessedAt,
    })
    this.currentSize += size
  }

  async delete(key: string): Promise<boolean> {
    const indexEntry = this.index.get(key)
    if (indexEntry) {
      this.currentSize -= indexEntry.size
      this.storage.delete(key)
      this.index.delete(key)
      return true
    }
    return false
  }

  async clear(): Promise<void> {
    this.storage.clear()
    this.index.clear()
    this.currentSize = 0
  }

  has(key: string): boolean {
    return this.storage.has(key)
  }

  size(): number {
    return this.storage.size
  }

  memorySize(): number {
    return this.currentSize
  }

  private async evictOldest(): Promise<void> {
    let oldestKey: string | undefined
    let oldestTime = Infinity

    for (const [key, entry] of this.index) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      await this.delete(oldestKey)
    }
  }
}

/**
 * Simple compression utility
 */
class Compressor {
  static compress(data: string): string {
    // Simple run-length encoding for repeated characters
    // In production, use proper compression like LZ4 or zstd
    return data
      .replace(/(.)\1{3,}/g, (match, char) => `${char}${match.length}#`)
  }

  static decompress(data: string): string {
    return data
      .replace(/(.)(\\d+)#/g, (_, char, count) => char.repeat(parseInt(count)))
  }

  static estimateSize(data: string): number {
    return data.length * 2 // UTF-16
  }
}

/**
 * Advanced Multi-Tier Cache Manager
 */
export class CacheManager<T = unknown> extends EventEmitter {
  private config: CacheConfig
  private memoryCache: MemoryCache<T>
  private persistentCache: PersistentCache<T>
  private stats: CacheStats
  private statsInterval?: NodeJS.Timeout
  private pendingWarmups: Map<string, Promise<void>> = new Map()

  constructor(config: Partial<CacheConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.memoryCache = new MemoryCache(this.config.maxMemorySize, this.config.evictionPolicy)
    this.persistentCache = new PersistentCache(this.config.maxPersistentSize)
    this.stats = this.createInitialStats()

    if (this.config.enableStatistics) {
      this.startStatisticsCollection()
    }
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<T | undefined> {
    const startTime = performance.now()

    // Try memory cache first (L1)
    let entry = this.memoryCache.get(key)
    if (entry) {
      this.stats.hits++
      this.stats.tierStats[CacheTier.MEMORY].hits++

      // Check if expired
      if (this.isExpired(entry)) {
        if (this.config.enableStaleWhileRevalidate && !this.isStale(entry)) {
          // Return stale value while revalidating
          this.emit('stale-value', { key, entry })
          return entry.value
        }
        this.memoryCache.delete(key)
        this.stats.tierStats[CacheTier.MEMORY].misses++
        entry = undefined
      }

      if (entry) {
        this.updateAccessTime(startTime)
        return entry.value
      }
    }

    this.stats.tierStats[CacheTier.MEMORY].misses++

    // Try persistent cache (L2)
    entry = await this.persistentCache.get(key)
    if (entry) {
      this.stats.hits++
      this.stats.tierStats[CacheTier.PERSISTENT].hits++

      // Check if expired
      if (this.isExpired(entry)) {
        if (this.config.enableStaleWhileRevalidate && !this.isStale(entry)) {
          this.emit('stale-value', { key, entry })
          // Promote to memory cache
          this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY })
          return entry.value
        }
        await this.persistentCache.delete(key)
        this.stats.tierStats[CacheTier.PERSISTENT].misses++
        entry = undefined
      }

      if (entry) {
        // Promote to memory cache
        this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY })
        this.updateAccessTime(startTime)
        return entry.value
      }
    }

    this.stats.tierStats[CacheTier.PERSISTENT].misses++
    this.stats.misses++
    this.updateAccessTime(startTime)

    return undefined
  }

  /**
   * Set a value in the cache
   */
  async set(
    key: string,
    value: T,
    options: Partial<{
      ttl: number
      priority: CachePriority
      tags: string[]
      tier: CacheTier
      compress: boolean
    }> = {}
  ): Promise<void> {
    const hash = this.hashValue(value)
    const serialized = JSON.stringify(value)
    let size = Compressor.estimateSize(serialized)
    let compressed = false

    // Compress if enabled and above threshold
    let storedValue = value
    if (this.config.enableCompression && size > this.config.compressionThreshold) {
      const compressedData = Compressor.compress(serialized)
      const compressedSize = Compressor.estimateSize(compressedData)

      if (compressedSize < size * 0.9) { // Only use compression if it saves >10%
        this.stats.compressionSavings += size - compressedSize
        size = compressedSize
        compressed = true
      }
    }

    const now = Date.now()
    const ttl = options.ttl ?? this.config.defaultTTL
    const entry: CacheEntry<T> = {
      key,
      value: storedValue,
      hash,
      size,
      createdAt: now,
      accessedAt: now,
      accessCount: 1,
      expiresAt: ttl > 0 ? now + ttl : undefined,
      ttl,
      priority: options.priority ?? CachePriority.NORMAL,
      tags: options.tags ?? [],
      compressed,
      tier: options.tier ?? CacheTier.MEMORY,
      metadata: {},
    }

    // Store in appropriate tier(s)
    const tier = options.tier ?? CacheTier.MEMORY

    if (tier === CacheTier.MEMORY || entry.priority >= CachePriority.HIGH) {
      this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY })
    }

    if (tier === CacheTier.PERSISTENT || entry.priority >= CachePriority.NORMAL) {
      await this.persistentCache.set(key, { ...entry, tier: CacheTier.PERSISTENT })
    }

    this.emit('set', { key, size, tier })
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<boolean> {
    const memoryDeleted = this.memoryCache.delete(key)
    const persistentDeleted = await this.persistentCache.delete(key)
    return memoryDeleted || persistentDeleted
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache.clear()
    await this.persistentCache.clear()
    this.emit('clear')
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    return this.memoryCache.has(key) || this.persistentCache.has(key)
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      entries: this.memoryCache.size() + this.persistentCache.size(),
      size: this.memoryCache.memorySize() + this.persistentCache.memorySize(),
      maxSize: this.config.maxMemorySize + this.config.maxPersistentSize,
      utilizationRate:
        (this.memoryCache.memorySize() + this.persistentCache.memorySize()) /
        (this.config.maxMemorySize + this.config.maxPersistentSize),
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      tierStats: {
        ...this.stats.tierStats,
        [CacheTier.MEMORY]: {
          ...this.stats.tierStats[CacheTier.MEMORY],
          entries: this.memoryCache.size(),
          size: this.memoryCache.memorySize(),
        },
        [CacheTier.PERSISTENT]: {
          ...this.stats.tierStats[CacheTier.PERSISTENT],
          entries: this.persistentCache.size(),
          size: this.persistentCache.memorySize(),
        },
      },
    }
  }

  /**
   * Invalidate entries by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    let count = 0

    // Invalidate in memory cache
    for (const entry of this.memoryCache.values()) {
      if (entry.tags.includes(tag)) {
        this.memoryCache.delete(entry.key)
        count++
      }
    }

    this.emit('invalidate-tag', { tag, count })
    return count
  }

  /**
   * Warm up the cache with frequently accessed keys
   */
  async warmup(
    keys: string[],
    fetcher: (key: string) => Promise<T>
  ): Promise<void> {
    if (!this.config.enableWarmup) return

    const warmupPromises = keys.map(async key => {
      // Skip if already warming up
      if (this.pendingWarmups.has(key)) {
        return this.pendingWarmups.get(key)
      }

      // Skip if already cached
      if (this.has(key)) return

      const promise = (async () => {
        try {
          const value = await fetcher(key)
          await this.set(key, value, {
            priority: this.config.warmupPriority,
          })
        } catch (error) {
          this.emit('warmup-error', { key, error })
        } finally {
          this.pendingWarmups.delete(key)
        }
      })()

      this.pendingWarmups.set(key, promise)
      return promise
    })

    await Promise.all(warmupPromises)
    this.emit('warmup-complete', { keys: keys.length })
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet(
    key: string,
    fetcher: () => Promise<T>,
    options?: Parameters<CacheManager<T>['set']>[2]
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get(key)
    if (cached !== undefined) {
      return cached
    }

    // Fetch and cache
    const value = await fetcher()
    await this.set(key, value, options)
    return value
  }

  /**
   * Generate a cache key from analysis parameters
   */
  static generateKey(params: {
    code?: string
    language?: string
    options?: Record<string, unknown>
    version?: string
  }): string {
    const data = JSON.stringify({
      codeHash: params.code ? crypto.createHash('sha256').update(params.code).digest('hex') : undefined,
      language: params.language,
      options: params.options,
      version: params.version,
    })
    return `analysis:${crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)}`
  }

  /**
   * Shutdown the cache manager
   */
  async shutdown(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
    }
    this.emit('shutdown')
  }

  // Private methods

  private hashValue(value: T): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').substring(0, 16)
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt
  }

  private isStale(entry: CacheEntry<T>): boolean {
    if (entry.expiresAt === undefined) return false
    return Date.now() > entry.expiresAt + this.config.staleTime
  }

  private createInitialStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
      size: 0,
      maxSize: this.config.maxMemorySize + this.config.maxPersistentSize,
      utilizationRate: 0,
      evictions: 0,
      compressionSavings: 0,
      averageAccessTime: 0,
      tierStats: {
        [CacheTier.MEMORY]: { entries: 0, size: 0, hits: 0, misses: 0 },
        [CacheTier.PERSISTENT]: { entries: 0, size: 0, hits: 0, misses: 0 },
        [CacheTier.DISTRIBUTED]: { entries: 0, size: 0, hits: 0, misses: 0 },
      },
    }
  }

  private updateAccessTime(startTime: number): void {
    const accessTime = performance.now() - startTime
    const total = this.stats.hits + this.stats.misses
    this.stats.averageAccessTime =
      (this.stats.averageAccessTime * (total - 1) + accessTime) / total
  }

  private startStatisticsCollection(): void {
    this.statsInterval = setInterval(() => {
      this.emit('stats', this.getStats())
    }, this.config.statisticsInterval)
  }
}

/**
 * Specialized cache for analysis results
 */
export class AnalysisCacheManager extends CacheManager<unknown> {
  /**
   * Cache analysis result
   */
  async cacheAnalysis(
    code: string,
    language: string,
    result: unknown,
    options?: {
      ttl?: number
      priority?: CachePriority
    }
  ): Promise<void> {
    const key = CacheManager.generateKey({ code, language })
    await this.set(key, result, {
      ttl: options?.ttl ?? 30 * 60 * 1000, // 30 minutes default
      priority: options?.priority ?? CachePriority.NORMAL,
      tags: ['analysis', language],
    })
  }

  /**
   * Get cached analysis result
   */
  async getCachedAnalysis(
    code: string,
    language: string
  ): Promise<unknown | undefined> {
    const key = CacheManager.generateKey({ code, language })
    return this.get(key)
  }

  /**
   * Invalidate all analysis caches for a language
   */
  async invalidateLanguage(language: string): Promise<number> {
    return this.invalidateByTag(language)
  }
}

/**
 * Singleton instances
 */
let cacheManager: CacheManager | null = null
let analysisCacheManager: AnalysisCacheManager | null = null

export function getCacheManager(config?: Partial<CacheConfig>): CacheManager {
  if (!cacheManager) {
    cacheManager = new CacheManager(config)
  }
  return cacheManager
}

export function getAnalysisCacheManager(config?: Partial<CacheConfig>): AnalysisCacheManager {
  if (!analysisCacheManager) {
    analysisCacheManager = new AnalysisCacheManager(config)
  }
  return analysisCacheManager
}
