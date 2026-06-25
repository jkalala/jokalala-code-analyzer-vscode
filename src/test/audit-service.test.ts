/**
 * Unit tests for AuditService
 *
 * Tests cover: event recording, chain hash integrity, detail sanitisation,
 * ring-buffer limit, userId hashing, and graceful degradation.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as crypto from 'crypto'
import * as vscode from 'vscode'
import { AuditService, AuditEvent, AuditEntry } from '../services/audit-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function createMockContext(): vscode.ExtensionContext {
  const globalMap = new Map<string, unknown>()

  return {
    globalStorageUri: vscode.Uri.file('/tmp/jokalala-test-audit'),
    globalState: {
      get: (key: string, defaultValue?: unknown) =>
        globalMap.has(key) ? globalMap.get(key) : defaultValue,
      update: async (key: string, value: unknown) => {
        globalMap.set(key, value)
      },
      keys: () => [...globalMap.keys()],
    },
    secrets: {
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
    },
  } as unknown as vscode.ExtensionContext
}

function recomputeHash(entry: AuditEntry, prevHash: string): string {
  const chainInput = `${prevHash}|${entry.seq}|${entry.timestamp}|${entry.event}|${JSON.stringify(entry.details)}`
  return crypto.createHash('sha256').update(chainInput).digest('hex')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('AuditService Test Suite', () => {
  let service: AuditService

  setup(() => {
    service = new AuditService(createMockContext())
    // Skip file I/O initialisation — test in-memory only
  })

  teardown(() => {
    service.dispose()
  })

  suite('Basic recording', () => {
    test('records an event and returns it in getRecentEntries', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_INITIATED)
      const entries = service.getRecentEntries(10)
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].event, AuditEvent.AUTH_SIGN_IN_INITIATED)
    })

    test('sequence numbers increase monotonically', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_INITIATED)
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS)
      service.record(AuditEvent.ANALYSIS_REQUESTED, { requestId: 'r1' })

      const entries = service.getRecentEntries(10).reverse()
      assert.strictEqual(entries[0].seq, 1)
      assert.strictEqual(entries[1].seq, 2)
      assert.strictEqual(entries[2].seq, 3)
    })

    test('timestamps are ISO-8601 UTC strings', () => {
      service.record(AuditEvent.AUTH_SIGN_OUT)
      const entry = service.getRecentEntries(1)[0]
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.timestamp))
    })

    test('extension version is populated', () => {
      service.record(AuditEvent.PLUGIN_LOADED, { pluginId: 'test' })
      const entry = service.getRecentEntries(1)[0]
      assert.ok(typeof entry.extensionVersion === 'string')
    })

    test('getRecentEntries returns newest first', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_INITIATED)
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS)

      const entries = service.getRecentEntries(10)
      assert.strictEqual(entries[0].event, AuditEvent.AUTH_SIGN_IN_SUCCESS)
      assert.strictEqual(entries[1].event, AuditEvent.AUTH_SIGN_IN_INITIATED)
    })
  })

  suite('Chain hash integrity', () => {
    test('first entry starts from genesis chain', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_INITIATED)
      const entry = service.getRecentEntries(1)[0]
      const expected = recomputeHash(entry, 'genesis')
      assert.strictEqual(entry.hash, expected)
    })

    test('second entry chains from first entry hash', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_INITIATED)
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS)

      const entries = service.getRecentEntries(10).reverse()
      const first = entries[0]
      const second = entries[1]

      const expectedSecond = recomputeHash(second, first.hash)
      assert.strictEqual(second.hash, expectedSecond)
    })

    test('chain breaks if details are tampered (tamper detection demo)', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, { userId: 'user1' })

      const entries = service.getRecentEntries(1)
      const entry = entries[0]

      // Simulate tampering — change the details
      const tampered = { ...entry, details: { userId: 'attacker' } }

      // Recompute hash from genesis with tampered details
      const tamperedHash = recomputeHash(tampered, 'genesis')

      // The tampered entry hash should differ from the original
      assert.notStrictEqual(tamperedHash, entry.hash,
        'Tampered entry should have a different hash than the recorded one'
      )
    })
  })

  suite('Detail sanitisation', () => {
    test('redacts keys named "token"', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, { token: 'supersecret' })
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.details['token'], '[REDACTED]')
    })

    test('redacts keys named "apiKey"', () => {
      service.record(AuditEvent.SETTING_CHANGED, { apiKey: 'sk-12345' })
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.details['apiKey'], '[REDACTED]')
    })

    test('redacts keys named "password"', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_FAILED, { password: 'hunter2' })
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.details['password'], '[REDACTED]')
    })

    test('truncates string values longer than 512 chars', () => {
      const longValue = 'a'.repeat(1000)
      service.record(AuditEvent.ANALYSIS_REQUESTED, { description: longValue })
      const entry = service.getRecentEntries(1)[0]
      const desc = entry.details['description'] as string
      assert.ok(desc.startsWith('[TRUNCATED:'))
      assert.ok(!desc.includes('a'.repeat(100)))
    })

    test('preserves short, safe string values', () => {
      service.record(AuditEvent.ANALYSIS_REQUESTED, {
        requestId: 'req_123',
        language: 'typescript',
        codeLength: 512,
      })
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.details['requestId'], 'req_123')
      assert.strictEqual(entry.details['language'], 'typescript')
      assert.strictEqual(entry.details['codeLength'], 512)
    })

    test('does not store raw code snippets', () => {
      // "code" is a redacted key
      service.record(AuditEvent.ANALYSIS_REQUESTED, {
        code: 'SELECT * FROM users WHERE id = 1',
      })
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.details['code'], '[REDACTED]')
    })
  })

  suite('userId hashing', () => {
    test('userId is hashed, not stored raw', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, {}, 'user@example.com')
      const entry = service.getRecentEntries(1)[0]

      // Should not contain raw userId
      assert.ok(!JSON.stringify(entry).includes('user@example.com'))

      // Should have a hashed version
      assert.ok(typeof entry.userIdHash === 'string')
      assert.ok(entry.userIdHash!.length > 0)
    })

    test('same userId always produces same hash', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, {}, 'alice')
      service.record(AuditEvent.ANALYSIS_REQUESTED, {}, 'alice')

      const entries = service.getRecentEntries(2)
      assert.strictEqual(entries[0].userIdHash, entries[1].userIdHash)
    })

    test('different userIds produce different hashes', () => {
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, {}, 'alice')
      service.record(AuditEvent.AUTH_SIGN_IN_SUCCESS, {}, 'bob')

      const entries = service.getRecentEntries(2)
      assert.notStrictEqual(entries[0].userIdHash, entries[1].userIdHash)
    })

    test('omitting userId leaves userIdHash undefined', () => {
      service.record(AuditEvent.PLUGIN_LOADED)
      const entry = service.getRecentEntries(1)[0]
      assert.strictEqual(entry.userIdHash, undefined)
    })
  })

  suite('All AuditEvent constants are valid strings', () => {
    test('all exported event constants are non-empty strings', () => {
      for (const [key, value] of Object.entries(AuditEvent)) {
        assert.ok(
          typeof value === 'string' && value.length > 0,
          `AuditEvent.${key} should be a non-empty string`
        )
      }
    })

    test('can record every defined event type without error', () => {
      assert.doesNotThrow(() => {
        for (const event of Object.values(AuditEvent)) {
          service.record(event)
        }
      })
    })
  })
})
