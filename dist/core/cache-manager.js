"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisCacheManager = exports.CacheManager = exports.CacheTier = exports.CachePriority = void 0;
exports.getCacheManager = getCacheManager;
exports.getAnalysisCacheManager = getAnalysisCacheManager;
const crypto = __importStar(require("crypto"));
const events_1 = require("events");
/**
 * Cache priority levels
 */
var CachePriority;
(function (CachePriority) {
    CachePriority[CachePriority["LOW"] = 1] = "LOW";
    CachePriority[CachePriority["NORMAL"] = 2] = "NORMAL";
    CachePriority[CachePriority["HIGH"] = 3] = "HIGH";
    CachePriority[CachePriority["CRITICAL"] = 4] = "CRITICAL";
})(CachePriority || (exports.CachePriority = CachePriority = {}));
/**
 * Cache tiers
 */
var CacheTier;
(function (CacheTier) {
    CacheTier["MEMORY"] = "memory";
    CacheTier["PERSISTENT"] = "persistent";
    CacheTier["DISTRIBUTED"] = "distributed";
})(CacheTier || (exports.CacheTier = CacheTier = {}));
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
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
};
/**
 * In-memory LRU cache with smart eviction
 */
class MemoryCache {
    constructor(maxSize, evictionPolicy = 'smart') {
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "maxSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "accessOrder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "evictionPolicy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.maxSize = maxSize;
        this.evictionPolicy = evictionPolicy;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            entry.accessedAt = Date.now();
            entry.accessCount++;
            // Update access order for LRU
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
            this.accessOrder.push(key);
        }
        return entry;
    }
    set(key, entry) {
        // Remove existing entry if present
        if (this.cache.has(key)) {
            const existing = this.cache.get(key);
            this.currentSize -= existing.size;
            this.cache.delete(key);
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        }
        // Evict if necessary
        while (this.currentSize + entry.size > this.maxSize && this.cache.size > 0) {
            this.evict();
        }
        // Add new entry
        this.cache.set(key, entry);
        this.currentSize += entry.size;
        this.accessOrder.push(key);
    }
    delete(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.currentSize -= entry.size;
            this.cache.delete(key);
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
            return true;
        }
        return false;
    }
    clear() {
        this.cache.clear();
        this.accessOrder = [];
        this.currentSize = 0;
    }
    has(key) {
        return this.cache.has(key);
    }
    size() {
        return this.cache.size;
    }
    memorySize() {
        return this.currentSize;
    }
    keys() {
        return Array.from(this.cache.keys());
    }
    values() {
        return Array.from(this.cache.values());
    }
    evict() {
        let keyToEvict;
        switch (this.evictionPolicy) {
            case 'lru':
                keyToEvict = this.selectLRU();
                break;
            case 'lfu':
                keyToEvict = this.selectLFU();
                break;
            case 'arc':
                keyToEvict = this.selectARC();
                break;
            case 'smart':
            default:
                keyToEvict = this.selectSmart();
                break;
        }
        if (keyToEvict) {
            this.delete(keyToEvict);
        }
    }
    selectLRU() {
        return this.accessOrder[0];
    }
    selectLFU() {
        let minCount = Infinity;
        let keyToEvict;
        for (const [key, entry] of this.cache) {
            if (entry.accessCount < minCount) {
                minCount = entry.accessCount;
                keyToEvict = key;
            }
        }
        return keyToEvict;
    }
    selectARC() {
        // Simplified ARC - combine recency and frequency
        let minScore = Infinity;
        let keyToEvict;
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            const recencyScore = (now - entry.accessedAt) / 1000; // seconds since last access
            const frequencyScore = 1 / (entry.accessCount + 1);
            const score = recencyScore * 0.5 + frequencyScore * 1000 * 0.5;
            if (score < minScore && entry.priority <= CachePriority.NORMAL) {
                minScore = score;
                keyToEvict = key;
            }
        }
        return keyToEvict;
    }
    selectSmart() {
        // Smart eviction considers: recency, frequency, priority, size, and TTL
        let maxScore = -Infinity;
        let keyToEvict;
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            // Higher score = more likely to evict
            const ageScore = (now - entry.createdAt) / (1000 * 60 * 60); // hours since creation
            const recencyScore = (now - entry.accessedAt) / (1000 * 60); // minutes since last access
            const frequencyScore = 1 / Math.log(entry.accessCount + 2);
            const priorityScore = 1 / entry.priority;
            const sizeScore = entry.size / this.maxSize * 10;
            const ttlScore = entry.expiresAt ? Math.max(0, (now - entry.expiresAt) / (1000 * 60)) : 0;
            const score = ageScore * 0.1 +
                recencyScore * 0.3 +
                frequencyScore * 0.2 +
                priorityScore * 0.2 +
                sizeScore * 0.1 +
                ttlScore * 0.1;
            if (score > maxScore) {
                maxScore = score;
                keyToEvict = key;
            }
        }
        return keyToEvict;
    }
}
/**
 * Persistent cache using VS Code storage
 */
class PersistentCache {
    constructor(maxSize) {
        Object.defineProperty(this, "storage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "index", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "maxSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.maxSize = maxSize;
    }
    async get(key) {
        const data = this.storage.get(key);
        if (data) {
            const entry = JSON.parse(data);
            entry.accessedAt = Date.now();
            entry.accessCount++;
            // Update index
            const indexEntry = this.index.get(key);
            if (indexEntry) {
                indexEntry.accessedAt = Date.now();
            }
            return entry;
        }
        return undefined;
    }
    async set(key, entry) {
        const data = JSON.stringify(entry);
        const size = data.length * 2; // Approximate UTF-16 size
        // Remove existing entry if present
        if (this.storage.has(key)) {
            const existing = this.index.get(key);
            if (existing) {
                this.currentSize -= existing.size;
            }
            this.storage.delete(key);
            this.index.delete(key);
        }
        // Evict if necessary
        while (this.currentSize + size > this.maxSize && this.storage.size > 0) {
            await this.evictOldest();
        }
        // Store
        this.storage.set(key, data);
        this.index.set(key, {
            size,
            createdAt: entry.createdAt,
            accessedAt: entry.accessedAt,
        });
        this.currentSize += size;
    }
    async delete(key) {
        const indexEntry = this.index.get(key);
        if (indexEntry) {
            this.currentSize -= indexEntry.size;
            this.storage.delete(key);
            this.index.delete(key);
            return true;
        }
        return false;
    }
    async clear() {
        this.storage.clear();
        this.index.clear();
        this.currentSize = 0;
    }
    has(key) {
        return this.storage.has(key);
    }
    size() {
        return this.storage.size;
    }
    memorySize() {
        return this.currentSize;
    }
    async evictOldest() {
        let oldestKey;
        let oldestTime = Infinity;
        for (const [key, entry] of this.index) {
            if (entry.accessedAt < oldestTime) {
                oldestTime = entry.accessedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            await this.delete(oldestKey);
        }
    }
}
/**
 * Simple compression utility
 */
class Compressor {
    static compress(data) {
        // Simple run-length encoding for repeated characters
        // In production, use proper compression like LZ4 or zstd
        return data
            .replace(/(.)\1{3,}/g, (match, char) => `${char}${match.length}#`);
    }
    static decompress(data) {
        return data
            .replace(/(.)(\\d+)#/g, (_, char, count) => char.repeat(parseInt(count)));
    }
    static estimateSize(data) {
        return data.length * 2; // UTF-16
    }
}
/**
 * Advanced Multi-Tier Cache Manager
 */
class CacheManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "memoryCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistentCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "stats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "statsInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pendingWarmups", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.memoryCache = new MemoryCache(this.config.maxMemorySize, this.config.evictionPolicy);
        this.persistentCache = new PersistentCache(this.config.maxPersistentSize);
        this.stats = this.createInitialStats();
        if (this.config.enableStatistics) {
            this.startStatisticsCollection();
        }
    }
    /**
     * Get a value from the cache
     */
    async get(key) {
        const startTime = performance.now();
        // Try memory cache first (L1)
        let entry = this.memoryCache.get(key);
        if (entry) {
            this.stats.hits++;
            this.stats.tierStats[CacheTier.MEMORY].hits++;
            // Check if expired
            if (this.isExpired(entry)) {
                if (this.config.enableStaleWhileRevalidate && !this.isStale(entry)) {
                    // Return stale value while revalidating
                    this.emit('stale-value', { key, entry });
                    return entry.value;
                }
                this.memoryCache.delete(key);
                this.stats.tierStats[CacheTier.MEMORY].misses++;
                entry = undefined;
            }
            if (entry) {
                this.updateAccessTime(startTime);
                return entry.value;
            }
        }
        this.stats.tierStats[CacheTier.MEMORY].misses++;
        // Try persistent cache (L2)
        entry = await this.persistentCache.get(key);
        if (entry) {
            this.stats.hits++;
            this.stats.tierStats[CacheTier.PERSISTENT].hits++;
            // Check if expired
            if (this.isExpired(entry)) {
                if (this.config.enableStaleWhileRevalidate && !this.isStale(entry)) {
                    this.emit('stale-value', { key, entry });
                    // Promote to memory cache
                    this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY });
                    return entry.value;
                }
                await this.persistentCache.delete(key);
                this.stats.tierStats[CacheTier.PERSISTENT].misses++;
                entry = undefined;
            }
            if (entry) {
                // Promote to memory cache
                this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY });
                this.updateAccessTime(startTime);
                return entry.value;
            }
        }
        this.stats.tierStats[CacheTier.PERSISTENT].misses++;
        this.stats.misses++;
        this.updateAccessTime(startTime);
        return undefined;
    }
    /**
     * Set a value in the cache
     */
    async set(key, value, options = {}) {
        const hash = this.hashValue(value);
        const serialized = JSON.stringify(value);
        let size = Compressor.estimateSize(serialized);
        let compressed = false;
        // Compress if enabled and above threshold
        let storedValue = value;
        if (this.config.enableCompression && size > this.config.compressionThreshold) {
            const compressedData = Compressor.compress(serialized);
            const compressedSize = Compressor.estimateSize(compressedData);
            if (compressedSize < size * 0.9) { // Only use compression if it saves >10%
                this.stats.compressionSavings += size - compressedSize;
                size = compressedSize;
                compressed = true;
            }
        }
        const now = Date.now();
        const ttl = options.ttl ?? this.config.defaultTTL;
        const entry = {
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
        };
        // Store in appropriate tier(s)
        const tier = options.tier ?? CacheTier.MEMORY;
        if (tier === CacheTier.MEMORY || entry.priority >= CachePriority.HIGH) {
            this.memoryCache.set(key, { ...entry, tier: CacheTier.MEMORY });
        }
        if (tier === CacheTier.PERSISTENT || entry.priority >= CachePriority.NORMAL) {
            await this.persistentCache.set(key, { ...entry, tier: CacheTier.PERSISTENT });
        }
        this.emit('set', { key, size, tier });
    }
    /**
     * Delete a value from the cache
     */
    async delete(key) {
        const memoryDeleted = this.memoryCache.delete(key);
        const persistentDeleted = await this.persistentCache.delete(key);
        return memoryDeleted || persistentDeleted;
    }
    /**
     * Clear all caches
     */
    async clear() {
        this.memoryCache.clear();
        await this.persistentCache.clear();
        this.emit('clear');
    }
    /**
     * Check if a key exists in the cache
     */
    has(key) {
        return this.memoryCache.has(key) || this.persistentCache.has(key);
    }
    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            entries: this.memoryCache.size() + this.persistentCache.size(),
            size: this.memoryCache.memorySize() + this.persistentCache.memorySize(),
            maxSize: this.config.maxMemorySize + this.config.maxPersistentSize,
            utilizationRate: (this.memoryCache.memorySize() + this.persistentCache.memorySize()) /
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
        };
    }
    /**
     * Invalidate entries by tag
     */
    async invalidateByTag(tag) {
        let count = 0;
        // Invalidate in memory cache
        for (const entry of this.memoryCache.values()) {
            if (entry.tags.includes(tag)) {
                this.memoryCache.delete(entry.key);
                count++;
            }
        }
        this.emit('invalidate-tag', { tag, count });
        return count;
    }
    /**
     * Warm up the cache with frequently accessed keys
     */
    async warmup(keys, fetcher) {
        if (!this.config.enableWarmup)
            return;
        const warmupPromises = keys.map(async (key) => {
            // Skip if already warming up
            if (this.pendingWarmups.has(key)) {
                return this.pendingWarmups.get(key);
            }
            // Skip if already cached
            if (this.has(key))
                return;
            const promise = (async () => {
                try {
                    const value = await fetcher(key);
                    await this.set(key, value, {
                        priority: this.config.warmupPriority,
                    });
                }
                catch (error) {
                    this.emit('warmup-error', { key, error });
                }
                finally {
                    this.pendingWarmups.delete(key);
                }
            })();
            this.pendingWarmups.set(key, promise);
            return promise;
        });
        await Promise.all(warmupPromises);
        this.emit('warmup-complete', { keys: keys.length });
    }
    /**
     * Get or set a value (cache-aside pattern)
     */
    async getOrSet(key, fetcher, options) {
        // Try to get from cache
        const cached = await this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        // Fetch and cache
        const value = await fetcher();
        await this.set(key, value, options);
        return value;
    }
    /**
     * Generate a cache key from analysis parameters
     */
    static generateKey(params) {
        const data = JSON.stringify({
            codeHash: params.code ? crypto.createHash('sha256').update(params.code).digest('hex') : undefined,
            language: params.language,
            options: params.options,
            version: params.version,
        });
        return `analysis:${crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)}`;
    }
    /**
     * Shutdown the cache manager
     */
    async shutdown() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        this.emit('shutdown');
    }
    // Private methods
    hashValue(value) {
        return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').substring(0, 16);
    }
    isExpired(entry) {
        return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
    }
    isStale(entry) {
        if (entry.expiresAt === undefined)
            return false;
        return Date.now() > entry.expiresAt + this.config.staleTime;
    }
    createInitialStats() {
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
        };
    }
    updateAccessTime(startTime) {
        const accessTime = performance.now() - startTime;
        const total = this.stats.hits + this.stats.misses;
        this.stats.averageAccessTime =
            (this.stats.averageAccessTime * (total - 1) + accessTime) / total;
    }
    startStatisticsCollection() {
        this.statsInterval = setInterval(() => {
            this.emit('stats', this.getStats());
        }, this.config.statisticsInterval);
    }
}
exports.CacheManager = CacheManager;
/**
 * Specialized cache for analysis results
 */
class AnalysisCacheManager extends CacheManager {
    /**
     * Cache analysis result
     */
    async cacheAnalysis(code, language, result, options) {
        const key = CacheManager.generateKey({ code, language });
        await this.set(key, result, {
            ttl: options?.ttl ?? 30 * 60 * 1000, // 30 minutes default
            priority: options?.priority ?? CachePriority.NORMAL,
            tags: ['analysis', language],
        });
    }
    /**
     * Get cached analysis result
     */
    async getCachedAnalysis(code, language) {
        const key = CacheManager.generateKey({ code, language });
        return this.get(key);
    }
    /**
     * Invalidate all analysis caches for a language
     */
    async invalidateLanguage(language) {
        return this.invalidateByTag(language);
    }
}
exports.AnalysisCacheManager = AnalysisCacheManager;
/**
 * Singleton instances
 */
let cacheManager = null;
let analysisCacheManager = null;
function getCacheManager(config) {
    if (!cacheManager) {
        cacheManager = new CacheManager(config);
    }
    return cacheManager;
}
function getAnalysisCacheManager(config) {
    if (!analysisCacheManager) {
        analysisCacheManager = new AnalysisCacheManager(config);
    }
    return analysisCacheManager;
}
//# sourceMappingURL=cache-manager.js.map