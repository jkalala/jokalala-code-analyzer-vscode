/**
 * Unit tests for ide-bridge.ts — the module with real disk-write power via
 * applyProposalDiff (WorkspaceEdit). Runs against the in-memory file system
 * in vscode-mock.ts (_setMockFile/_getMockFile/_resetMockFs) rather than
 * real disk, so these are fast and hermetic while still exercising the real
 * WorkspaceEdit/Uri.joinPath/openTextDocument code paths.
 *
 * NOT covered: the network-calling tail of hydrateWorkspaceFile/postIndexDelta
 * (would need a fetch stub) — only its local guard-rail branches are tested
 * here (invalid path, no workspace, file too large), which are the ones that
 * return before ever reaching the network.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { IdeBridgeService, resolveSiteOrigin } from '../services/ide-bridge'
import type { AuthService } from '../services/auth-service'
import type { ConfigurationService } from '../services/configuration-service'
import type { Logger } from '../services/logger'
import type { SecurityService } from '../services/security-service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVscode = vscode as any

function makeConfiguration(apiEndpoint = 'https://jokalala.com/api/agents/dev-assistant'): ConfigurationService {
  return { getSettings: () => ({ apiEndpoint, apiKey: '' }) } as unknown as ConfigurationService
}

function makeAuth(headers: Record<string, string> = {}): AuthService {
  return { getAuthHeaders: () => headers } as unknown as AuthService
}

function makeSecurity(apiKey?: string): SecurityService {
  return { getApiKeyWithFallback: async () => apiKey } as unknown as SecurityService
}

function makeLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger
}

function makeService(): IdeBridgeService {
  return new IdeBridgeService(makeConfiguration(), makeAuth(), makeSecurity(), makeLogger())
}

function setSingleWorkspaceFolder(path: string): void {
  mockVscode.workspace.workspaceFolders = [
    { uri: mockVscode.Uri.file(path), name: 'workspace', index: 0 },
  ]
}

suite('ide-bridge — resolveSiteOrigin', () => {
  test('strips the dev-assistant agent suffix to get the site origin', () => {
    assert.strictEqual(
      resolveSiteOrigin('https://jokalala.com/api/agents/dev-assistant'),
      'https://jokalala.com'
    )
  })

  test('strips the suffix with a trailing slash', () => {
    assert.strictEqual(
      resolveSiteOrigin('https://jokalala.com/api/agents/dev-assistant/'),
      'https://jokalala.com'
    )
  })

  test('leaves a plain site origin untouched', () => {
    assert.strictEqual(resolveSiteOrigin('https://jokalala.com'), 'https://jokalala.com')
  })

  test('preserves a non-agent path', () => {
    assert.strictEqual(
      resolveSiteOrigin('https://jokalala.com/some/other/path'),
      'https://jokalala.com/some/other/path'
    )
  })

  test('works with localhost during development', () => {
    assert.strictEqual(
      resolveSiteOrigin('http://localhost:3000/api/agents/dev-assistant'),
      'http://localhost:3000'
    )
  })

  test('returns the trimmed input unchanged for an unparseable URL', () => {
    assert.strictEqual(resolveSiteOrigin('not-a-url'), 'not-a-url')
  })

  test('returns empty string for empty input', () => {
    assert.strictEqual(resolveSiteOrigin(''), '')
  })
})

suite('ide-bridge — applyProposalDiff', () => {
  setup(() => {
    mockVscode._resetMockFs()
    setSingleWorkspaceFolder('/workspace')
    mockVscode.window.showWarningMessage = async () => undefined // default: user cancels
  })

  test('applies a single-file patch to an existing file after the user confirms', async () => {
    mockVscode._setMockFile('/workspace/src/a.ts', 'const x = 1\n')
    mockVscode.window.showWarningMessage = async () => 'Apply'

    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1',
      '+const x = 2',
      '',
    ].join('\n')

    const result = await makeService().applyProposalDiff(diff)

    assert.deepStrictEqual(result.applied, ['src/a.ts'])
    assert.deepStrictEqual(result.failed, [])
    assert.strictEqual(mockVscode._getMockFile('/workspace/src/a.ts'), 'const x = 2\n')
  })

  test('does not modify the file when the user cancels the confirm dialog', async () => {
    mockVscode._setMockFile('/workspace/src/a.ts', 'const x = 1\n')
    // showWarningMessage default (from setup) resolves undefined = cancel

    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1',
      '+const x = 2',
      '',
    ].join('\n')

    const result = await makeService().applyProposalDiff(diff)

    assert.deepStrictEqual(result.applied, [])
    assert.deepStrictEqual(result.failed, ['cancelled'])
    assert.strictEqual(mockVscode._getMockFile('/workspace/src/a.ts'), 'const x = 1\n')
  })

  test('creates a new file when the diff marks it as new (/dev/null old side)', async () => {
    mockVscode.window.showWarningMessage = async () => 'Apply'

    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,1 @@',
      '+export const x = 1',
      '',
    ].join('\n')

    const result = await makeService().applyProposalDiff(diff)

    assert.deepStrictEqual(result.applied, ['src/new.ts'])
    assert.strictEqual(mockVscode._getMockFile('/workspace/src/new.ts'), 'export const x = 1')
  })

  test('reports a per-file failure without discarding successful files in the same patch', async () => {
    mockVscode._setMockFile('/workspace/keep.ts', 'old line\n')
    mockVscode.window.showWarningMessage = async () => 'Apply'

    const diff = [
      'diff --git a/keep.ts b/keep.ts',
      '--- a/keep.ts',
      '+++ b/keep.ts',
      '@@ -1,1 +1,1 @@',
      '-old line',
      '+new line',
      'diff --git a/gone.ts b/gone.ts',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-old line',
      '',
    ].join('\n')

    const result = await makeService().applyProposalDiff(diff)

    assert.deepStrictEqual(result.applied, ['keep.ts'])
    assert.ok(result.failed.some(f => f.includes('gone.ts')))
    assert.strictEqual(mockVscode._getMockFile('/workspace/keep.ts'), 'new line\n')
  })

  test('throws when no workspace folder is open', async () => {
    mockVscode.workspace.workspaceFolders = []
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n')

    await assert.rejects(() => makeService().applyProposalDiff(diff), /workspace folder/i)
  })

  test('rejects a payload that is not a unified diff', async () => {
    await assert.rejects(
      () => makeService().applyProposalDiff('not a diff at all'),
      /not a unified diff/i
    )
  })
})

suite('ide-bridge — shouldDeltaSyncDocument / relativePathForDoc', () => {
  setup(() => {
    setSingleWorkspaceFolder('/workspace')
  })

  test('accepts a normal source file inside the workspace', () => {
    const doc = mockVscode._makeTextDocument('/workspace/src/a.ts', 'content')
    assert.strictEqual(makeService().shouldDeltaSyncDocument(doc), true)
  })

  test('rejects files under node_modules', () => {
    const doc = mockVscode._makeTextDocument('/workspace/node_modules/pkg/index.ts', 'content')
    assert.strictEqual(makeService().shouldDeltaSyncDocument(doc), false)
  })

  test('rejects non-text extensions', () => {
    const doc = mockVscode._makeTextDocument('/workspace/image.png', 'binary')
    assert.strictEqual(makeService().shouldDeltaSyncDocument(doc), false)
  })

  test('rejects untitled documents', () => {
    const doc = mockVscode._makeTextDocument('/workspace/untitled.ts', 'content', { isUntitled: true })
    assert.strictEqual(makeService().shouldDeltaSyncDocument(doc), false)
  })

  test('rejects documents outside any workspace folder', () => {
    const doc = mockVscode._makeTextDocument('/elsewhere/a.ts', 'content')
    assert.strictEqual(makeService().shouldDeltaSyncDocument(doc), false)
  })

  test('relativePathForDoc strips the workspace root and normalizes slashes', () => {
    const doc = mockVscode._makeTextDocument('/workspace/src/a.ts', 'content')
    assert.strictEqual(makeService().relativePathForDoc(doc), 'src/a.ts')
  })
})

suite('ide-bridge — hydrateWorkspaceFile guard rails', () => {
  setup(() => {
    mockVscode._resetMockFs()
    setSingleWorkspaceFolder('/workspace')
  })

  test('rejects path traversal', async () => {
    await assert.rejects(
      () => makeService().hydrateWorkspaceFile('../../etc/passwd'),
      /invalid path/i
    )
  })

  test('rejects an empty path', async () => {
    await assert.rejects(() => makeService().hydrateWorkspaceFile('   '), /invalid path/i)
  })

  test('throws when no workspace folder is open', async () => {
    mockVscode.workspace.workspaceFolders = []
    await assert.rejects(
      () => makeService().hydrateWorkspaceFile('src/a.ts'),
      /open a workspace folder/i
    )
  })

  test('rejects a file over the 100k char hydrate limit before hitting the network', async () => {
    mockVscode._setMockFile('/workspace/big.ts', 'x'.repeat(100_001))
    await assert.rejects(
      () => makeService().hydrateWorkspaceFile('big.ts'),
      /too large/i
    )
  })
})
