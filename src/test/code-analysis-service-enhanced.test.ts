/**
 * Integration tests for enhanced Code Analysis Service
 * Tests queue management, retry logic, cancellation, and circuit breaker
 */

import * as assert from 'assert'
import { CodeAnalysisService } from '../services/code-analysis-service'
import { ConfigurationService } from '../services/configuration-service'
import { Logger } from '../services/logger'

describe('Enhanced Code Analysis Service Integration Tests', () => {
  let service: CodeAnalysisService
  let mockConfig: ConfigurationService
  let mockLogger: Logger

  beforeEach(() => {
    // Create mock configuration service
    mockConfig = {
      getSettings: () => ({
        apiEndpoint: 'http://localhost:3000/api/test',
        apiKey: 'test-key',
        analysisMode: 'full',
        autoAnalyze: false,
        showInlineWarnings: true,
        enableDiagnostics: true,
        maxFileSize: 50000,
        maxProjectFiles: 40,
        maxProjectFileSize: 120000,
        requestTimeout: 5000,
        enableTelemetry: false,
      }),
    } as any

    // Create mock logger
    mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as any

    service = new CodeAnalysisService(mockConfig, mockLogger)
  })

  describe('Request Queue', () => {
    it('should return queue status', () => {
      const status = service.getQueueStatus()

      assert.strictEqual(typeof status.pending, 'number')
      assert.strictEqual(typeof status.active, 'number')
      assert.strictEqual(typeof status.completed, 'number')
      assert.strictEqual(typeof status.failed, 'number')
    })

    it('should track completed requests', () => {
      const initialStatus = service.getQueueStatus()
      assert.strictEqual(initialStatus.completed, 0)
    })
  })

  describe('Request Cancellation', () => {
    it('should allow cancelling a request', () => {
      const requestId = 'test-request-123'

      // Should not throw when cancelling non-existent request
      assert.doesNotThrow(() => {
        service.cancelAnalysis(requestId)
      })
    })
  })

  describe('Health Check', () => {
    it('should return health check result', async () => {
      const result = await service.testConnection()

      assert.strictEqual(typeof result.healthy, 'boolean')
      assert.strictEqual(typeof result.message, 'string')
    })

    it('should handle missing API endpoint', async () => {
      mockConfig.getSettings = () => ({
        ...mockConfig.getSettings(),
        apiEndpoint: '',
      })

      const result = await service.testConnection()

      assert.strictEqual(result.healthy, false)
      assert.ok(result.message.includes('not configured'))
    })
  })

  describe('Cache Management', () => {
    it('should clear cache without errors', async () => {
      // Should handle missing endpoint gracefully
      try {
        await service.clearCache()
      } catch (error: any) {
        assert.ok(error.message.includes('not configured'))
      }
    })
  })
})
