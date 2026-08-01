/**
 * Unit tests for AuthService
 *
 * This is the file responsible for three consecutive point-release
 * regressions (2.4.2 -> 2.4.4): a session token expiring ~15 minutes after
 * sign-in, then the auth callback rejecting the persistent `jkl_...` key
 * format it was replaced with. It had zero tests before this file.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { AuthService, isJwtShapedToken } from '../services/auth-service'

// ── isJwtShapedToken ─────────────────────────────────────────────────────────

suite('isJwtShapedToken', () => {
  test('accepts a jkl_ prefixed persistent API key', () => {
    assert.strictEqual(
      isJwtShapedToken('jkl_pro_' + 'a'.repeat(40)),
      true
    )
  })

  test('accepts a well-formed 3-segment JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.4Adcj0vfLwf6JYnwJnI41nZqVRgLvMvXNQqYKQCLMNg'
    assert.strictEqual(isJwtShapedToken(jwt), true)
  })

  test('rejects a jkl_ token that is too short', () => {
    assert.strictEqual(isJwtShapedToken('jkl_short'), false)
  })

  test('rejects a jkl_ token with invalid characters', () => {
    assert.strictEqual(isJwtShapedToken('jkl_' + '!'.repeat(20)), false)
  })

  test('rejects tokens with the wrong number of dot-segments', () => {
    assert.strictEqual(isJwtShapedToken('a.b'), false)
    assert.strictEqual(isJwtShapedToken('a.b.c.d'), false)
    assert.strictEqual(isJwtShapedToken('no-dots-at-all'), false)
  })

  test('rejects a 3-segment token with an empty segment', () => {
    assert.strictEqual(isJwtShapedToken('a..c'), false)
  })

  test('rejects a 3-segment token with non-base64url characters', () => {
    assert.strictEqual(isJwtShapedToken('a!b.c@d.e#f'), false)
  })

  test('rejects an empty string', () => {
    assert.strictEqual(isJwtShapedToken(''), false)
  })
})

// ── AuthService.handleAuthCallback ───────────────────────────────────────────

suite('AuthService.handleAuthCallback', () => {
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

  test('stores a valid jkl_ token and marks the session authenticated', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)

    const token = 'jkl_pro_' + 'b'.repeat(40)
    const uri = vscode.Uri.parse(
      `vscode://jokalala.jokalala-code-analysis/auth?token=${token}&userId=user-123`
    )

    await authService.handleAuthCallback(uri)

    assert.strictEqual(authService.isAuthenticated, true)
    assert.strictEqual(authService.token, token)
    assert.strictEqual(await context.secrets.get('jokalala.auth.token'), token)
  })

  test('rejects a malformed token and does not authenticate', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)

    const uri = vscode.Uri.parse(
      'vscode://jokalala.jokalala-code-analysis/auth?token=not-a-real-token&userId=user-123'
    )

    await authService.handleAuthCallback(uri)

    assert.strictEqual(authService.isAuthenticated, false)
    assert.strictEqual(await context.secrets.get('jokalala.auth.token'), undefined)
  })

  test('rejects a callback with no token param', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)

    const uri = vscode.Uri.parse(
      'vscode://jokalala.jokalala-code-analysis/auth?userId=user-123'
    )

    await authService.handleAuthCallback(uri)

    assert.strictEqual(authService.isAuthenticated, false)
  })

  test('rejects a userId with unsafe characters but still rejects the whole callback', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)

    const token = 'jkl_pro_' + 'c'.repeat(40)
    const uri = vscode.Uri.parse(
      `vscode://jokalala.jokalala-code-analysis/auth?token=${token}&userId=<script>alert(1)</script>`
    )

    await authService.handleAuthCallback(uri)

    assert.strictEqual(authService.isAuthenticated, false)
    assert.strictEqual(await context.secrets.get('jokalala.auth.token'), undefined)
  })
})

// ── AuthService session lifecycle ────────────────────────────────────────────

suite('AuthService session lifecycle', () => {
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

  test('initialize() restores a previously stored token', async () => {
    const context = createMockContext()
    await context.secrets.store('jokalala.auth.token', 'jkl_pro_' + 'd'.repeat(40))
    await context.secrets.store('jokalala.auth.userId', 'user-456')

    const authService = new AuthService(context)
    await authService.initialize()

    assert.strictEqual(authService.isAuthenticated, true)
    assert.strictEqual(authService.token, 'jkl_pro_' + 'd'.repeat(40))
  })

  test('signOut() clears the stored token', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)
    const token = 'jkl_pro_' + 'e'.repeat(40)
    await authService.handleAuthCallback(
      vscode.Uri.parse(
        `vscode://jokalala.jokalala-code-analysis/auth?token=${token}`
      )
    )

    await authService.signOut()

    assert.strictEqual(authService.isAuthenticated, false)
    assert.strictEqual(await context.secrets.get('jokalala.auth.token'), undefined)
  })

  test('invalidateSession() clears the token without a manual sign-out', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)
    const token = 'jkl_pro_' + 'f'.repeat(40)
    await authService.handleAuthCallback(
      vscode.Uri.parse(
        `vscode://jokalala.jokalala-code-analysis/auth?token=${token}`
      )
    )

    await authService.invalidateSession()

    assert.strictEqual(authService.isAuthenticated, false)
    assert.strictEqual(authService.getAuthHeaders().Authorization, undefined)
  })

  test('getAuthHeaders() returns a Bearer header when authenticated, empty object otherwise', async () => {
    const context = createMockContext()
    const authService = new AuthService(context)

    assert.deepStrictEqual(authService.getAuthHeaders(), {})

    const token = 'jkl_pro_' + 'g'.repeat(40)
    await authService.handleAuthCallback(
      vscode.Uri.parse(
        `vscode://jokalala.jokalala-code-analysis/auth?token=${token}`
      )
    )

    assert.strictEqual(authService.getAuthHeaders().Authorization, `Bearer ${token}`)
  })
})
