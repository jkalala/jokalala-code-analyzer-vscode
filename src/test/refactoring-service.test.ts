/**
 * Unit tests for RefactoringService's auth header construction.
 *
 * Before this fix, RefactoringService built its Authorization header from
 * ONLY the deprecated plaintext `jokalala.apiKey` setting — it never
 * consulted AuthService (the Sign-In JWT/persistent jkl_ key in
 * SecretStorage) or SecurityService's fallback chain the way every other
 * cloud call in the extension does. Anyone using "Jokalala: Sign In" (the
 * primary, recommended flow) had every refactoring request go out with no
 * Authorization header at all — which is exactly why Refactoring/
 * Recommendations looked broken/unhelpful even while signed in.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { RefactoringService } from '../services/refactoring-service'
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

suite('RefactoringService — auth header precedence', () => {
  test('prefers the Sign-In JWT (AuthService) over everything else', async () => {
    const fakeAuth = {
      getAuthHeaders: () => ({ Authorization: 'Bearer jkl_signed_in_token' }),
    } as unknown as AuthService
    const fakeSecurity = {
      getApiKeyWithFallback: async () => 'settings-fallback-key',
    } as unknown as SecurityService

    const service = new RefactoringService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer jkl_signed_in_token')
  })

  test('falls back to SecurityService (SecretStorage-aware) when not signed in', async () => {
    const fakeAuth = { getAuthHeaders: () => ({}) } as unknown as AuthService
    const fakeSecurity = {
      getApiKeyWithFallback: async () => 'secret-storage-key',
    } as unknown as SecurityService

    const service = new RefactoringService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer secret-storage-key')
  })

  test('falls back to the plaintext jokalala.apiKey setting as a last resort', async () => {
    const fakeAuth = { getAuthHeaders: () => ({}) } as unknown as AuthService
    const fakeSecurity = { getApiKeyWithFallback: async () => undefined } as unknown as SecurityService

    const service = new RefactoringService(makeConfig('plaintext-key'), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer plaintext-key')
  })

  test('sends no Authorization header when nothing is configured (not a crash)', async () => {
    const fakeAuth = { getAuthHeaders: () => ({}) } as unknown as AuthService
    const fakeSecurity = { getApiKeyWithFallback: async () => undefined } as unknown as SecurityService

    const service = new RefactoringService(makeConfig(''), mockLogger, fakeAuth, fakeSecurity)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, undefined)
  })

  test('works with no authService/securityService provided at all (backward compatible)', async () => {
    const service = new RefactoringService(makeConfig('plaintext-key'), mockLogger)
    const headers = await (service as any).buildAuthHeaders()

    assert.strictEqual(headers.Authorization, 'Bearer plaintext-key')
  })
})
