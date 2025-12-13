/**
 * Unit tests for CacheService
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CACHE_DEFAULTS } from '../constants'
import { CacheService } from '../services/cache-service'

suite('CacheService Test Suite', () => {
  let cacheService: CacheService
  let mockContext: vscode.ExtensionContext

  // Create a mock ExtensionContext for testing
  function createMockContext(): vscode.ExtensionContext {
    const workspaceState = new Map<string, any>()

    return {
      workspaceState: {
        get: <T>(key: string, defaultValue?: T) =>
          workspaceState.get(key) ?? defaultValue,
        update: async (key: string, value: any) => {
          workspaceState.set(key, value)
        },
        keys: () => Array.from(workspaceState.keys()),
      },
    } as any
  }

  setup(() => {
    mockContext = createMockContext()
    cacheService = new CacheService(mockContext)
  })

  teardown(() => {
    cacheService.dispose()
  })

  suite('Basic Cache Operations', () => {
    test('should store and retrieve values', () => {
      cacheService.set('key1', 'value1')
      const value = cacheService.get<string>('key1')
      assert.strictEqual(value, 'value1')
    })

    test('should return undefined for non-existent keys', () => {
      const value = cacheService.get<string>('nonexistent')
      assert.strictEqual(value, undefined)
    })

    test('should delete values', () => {
      cacheService.set('key1', 'value1')
      cacheService.delete('key1')
      const value = cacheService.get<string>('key1')
      assert.strictEqual(value, undefined)
    })

    test('should clear all values', () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')
      cacheService.clear()
      assert.strictEqual(cacheService.get<string>('key1'), undefined)
      assert.strictEqual(cacheService.get<string>('key2'), undefined)
    })

    test('should check if key exists', () => {
      cacheService.set('key1', 'value1')
      assert.strictEqual(cacheService.has('key1'), true)
      assert.strictEqual(cacheService.has('nonexistent'), false)
    })

    test('should handle different data types', () => {
      cacheService.set('string', 'test')
      cacheService.set('number', 42)
      cacheService.set('boolean', true)
      cacheService.set('object', { foo: 'bar' })
      cacheService.set('array', [1, 2, 3])

      assert.strictEqual(cacheService.get<string>('string'), 'test')
      assert.strictEqual(cacheService.get<number>('number'), 42)
      assert.strictEqual(cacheService.get<boolean>('boolean'), true)
      assert.deepStrictEqual(cacheService.get<any>('object'), { foo: 'bar' })
      assert.deepStrictEqual(cacheService.get<any>('array'), [1, 2, 3])
    })
  })

  suite('TTL (Time-To-Live) Support', () => {
    test('should expire entries after TTL', async () => {
      const shortTTL = 100 // 100ms
      cacheService.set('key1', 'value1', shortTTL)

      // Should exist immediately
      assert.strictEqual(cacheService.get<string>('key1'), 'value1')

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should be expired
      assert.strictEqual(cacheService.get<string>('key1'), undefined)
    })

    test('should use default TTL when not specified', () => {
      cacheService.set('key1', 'value1')
      assert.strictEqual(cacheService.has('key1'), true)
    })

    test('should not return expired entries with has()', async () => {
      const shortTTL = 100
      cacheService.set('key1', 'value1', shortTTL)

      assert.strictEqual(cacheService.has('key1'), true)

      await new Promise(resolve => setTimeout(resolve, 150))

      assert.strictEqual(cacheService.has('key1'), false)
    })

    test('should handle very short TTL', async () => {
      cacheService.set('key1', 'value1', 1) // 1ms TTL

      await new Promise(resolve => setTimeout(resolve, 10))

      assert.strictEqual(cacheService.get<string>('key1'), undefined)
    })

    test('should handle very long TTL', () => {
      const longTTL = 24 * 60 * 60 * 1000 // 24 hours
      cacheService.set('key1', 'value1', longTTL)

      assert.strictEqual(cacheService.get<string>('key1'), 'value1')
    })
  })

  suite('LRU (Least Recently Used) Eviction', () => {
    test('should evict least recently used entry when cache is full', () => {
      // Fill cache to max entries
      const maxEntries = CACHE_DEFAULTS.maxEntries

      for (let i = 0; i < maxEntries; i++) {
        cacheService.set(`key${i}`, `value${i}`)
      }

      // Access key0 to make it recently used
      cacheService.get('key0')

      // Add one more entry, should evict key1 (least recently used)
      cacheService.set('newKey', 'newValue')

      assert.strictEqual(cacheService.get<string>('key0'), 'value0') // Should still exist
      assert.strictEqual(cacheService.get<string>('key1'), undefined) // Should be evicted
      assert.strictEqual(cacheService.get<string>('newKey'), 'newValue')
    })

    test('should update access order on get()', () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')
      cacheService.set('key3', 'value3')

      // Access key1 to make it recently used
      cacheService.get('key1')

      // Fill cache to trigger eviction
      const maxEntries = CACHE_DEFAULTS.maxEntries
      for (let i = 4; i < maxEntries + 1; i++) {
        cacheService.set(`key${i}`, `value${i}`)
      }

      // Add one more to trigger eviction
      cacheService.set('trigger', 'eviction')

      // key1 should still exist because it was accessed recently
      assert.strictEqual(cacheService.get<string>('key1'), 'value1')
    })

    test('should update access order on set() for existing keys', () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')

      // Update key1
      cacheService.set('key1', 'updated')

      // Fill cache
      const maxEntries = CACHE_DEFAULTS.maxEntries
      for (let i = 3; i < maxEntries + 1; i++) {
        cacheService.set(`key${i}`, `value${i}`)
      }

      // key1 should still exist because it was updated recently
      assert.strictEqual(cacheService.get<string>('key1'), 'updated')
    })
  })

  suite('Cache Statistics', () => {
    test('should track cache hits', () => {
      cacheService.set('key1', 'value1')
      cacheService.get('key1')
      cacheService.get('key1')

      const stats = cacheService.getStats()
      assert.strictEqual(stats.hits, 2)
    })

    test('should track cache misses', () => {
      cacheService.get('nonexistent1')
      cacheService.get('nonexistent2')

      const stats = cacheService.getStats()
      assert.strictEqual(stats.misses, 2)
    })

    test('should calculate hit rate correctly', () => {
      cacheService.set('key1', 'value1')
      cacheService.get('key1') // hit
      cacheService.get('key1') // hit
      cacheService.get('nonexistent') // miss

      const stats = cacheService.getStats()
      assert.strictEqual(stats.hits, 2)
      assert.strictEqual(stats.misses, 1)
      assert.strictEqual(stats.hitRate, 2 / 3)
    })

    test('should track cache size', () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')

      const stats = cacheService.getStats()
      assert.strictEqual(stats.size, 2)
    })

    test('should reset stats on clear()', () => {
      cacheService.set('key1', 'value1')
      cacheService.get('key1')
      cacheService.get('nonexistent')

      cacheService.clear()

      const stats = cacheService.getStats()
      assert.strictEqual(stats.size, 0)
      assert.strictEqual(stats.hits, 0)
      assert.strictEqual(stats.misses, 0)
      assert.strictEqual(stats.hitRate, 0)
    })

    test('should handle zero requests for hit rate', () => {
      const stats = cacheService.getStats()
      assert.strictEqual(stats.hitRate, 0)
    })

    test('should count expired entries as misses', async () => {
      cacheService.set('key1', 'value1', 50)

      await new Promise(resolve => setTimeout(resolve, 100))

      cacheService.get('key1') // Should be a miss

      const stats = cacheService.getStats()
      assert.strictEqual(stats.misses, 1)
    })
  })

  suite('Cache Persistence', () => {
    test('should persist cache to workspace storage', async () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')

      await cacheService.persist()

      const cacheData = mockContext.workspaceState.get('cacheData')
      assert.ok(cacheData)
    })

    test('should restore cache from workspace storage', async () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')

      await cacheService.persist()

      // Create new cache service instance
      const newCacheService = new CacheService(mockContext)
      await newCacheService.restore()

      assert.strictEqual(newCacheService.get<string>('key1'), 'value1')
      assert.strictEqual(newCacheService.get<string>('key2'), 'value2')

      newCacheService.dispose()
    })

    test('should not persist expired entries', async () => {
      cacheService.set('key1', 'value1', 50)
      cacheService.set('key2', 'value2', 10000)

      await new Promise(resolve => setTimeout(resolve, 100))

      await cacheService.persist()

      const newCacheService = new CacheService(mockContext)
      await newCacheService.restore()

      assert.strictEqual(newCacheService.get<string>('key1'), undefined)
      assert.strictEqual(newCacheService.get<string>('key2'), 'value2')

      newCacheService.dispose()
    })

    test('should restore cache statistics', async () => {
      cacheService.set('key1', 'value1')
      cacheService.get('key1')
      cacheService.get('nonexistent')

      await cacheService.persist()

      const newCacheService = new CacheService(mockContext)
      await newCacheService.restore()

      const stats = newCacheService.getStats()
      assert.strictEqual(stats.hits, 1)
      assert.strictEqual(stats.misses, 1)

      newCacheService.dispose()
    })

    test('should restore access order', async () => {
      cacheService.set('key1', 'value1')
      cacheService.set('key2', 'value2')
      cacheService.get('key1') // Make key1 more recently used

      await cacheService.persist()

      const newCacheService = new CacheService(mockContext)
      await newCacheService.restore()

      // Both keys should exist
      assert.strictEqual(newCacheService.get<string>('key1'), 'value1')
      assert.strictEqual(newCacheService.get<string>('key2'), 'value2')

      newCacheService.dispose()
    })

    test('should handle persistence errors gracefully', async () => {
      const badContext = {
        workspaceState: {
          update: async () => {
            throw new Error('Storage error')
          },
        },
      } as any

      const badCacheService = new CacheService(badContext)
      badCacheService.set('key1', 'value1')

      // Should not throw
      await assert.doesNotReject(async () => {
        await badCacheService.persist()
      })

      badCacheService.dispose()
    })

    test('should handle restoration errors gracefully', async () => {
      const badContext = {
        workspaceState: {
          get: () => {
            throw new Error('Storage error')
          },
        },
      } as any

      const badCacheService = new CacheService(badContext)

      // Should not throw
      await assert.doesNotReject(async () => {
        await badCacheService.restore()
      })

      badCacheService.dispose()
    })

    test('should throw error when persisting without context', async () => {
      const contextlessCacheService = new CacheService()

      await assert.rejects(
        async () => await contextlessCacheService.persist(),
        /Cannot persist cache: ExtensionContext not provided/
      )

      contextlessCacheService.dispose()
    })

    test('should throw error when restoring without context', async () => {
      const contextlessCacheService = new CacheService()

      await assert.rejects(
        async () => await contextlessCacheService.restore(),
        /Cannot restore cache: ExtensionContext not provided/
      )

      contextlessCacheService.dispose()
    })
  })

  suite('Resource Management', () => {
    test('should dispose cleanup timer', () => {
      const service = new CacheService()
      service.dispose()
      // If this doesn't throw, disposal worked
      assert.ok(true)
    })

    test('should allow multiple dispose calls', () => {
      const service = new CacheService()
      service.dispose()
      service.dispose()
      // Should not throw
      assert.ok(true)
    })
  })

  suite('Edge Cases', () => {
    test('should handle null values', () => {
      cacheService.set('key1', null)
      assert.strictEqual(cacheService.get('key1'), null)
    })

    test('should handle undefined values', () => {
      cacheService.set('key1', undefined)
      assert.strictEqual(cacheService.get('key1'), undefined)
    })

    test('should handle empty string keys', () => {
      cacheService.set('', 'value')
      assert.strictEqual(cacheService.get(''), 'value')
    })

    test('should handle special characters in keys', () => {
      const specialKey = 'key!@#$%^&*()_+-=[]{}|;:,.<>?'
      cacheService.set(specialKey, 'value')
      assert.strictEqual(cacheService.get(specialKey), 'value')
    })

    test('should handle very long keys', () => {
      const longKey = 'k'.repeat(1000)
      cacheService.set(longKey, 'value')
      assert.strictEqual(cacheService.get(longKey), 'value')
    })

    test('should handle very large values', () => {
      const largeValue = 'v'.repeat(10000)
      cacheService.set('key1', largeValue)
      assert.strictEqual(cacheService.get('key1'), largeValue)
    })

    test('should handle complex nested objects', () => {
      const complexObject = {
        a: { b: { c: { d: 'deep' } } },
        array: [1, 2, { nested: true }],
        date: new Date().toISOString(),
      }
      cacheService.set('complex', complexObject)
      assert.deepStrictEqual(cacheService.get('complex'), complexObject)
    })
  })
})
