/**
 * Unit tests for SCAService's auth header construction.
 *
 * This one was the worst of the three: it sent NO Authorization header at
 * all, under any circumstances — not even the deprecated plaintext
 * fallback the others had. Every dependency scan and SBOM export was
 * unauthenticated regardless of sign-in state or settings.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { SCAService } from '../services/sca-service'
import { ConfigurationService } from '../services/configuration-service'
import { Logger } from '../services/logger'
import { AuthService } from '../services/auth-service'
import { SecurityService } from '../services/security-service'

function makeConfig(apiKey = ''): ConfigurationService {
  return {
    getSettings: () => ({
      apiEndpoint: 'https://example.invalid/api',
      apiKey,
      analysisMode: 'full',
      analysisTier: 'hybrid',
      localPackProfile: 'precision',
      autoAnalyze: false,
      showInlineWarnings: true,
      enableDiagnostics: true,
      maxFileSize: 50000,
      maxProjectFiles: 5000,
      maxProjectFileSize: 120000,
      requestTimeout: 5000,
      enableTelemetry: false,
    }),
  } as unknown as ConfigurationService
}

const mockLogger = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger

suite('SCAService — auth header precedence', () => {
  test('prefers the Sign-In JWT (AuthService) over everything else', async () => {
    const fakeAuth = {
      getAuthHeaders: () => ({ Authorization: 'Bearer jkl_signed_in_token' }),
    } as unknown as AuthService
    const fakeSecurity = {
      getApiKeyWithFallback: async () => 'settings-fallback-key',
    } as unknown as SecurityService

    const service = new SCAService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer jkl_signed_in_token')
  })

  test('falls back to SecurityService (SecretStorage-aware) when not signed in', async () => {
    const fakeAuth = { getAuthHeaders: () => ({}) } as unknown as AuthService
    const fakeSecurity = {
      getApiKeyWithFallback: async () => 'secret-storage-key',
    } as unknown as SecurityService

    const service = new SCAService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer secret-storage-key')
  })

  test('falls back to the plaintext jokalala.apiKey setting as a last resort', async () => {
    const fakeAuth = { getAuthHeaders: () => ({}) } as unknown as AuthService
    const fakeSecurity = { getApiKeyWithFallback: async () => undefined } as unknown as SecurityService

    const service = new SCAService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer plaintext-key')
  })

  test('previously sent no Authorization header under any circumstance — now works with no auth services provided', async () => {
    const service = new SCAService(makeConfig('plaintext-key'), mockLogger)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer plaintext-key')
  })

  test('sends no Authorization header (not a crash) when truly nothing is configured', async () => {
    const service = new SCAService(makeConfig(''), mockLogger)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, undefined)
    // Content-Type/User-Agent should still be present regardless.
    assert.strictEqual(headers['Content-Type'], 'application/json')
    assert.strictEqual(headers['User-Agent'], 'Jokalala-VSCode-Extension')
  })
})
