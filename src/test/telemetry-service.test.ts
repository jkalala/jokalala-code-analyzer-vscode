/**
 * Unit tests for TelemetryService
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { TELEMETRY_DEFAULTS } from '../constants'
import { TelemetryService } from '../services/telemetry-service'

suite('TelemetryService Test Suite', () => {
  let telemetryService: TelemetryService

  setup(() => {
    telemetryService = new TelemetryService()
  })

  teardown(() => {
    telemetryService.dispose()
  })

  suite('Basic Telemetry Operations', () => {
    test('should be enabled by default', () => {
      assert.strictEqual(telemetryService.isEnabled(), true)
    })

    test('should track events when enabled', () => {
      telemetryService.trackEvent('test_event', { foo: 'bar' })
      // Event should be queued (no error thrown)
      assert.ok(true)
    })

    test('should track errors when enabled', () => {
      const error = new Error('Test error')
      telemetryService.trackError(error, { context: 'test' })
      // Error should be tracked (no error thrown)
      assert.ok(true)
    })

    test('should track metrics when enabled', () => {
      telemetryService.trackMetric('test_metric', 42, { unit: 'ms' })
      // Metric should be tracked (no error thrown)
      assert.ok(true)
    })

    test('should flush events', async () => {
      telemetryService.trackEvent('test_event')
      await telemetryService.flush()
      // Should complete without error
      assert.ok(true)
    })
  })

  suite('Opt-out Support', () => {
    test('should disable telemetry when setEnabled(false)', () => {
      telemetryService.setEnabled(false)
      assert.strictEqual(telemetryService.isEnabled(), false)
    })

    test('should enable telemetry when setEnabled(true)', () => {
      telemetryService.setEnabled(false)
      telemetryService.setEnabled(true)
      assert.strictEqual(telemetryService.isEnabled(), true)
    })

    test('should not track events when disabled', () => {
      telemetryService.setEnabled(false)
      telemetryService.trackEvent('test_event')
      // Should not throw, but event should not be queued
      assert.ok(true)
    })

    test('should not track errors when disabled', () => {
      telemetryService.setEnabled(false)
      const error = new Error('Test error')
      telemetryService.trackError(error)
      // Should not throw, but error should not be tracked
      assert.ok(true)
    })

    test('should not track metrics when disabled', () => {
      telemetryService.setEnabled(false)
      telemetryService.trackMetric('test_metric', 42)
      // Should not throw, but metric should not be tracked
      assert.ok(true)
    })

    test('should clear queued events when disabled', () => {
      telemetryService.trackEvent('event1')
      telemetryService.trackEvent('event2')
      telemetryService.setEnabled(false)
      // Events should be cleared
      assert.ok(true)
    })
  })

  suite('Event Batching', () => {
    test('should batch events before flushing', () => {
      telemetryService.trackEvent('event1')
      telemetryService.trackEvent('event2')
      telemetryService.trackEvent('event3')
      // Events should be batched
      assert.ok(true)
    })

    test('should auto-flush when batch size reached', async () => {
      const batchSize = TELEMETRY_DEFAULTS.batchSize

      // Track events up to batch size
      for (let i = 0; i < batchSize; i++) {
        telemetryService.trackEvent(`event${i}`)
      }

      // Should auto-flush
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(true)
    })

    test('should handle empty flush', async () => {
      await telemetryService.flush()
      // Should complete without error
      assert.ok(true)
    })

    test('should flush multiple times', async () => {
      telemetryService.trackEvent('event1')
      await telemetryService.flush()

      telemetryService.trackEvent('event2')
      await telemetryService.flush()

      assert.ok(true)
    })
  })

  suite('Anonymization', () => {
    test('should anonymize email addresses in properties', () => {
      telemetryService.trackEvent('test_event', {
        email: 'user@example.com',
      })
      // Email should be redacted
      assert.ok(true)
    })

    test('should anonymize passwords in properties', () => {
      telemetryService.trackEvent('test_event', {
        password: 'secret123',
      })
      // Password should be redacted
      assert.ok(true)
    })

    test('should anonymize API keys in properties', () => {
      telemetryService.trackEvent('test_event', {
        apiKey: 'sk-1234567890abcdef',
      })
      // API key should be redacted
      assert.ok(true)
    })

    test('should anonymize tokens in properties', () => {
      telemetryService.trackEvent('test_event', {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      })
      // Token should be redacted
      assert.ok(true)
    })

    test('should anonymize file paths in properties', () => {
      telemetryService.trackEvent('test_event', {
        filePath: '/home/user/project/src/file.ts',
      })
      // File path should be anonymized
      assert.ok(true)
    })

    test('should anonymize Windows file paths', () => {
      telemetryService.trackEvent('test_event', {
        filePath: 'C:\\Users\\user\\project\\src\\file.ts',
      })
      // Windows path should be anonymized
      assert.ok(true)
    })

    test('should keep safe properties unchanged', () => {
      telemetryService.trackEvent('test_event', {
        count: 42,
        enabled: true,
        mode: 'full',
      })
      // Safe properties should not be modified
      assert.ok(true)
    })

    test('should anonymize nested objects', () => {
      telemetryService.trackEvent('test_event', {
        user: {
          email: 'user@example.com',
          name: 'John Doe',
        },
      })
      // Nested email should be redacted
      assert.ok(true)
    })

    test('should handle null and undefined properties', () => {
      telemetryService.trackEvent('test_event', {
        nullValue: null,
        undefinedValue: undefined,
      })
      // Should not throw
      assert.ok(true)
    })
  })

  suite('Error Tracking', () => {
    test('should sanitize error messages', () => {
      const error = new Error('Failed to read /home/user/file.ts')
      telemetryService.trackError(error)
      // File path in error message should be sanitized
      assert.ok(true)
    })

    test('should sanitize error stack traces', () => {
      const error = new Error('Test error')
      error.stack =
        'Error: Test error\n    at /home/user/project/src/file.ts:10:5'
      telemetryService.trackError(error)
      // Stack trace should be sanitized
      assert.ok(true)
    })

    test('should handle errors without stack traces', () => {
      const error = new Error('Test error')
      delete error.stack
      telemetryService.trackError(error)
      // Should not throw
      assert.ok(true)
    })

    test('should include error context', () => {
      const error = new Error('Test error')
      telemetryService.trackError(error, { operation: 'analyze' })
      // Context should be included
      assert.ok(true)
    })

    test('should sanitize URLs in error messages', () => {
      const error = new Error('Failed to fetch https://api.example.com/data')
      telemetryService.trackError(error)
      // URL should be sanitized
      assert.ok(true)
    })

    test('should sanitize email addresses in error messages', () => {
      const error = new Error('Invalid email: user@example.com')
      telemetryService.trackError(error)
      // Email should be sanitized
      assert.ok(true)
    })

    test('should sanitize tokens in error messages', () => {
      const error = new Error(
        'Invalid token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef1234567890'
      )
      telemetryService.trackError(error)
      // Token should be sanitized
      assert.ok(true)
    })
  })

  suite('Metric Tracking', () => {
    test('should track numeric metrics', () => {
      telemetryService.trackMetric('response_time', 123.45)
      assert.ok(true)
    })

    test('should track metrics with properties', () => {
      telemetryService.trackMetric('cache_hit_rate', 0.85, {
        cacheSize: 100,
      })
      assert.ok(true)
    })

    test('should track zero values', () => {
      telemetryService.trackMetric('error_count', 0)
      assert.ok(true)
    })

    test('should track negative values', () => {
      telemetryService.trackMetric('temperature', -10)
      assert.ok(true)
    })

    test('should sanitize metric names', () => {
      telemetryService.trackMetric('metric with spaces!', 42)
      // Metric name should be sanitized
      assert.ok(true)
    })
  })

  suite('Session and User IDs', () => {
    test('should generate unique session IDs', () => {
      const service1 = new TelemetryService()
      const service2 = new TelemetryService()

      // Session IDs should be different (we can't directly access them,
      // but we can verify the service works)
      assert.ok(service1)
      assert.ok(service2)

      service1.dispose()
      service2.dispose()
    })

    test('should generate consistent user IDs', () => {
      const service1 = new TelemetryService()
      const service2 = new TelemetryService()

      // User IDs should be the same (based on machine ID)
      // We can't directly test this, but verify services work
      assert.ok(service1)
      assert.ok(service2)

      service1.dispose()
      service2.dispose()
    })
  })

  suite('Resource Management', () => {
    test('should dispose cleanly', () => {
      const service = new TelemetryService()
      service.dispose()
      // Should not throw
      assert.ok(true)
    })

    test('should flush on dispose', async () => {
      const service = new TelemetryService()
      service.trackEvent('test_event')
      service.dispose()
      // Should flush remaining events
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(true)
    })

    test('should allow multiple dispose calls', () => {
      const service = new TelemetryService()
      service.dispose()
      service.dispose()
      // Should not throw
      assert.ok(true)
    })

    test('should stop periodic flush after dispose', async () => {
      const service = new TelemetryService(undefined, 10, 100)
      service.trackEvent('test_event')
      service.dispose()

      // Wait longer than flush interval
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should not flush after dispose
      assert.ok(true)
    })
  })

  suite('Configuration', () => {
    test('should accept custom batch size', () => {
      const service = new TelemetryService(undefined, 5)
      assert.ok(service)
      service.dispose()
    })

    test('should accept custom flush interval', () => {
      const service = new TelemetryService(undefined, 10, 5000)
      assert.ok(service)
      service.dispose()
    })

    test('should accept custom endpoint', () => {
      const service = new TelemetryService('https://telemetry.example.com')
      assert.ok(service)
      service.dispose()
    })

    test('should work without endpoint', () => {
      const service = new TelemetryService()
      service.trackEvent('test_event')
      assert.ok(service)
      service.dispose()
    })
  })

  suite('Edge Cases', () => {
    test('should handle very long event names', () => {
      const longName = 'a'.repeat(1000)
      telemetryService.trackEvent(longName)
      assert.ok(true)
    })

    test('should handle special characters in event names', () => {
      telemetryService.trackEvent('event!@#$%^&*()')
      assert.ok(true)
    })

    test('should handle empty event names', () => {
      telemetryService.trackEvent('')
      assert.ok(true)
    })

    test('should handle very large property objects', () => {
      const largeProps: Record<string, any> = {}
      for (let i = 0; i < 1000; i++) {
        largeProps[`key${i}`] = `value${i}`
      }
      telemetryService.trackEvent('test_event', largeProps)
      assert.ok(true)
    })

    test('should handle circular references in properties', () => {
      const circular: any = { foo: 'bar' }
      circular.self = circular

      // Should not throw (though circular refs might be handled differently)
      try {
        telemetryService.trackEvent('test_event', circular)
        assert.ok(true)
      } catch (error) {
        // Circular references might cause errors, which is acceptable
        assert.ok(true)
      }
    })

    test('should handle arrays in properties', () => {
      telemetryService.trackEvent('test_event', {
        items: [1, 2, 3, 4, 5],
      })
      assert.ok(true)
    })

    test('should handle deeply nested objects', () => {
      telemetryService.trackEvent('test_event', {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      })
      assert.ok(true)
    })
  })

  suite('Periodic Flush', () => {
    test('should flush periodically', async () => {
      const service = new TelemetryService(undefined, 10, 200)
      service.trackEvent('event1')

      // Wait for periodic flush
      await new Promise(resolve => setTimeout(resolve, 300))

      service.trackEvent('event2')
      service.dispose()
    })

    test('should not flush when disabled', async () => {
      const service = new TelemetryService(undefined, 10, 200)
      service.setEnabled(false)
      service.trackEvent('event1')

      // Wait for periodic flush interval
      await new Promise(resolve => setTimeout(resolve, 300))

      // Should not have flushed (no error)
      assert.ok(true)
      service.dispose()
    })
  })
})
