/**
 * Unit tests for SecurityService
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { SecurityService } from '../services/security-service'

suite('SecurityService Test Suite', () => {
  let securityService: SecurityService
  let mockContext: vscode.ExtensionContext

  // Create a mock ExtensionContext for testing
  function createMockContext(): vscode.ExtensionContext {
    const secretStorage = new Map<string, string>()

    return {
      secrets: {
        get: async (key: string) => secretStorage.get(key),
        store: async (key: string, value: string) => {
          secretStorage.set(key, value)
        },
        delete: async (key: string) => {
          secretStorage.delete(key)
        },
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
          .event,
      },
    } as any
  }

  setup(() => {
    mockContext = createMockContext()
    securityService = new SecurityService(mockContext)
  })

  suite('Secret Storage Operations', () => {
    test('should store and retrieve API key', async () => {
      const testKey = 'test-api-key-12345'
      await securityService.storeApiKey(testKey)
      const retrieved = await securityService.getApiKey()
      assert.strictEqual(retrieved, testKey)
    })

    test('should return undefined for non-existent API key', async () => {
      const retrieved = await securityService.getApiKey()
      assert.strictEqual(retrieved, undefined)
    })

    test('should delete API key', async () => {
      const testKey = 'test-api-key-12345'
      await securityService.storeApiKey(testKey)
      await securityService.deleteApiKey()
      const retrieved = await securityService.getApiKey()
      assert.strictEqual(retrieved, undefined)
    })

    test('should trim whitespace from API key before storing', async () => {
      const testKey = '  test-api-key-12345  '
      await securityService.storeApiKey(testKey)
      const retrieved = await securityService.getApiKey()
      assert.strictEqual(retrieved, 'test-api-key-12345')
    })

    test('should throw error for empty API key', async () => {
      await assert.rejects(
        async () => await securityService.storeApiKey(''),
        /Invalid API key/
      )
    })

    test('should throw error for whitespace-only API key', async () => {
      await assert.rejects(
        async () => await securityService.storeApiKey('   '),
        /Invalid API key/
      )
    })

    test('should throw error for non-string API key', async () => {
      await assert.rejects(
        async () => await securityService.storeApiKey(null as any),
        /Invalid API key/
      )
    })
  })

  suite('HTTPS Validation', () => {
    test('should validate HTTPS URLs', () => {
      assert.strictEqual(
        securityService.validateHttpsUrl('https://api.example.com'),
        true
      )
      assert.strictEqual(
        securityService.validateHttpsUrl('https://api.example.com/analyze'),
        true
      )
      assert.strictEqual(
        securityService.validateHttpsUrl('https://localhost:3000/api'),
        true
      )
    })

    test('should reject HTTP URLs', () => {
      assert.strictEqual(
        securityService.validateHttpsUrl('http://api.example.com'),
        false
      )
      assert.strictEqual(
        securityService.validateHttpsUrl('http://localhost:3000'),
        false
      )
    })

    test('should reject invalid URLs', () => {
      assert.strictEqual(securityService.validateHttpsUrl('not-a-url'), false)
      assert.strictEqual(securityService.validateHttpsUrl(''), false)
      assert.strictEqual(securityService.validateHttpsUrl(null as any), false)
      assert.strictEqual(
        securityService.validateHttpsUrl(undefined as any),
        false
      )
    })

    test('should reject other protocols', () => {
      assert.strictEqual(
        securityService.validateHttpsUrl('ftp://example.com'),
        false
      )
      assert.strictEqual(
        securityService.validateHttpsUrl('ws://example.com'),
        false
      )
    })
  })

  suite('HTTPS Enforcement', () => {
    test('should accept valid HTTPS URLs', () => {
      assert.doesNotThrow(() => {
        securityService.validateAndEnforceHttps('https://api.example.com')
      })
    })

    test('should throw error for HTTP URLs', () => {
      assert.throws(() => {
        securityService.validateAndEnforceHttps('http://api.example.com')
      }, /Security Error.*HTTPS/)
    })

    test('should throw error for invalid URLs', () => {
      assert.throws(() => {
        securityService.validateAndEnforceHttps('not-a-url')
      }, /Invalid API endpoint/)
    })

    test('should throw error for empty URLs', () => {
      assert.throws(() => {
        securityService.validateAndEnforceHttps('')
      }, /Invalid API endpoint/)
    })
  })

  suite('Input Sanitization', () => {
    test('should sanitize HTML special characters', () => {
      const input = '<script>alert("xss")</script>'
      const sanitized = securityService.sanitizeInput(input)
      assert.strictEqual(
        sanitized,
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      )
    })

    test('should remove control characters', () => {
      const input = 'test\x00\x01\x1F\x7Fstring'
      const sanitized = securityService.sanitizeInput(input)
      assert.strictEqual(sanitized, 'teststring')
    })

    test('should limit input length', () => {
      const longInput = 'a'.repeat(15000)
      const sanitized = securityService.sanitizeInput(longInput)
      assert.strictEqual(sanitized.length, 10000)
    })

    test('should handle empty input', () => {
      assert.strictEqual(securityService.sanitizeInput(''), '')
      assert.strictEqual(securityService.sanitizeInput(null as any), '')
      assert.strictEqual(securityService.sanitizeInput(undefined as any), '')
    })

    test('should escape all dangerous characters', () => {
      const input = '&<>"\'/test'
      const sanitized = securityService.sanitizeInput(input)
      assert.strictEqual(sanitized, '&amp;&lt;&gt;&quot;&#x27;&#x2F;test')
    })
  })

  suite('Error Message Sanitization', () => {
    test('should redact file paths', () => {
      const error = new Error('Error at C:\\Users\\test\\file.ts')
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.strictEqual(sanitized, 'Error at [PATH]')
    })

    test('should redact Unix file paths', () => {
      const error = new Error('Error at /home/user/project/file.ts')
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.strictEqual(sanitized, 'Error at [PATH]')
    })

    test('should redact API keys and tokens', () => {
      const error = new Error(
        'Auth failed with key abc123def456ghi789jkl012mno345pqr678'
      )
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.ok(sanitized.includes('[REDACTED]'))
      assert.ok(!sanitized.includes('abc123def456'))
    })

    test('should redact email addresses', () => {
      const error = new Error('User test@example.com not found')
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.strictEqual(sanitized, 'User [EMAIL] not found')
    })

    test('should redact IP addresses', () => {
      const error = new Error('Connection to 192.168.1.1 failed')
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.strictEqual(sanitized, 'Connection to [IP] failed')
    })

    test('should redact passwords and secrets', () => {
      const error = new Error('password=secret123 token=abc123')
      const sanitized = securityService.sanitizeErrorMessage(error)
      assert.ok(sanitized.includes('password=[REDACTED]'))
      assert.ok(sanitized.includes('token=[REDACTED]'))
    })

    test('should handle null error', () => {
      const sanitized = securityService.sanitizeErrorMessage(null as any)
      assert.strictEqual(sanitized, 'An unknown error occurred')
    })
  })

  suite('Token Validation', () => {
    test('should validate JWT format', () => {
      const validToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      assert.strictEqual(securityService.validateToken(validToken), true)
    })

    test('should reject invalid token format', () => {
      assert.strictEqual(securityService.validateToken('invalid'), false)
      assert.strictEqual(securityService.validateToken('a.b'), false)
      assert.strictEqual(securityService.validateToken(''), false)
      assert.strictEqual(securityService.validateToken(null as any), false)
    })

    test('should reject tokens with invalid characters', () => {
      assert.strictEqual(
        securityService.validateToken('a!b@c.d#e$f.g%h^i'),
        false
      )
    })
  })

  suite('Token Expiration', () => {
    test('should detect expired token', () => {
      // Token with exp in the past (timestamp: 1516239022 = Jan 2018)
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ.4Adcj0vfLwf6JYnwJnI41nZqVRgLvMvXNQqYKQCLMNg'
      assert.strictEqual(securityService.isTokenExpired(expiredToken), true)
    })

    test('should detect valid token', () => {
      // Create a token that expires in the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      const payload = Buffer.from(
        JSON.stringify({ exp: futureTimestamp })
      ).toString('base64url')
      const validToken = `header.${payload}.signature`
      assert.strictEqual(securityService.isTokenExpired(validToken), false)
    })

    test('should consider token without exp as expired', () => {
      const payload = Buffer.from(JSON.stringify({ sub: '123' })).toString(
        'base64url'
      )
      const tokenWithoutExp = `header.${payload}.signature`
      assert.strictEqual(securityService.isTokenExpired(tokenWithoutExp), true)
    })

    test('should consider invalid token as expired', () => {
      assert.strictEqual(securityService.isTokenExpired('invalid'), true)
      assert.strictEqual(securityService.isTokenExpired(''), true)
    })
  })
})
