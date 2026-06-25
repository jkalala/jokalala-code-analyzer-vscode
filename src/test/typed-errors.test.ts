/**
 * Unit tests for typed-errors utility
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import {
  isError,
  getErrorMessage,
  getErrorStack,
  AppError,
  NetworkError,
  ValidationError,
  AuthError,
  PluginSecurityError,
  SecurityError,
  CancellationError,
  normaliseError,
} from '../utils/typed-errors'

suite('TypedErrors Test Suite', () => {

  suite('isError', () => {
    test('returns true for Error instances', () => {
      assert.strictEqual(isError(new Error('test')), true)
      assert.strictEqual(isError(new TypeError('type')), true)
      assert.strictEqual(isError(new NetworkError('net')), true)
    })

    test('returns false for non-Error values', () => {
      assert.strictEqual(isError(null), false)
      assert.strictEqual(isError(undefined), false)
      assert.strictEqual(isError('string'), false)
      assert.strictEqual(isError(42), false)
      assert.strictEqual(isError({ message: 'obj' }), false)
    })
  })

  suite('getErrorMessage', () => {
    test('extracts message from Error', () => {
      assert.strictEqual(getErrorMessage(new Error('hello')), 'hello')
    })

    test('returns string values directly', () => {
      assert.strictEqual(getErrorMessage('raw string'), 'raw string')
    })

    test('extracts message from plain object', () => {
      assert.strictEqual(getErrorMessage({ message: 'obj msg' }), 'obj msg')
    })

    test('returns fallback for unknown types', () => {
      assert.strictEqual(getErrorMessage(null), 'An unknown error occurred')
      assert.strictEqual(getErrorMessage(undefined), 'An unknown error occurred')
      assert.strictEqual(getErrorMessage(42), 'An unknown error occurred')
    })
  })

  suite('getErrorStack', () => {
    test('returns stack for Error instances', () => {
      const e = new Error('with stack')
      const stack = getErrorStack(e)
      assert.ok(typeof stack === 'string')
      assert.ok(stack!.includes('with stack'))
    })

    test('returns undefined for non-Error values', () => {
      assert.strictEqual(getErrorStack('string'), undefined)
      assert.strictEqual(getErrorStack(null), undefined)
    })
  })

  suite('AppError', () => {
    test('sets name to class name', () => {
      const e = new AppError('msg', 'CODE')
      assert.strictEqual(e.name, 'AppError')
      assert.strictEqual(e.code, 'CODE')
      assert.strictEqual(e.message, 'msg')
    })

    test('defaults isUserFacing to false', () => {
      assert.strictEqual(new AppError('m', 'C').isUserFacing, false)
    })

    test('can set isUserFacing to true', () => {
      assert.strictEqual(new AppError('m', 'C', true).isUserFacing, true)
    })

    test('is an instance of Error', () => {
      assert.ok(new AppError('m', 'C') instanceof Error)
    })
  })

  suite('NetworkError', () => {
    test('has code NETWORK_ERROR', () => {
      assert.strictEqual(new NetworkError('msg').code, 'NETWORK_ERROR')
    })

    test('stores status code', () => {
      assert.strictEqual(new NetworkError('msg', 404).statusCode, 404)
    })

    test('is user-facing', () => {
      assert.strictEqual(new NetworkError('msg').isUserFacing, true)
    })

    test('inherits from AppError and Error', () => {
      const e = new NetworkError('msg')
      assert.ok(e instanceof AppError)
      assert.ok(e instanceof Error)
    })
  })

  suite('ValidationError', () => {
    test('has code VALIDATION_ERROR', () => {
      assert.strictEqual(new ValidationError('bad input').code, 'VALIDATION_ERROR')
    })

    test('stores field name', () => {
      assert.strictEqual(new ValidationError('bad', 'email').field, 'email')
    })

    test('is not user-facing (may contain internal details)', () => {
      assert.strictEqual(new ValidationError('bad').isUserFacing, false)
    })
  })

  suite('AuthError', () => {
    test('has code AUTH_ERROR and is user-facing', () => {
      const e = new AuthError('token expired')
      assert.strictEqual(e.code, 'AUTH_ERROR')
      assert.strictEqual(e.isUserFacing, true)
    })
  })

  suite('PluginSecurityError', () => {
    test('embeds plugin ID in message', () => {
      const e = new PluginSecurityError('my-plugin', 'path traversal')
      assert.ok(e.message.includes('my-plugin'))
      assert.ok(e.message.includes('path traversal'))
    })

    test('stores plugin ID separately', () => {
      assert.strictEqual(new PluginSecurityError('pid', 'reason').pluginId, 'pid')
    })

    test('has code PLUGIN_SECURITY_ERROR and is not user-facing', () => {
      const e = new PluginSecurityError('pid', 'reason')
      assert.strictEqual(e.code, 'PLUGIN_SECURITY_ERROR')
      assert.strictEqual(e.isUserFacing, false)
    })
  })

  suite('SecurityError', () => {
    test('has code SECURITY_ERROR', () => {
      assert.strictEqual(new SecurityError('blocked').code, 'SECURITY_ERROR')
    })
  })

  suite('CancellationError', () => {
    test('has code CANCELLED', () => {
      assert.strictEqual(new CancellationError().code, 'CANCELLED')
    })
  })

  suite('normaliseError', () => {
    test('returns AppError instances unchanged', () => {
      const original = new SecurityError('blocked')
      assert.strictEqual(normaliseError(original), original)
    })

    test('wraps plain Error as AppError', () => {
      const e = normaliseError(new Error('plain error'))
      assert.ok(e instanceof AppError)
      assert.strictEqual(e.message, 'plain error')
    })

    test('wraps string as AppError', () => {
      const e = normaliseError('string error')
      assert.ok(e instanceof AppError)
      assert.strictEqual(e.message, 'string error')
    })

    test('uses fallback message when provided', () => {
      const e = normaliseError(null, 'Operation failed')
      assert.ok(e instanceof AppError)
      assert.strictEqual(e.message, 'Operation failed')
    })

    test('detects Axios HTTP errors and wraps as NetworkError', () => {
      const axiosLike = { response: { status: 503 } }
      const e = normaliseError(axiosLike, 'Service unavailable')
      assert.ok(e instanceof NetworkError)
      assert.strictEqual((e as NetworkError).statusCode, 503)
    })

    test('handles null/undefined gracefully', () => {
      assert.ok(normaliseError(null) instanceof AppError)
      assert.ok(normaliseError(undefined) instanceof AppError)
    })
  })
})
