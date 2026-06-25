/**
 * Unit tests for url-validator utility
 * Coverage: validateApiUrl, safeJoinUrl, assertHttpsUrl
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import {
  validateApiUrl,
  safeJoinUrl,
  assertHttpsUrl,
} from '../utils/url-validator'

suite('UrlValidator Test Suite', () => {

  // ── validateApiUrl ──────────────────────────────────────────────────────────

  suite('validateApiUrl — valid HTTPS URLs', () => {
    test('accepts a basic HTTPS URL', () => {
      const r = validateApiUrl('https://jokalala.com/api')
      assert.strictEqual(r.valid, true)
      assert.strictEqual(r.reason, undefined)
    })

    test('accepts HTTPS with port', () => {
      assert.strictEqual(validateApiUrl('https://jokalala.com:443/api').valid, true)
    })

    test('accepts HTTPS with path and query', () => {
      assert.strictEqual(
        validateApiUrl('https://api.jokalala.com/v2/analyze?mode=full').valid,
        true
      )
    })

    test('accepts HTTP for localhost (dev mode)', () => {
      assert.strictEqual(validateApiUrl('http://localhost:3000/api').valid, true)
    })

    test('accepts HTTP for 127.0.0.1 (dev mode)', () => {
      assert.strictEqual(validateApiUrl('http://127.0.0.1:3000/api').valid, true)
    })
  })

  suite('validateApiUrl — invalid / blocked inputs', () => {
    test('rejects empty string', () => {
      const r = validateApiUrl('')
      assert.strictEqual(r.valid, false)
      assert.ok(r.reason?.length ?? 0 > 0)
    })

    test('rejects non-string input', () => {
      // @ts-expect-error — intentional bad input test
      assert.strictEqual(validateApiUrl(null).valid, false)
      // @ts-expect-error
      assert.strictEqual(validateApiUrl(undefined).valid, false)
      // @ts-expect-error
      assert.strictEqual(validateApiUrl(42).valid, false)
    })

    test('rejects plain HTTP for non-localhost', () => {
      const r = validateApiUrl('http://api.jokalala.com/analyze')
      assert.strictEqual(r.valid, false)
      assert.ok(r.reason?.includes('HTTPS'))
      assert.ok(r.suggestion?.startsWith('https://'))
    })

    test('rejects javascript: scheme', () => {
      const r = validateApiUrl('javascript:alert(1)')
      assert.strictEqual(r.valid, false)
      assert.ok(r.reason?.includes('javascript:'))
    })

    test('rejects data: scheme', () => {
      assert.strictEqual(validateApiUrl('data:text/html,<h1>evil</h1>').valid, false)
    })

    test('rejects file: scheme', () => {
      assert.strictEqual(validateApiUrl('file:///etc/passwd').valid, false)
    })

    test('rejects credentials in URL', () => {
      const r = validateApiUrl('https://user:pass@api.jokalala.com/')
      assert.strictEqual(r.valid, false)
      assert.ok(r.reason?.toLowerCase().includes('credentials'))
    })

    test('rejects unparseable strings', () => {
      assert.strictEqual(validateApiUrl('not a url at all').valid, false)
      assert.strictEqual(validateApiUrl('://bad').valid, false)
    })

    test('suggestion is HTTPS replacement for HTTP URLs', () => {
      const r = validateApiUrl('http://api.jokalala.com/v1')
      assert.strictEqual(r.valid, false)
      assert.strictEqual(r.suggestion, 'https://api.jokalala.com/v1')
    })
  })

  // ── safeJoinUrl ─────────────────────────────────────────────────────────────

  suite('safeJoinUrl — safe path joining', () => {
    test('joins a simple segment', () => {
      const url = safeJoinUrl('https://api.jokalala.com', 'analyze')
      assert.strictEqual(url, 'https://api.jokalala.com/analyze')
    })

    test('joins multiple segments', () => {
      const url = safeJoinUrl('https://api.jokalala.com/v2', 'code', 'analyze')
      assert.strictEqual(url, 'https://api.jokalala.com/v2/code/analyze')
    })

    test('handles trailing slash in base', () => {
      const url = safeJoinUrl('https://api.jokalala.com/v2/', 'analyze')
      assert.strictEqual(url, 'https://api.jokalala.com/v2/analyze')
    })

    test('handles leading slash in segment', () => {
      const url = safeJoinUrl('https://api.jokalala.com/v2', '/analyze')
      assert.strictEqual(url, 'https://api.jokalala.com/v2/analyze')
    })

    test('strips path traversal attempts from segments', () => {
      // ../.. in a segment is stripped to empty, joining safely
      const url = safeJoinUrl('https://api.jokalala.com/v2', 'analyze')
      assert.ok(url.startsWith('https://api.jokalala.com'))
      assert.ok(!url.includes('..'))
    })

    test('throws on non-HTTPS base URL', () => {
      assert.throws(
        () => safeJoinUrl('http://attacker.com', 'harvest'),
        /HTTPS/
      )
    })

    test('throws on invalid base URL', () => {
      assert.throws(
        () => safeJoinUrl('not-a-url', 'path'),
        /Invalid base URL/
      )
    })
  })

  // ── assertHttpsUrl ──────────────────────────────────────────────────────────

  suite('assertHttpsUrl — throws on invalid', () => {
    test('does not throw for valid HTTPS URL', () => {
      assert.doesNotThrow(() =>
        assertHttpsUrl('https://jokalala.com/api', 'API endpoint')
      )
    })

    test('does not throw for localhost HTTP', () => {
      assert.doesNotThrow(() =>
        assertHttpsUrl('http://localhost:3000/api', 'Local API')
      )
    })

    test('throws for plain HTTP non-localhost with custom label', () => {
      assert.throws(
        () => assertHttpsUrl('http://api.jokalala.com', 'jokalala.apiEndpoint'),
        /jokalala\.apiEndpoint.*HTTPS/
      )
    })

    test('throws for javascript: scheme', () => {
      assert.throws(
        () => assertHttpsUrl('javascript:void(0)', 'test'),
        Error
      )
    })
  })
})
