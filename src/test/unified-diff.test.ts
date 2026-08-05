/**
 * Unit tests for the unified-diff parse/apply engine — the one piece of code
 * with real disk-write power in the Dev Chat IDE bridge (via applyProposalDiff
 * in ide-bridge.ts). No vscode dependency, so these run in plain mocha.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import {
  applyHunksToContent,
  isSafeRelativePath,
  looksLikeUnifiedDiff,
  parseUnifiedDiff,
  summarizePatch,
} from '../utils/unified-diff'

function makeDiff(path: string, oldStart: number, oldLines: string[], newLines: string[]): string {
  const hunk = [
    ...oldLines.map(l => `-${l}`),
    ...newLines.map(l => `+${l}`),
  ]
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${oldLines.length} +${oldStart},${newLines.length} @@`,
    ...hunk,
    '',
  ].join('\n')
}

suite('unified-diff — looksLikeUnifiedDiff', () => {
  test('recognizes diff --git header', () => {
    assert.strictEqual(looksLikeUnifiedDiff('diff --git a/x b/x\n@@ -1,1 +1,1 @@\n'), true)
  })

  test('rejects plain text', () => {
    assert.strictEqual(looksLikeUnifiedDiff('just some regular text, no diff markers'), false)
  })
})

suite('unified-diff — parseUnifiedDiff', () => {
  test('parses a single-file, single-hunk patch', () => {
    const diff = makeDiff('src/a.ts', 4, ['const x = 1'], ['const x = 2'])
    const files = parseUnifiedDiff(diff)
    assert.strictEqual(files.length, 1)
    assert.strictEqual(files[0].path, 'src/a.ts')
    assert.strictEqual(files[0].hunks.length, 1)
    assert.strictEqual(files[0].isNew, false)
    assert.strictEqual(files[0].isDeleted, false)
  })

  test('parses a multi-file patch', () => {
    const diff =
      makeDiff('a.ts', 1, ['old a'], ['new a']) + makeDiff('b.ts', 2, ['old b'], ['new b'])
    const files = parseUnifiedDiff(diff)
    assert.strictEqual(files.length, 2)
    assert.deepStrictEqual(files.map(f => f.path), ['a.ts', 'b.ts'])
  })

  test('marks new files via /dev/null old side', () => {
    const diff = [
      'diff --git a/new.ts b/new.ts',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,1 @@',
      '+export const x = 1',
      '',
    ].join('\n')
    const files = parseUnifiedDiff(diff)
    assert.strictEqual(files.length, 1)
    assert.strictEqual(files[0].isNew, true)
  })

  test('rejects hunks targeting unsafe paths (path traversal)', () => {
    const diff = makeDiff('../../etc/passwd', 1, ['a'], ['b'])
    const files = parseUnifiedDiff(diff)
    assert.strictEqual(files.length, 0)
  })

  test('rejects absolute paths', () => {
    const diff = makeDiff('/etc/passwd', 1, ['a'], ['b'])
    const files = parseUnifiedDiff(diff)
    assert.strictEqual(files.length, 0)
  })

  test('returns empty array for a patch with no hunks', () => {
    const files = parseUnifiedDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n')
    assert.strictEqual(files.length, 0)
  })
})

suite('unified-diff — applyHunksToContent', () => {
  test('applies an exact-context single-line replacement', () => {
    const original = ['line1', 'line2', 'const x = 1', 'line4'].join('\n')
    const diff = makeDiff('f.ts', 3, ['const x = 1'], ['const x = 2'])
    const [file] = parseUnifiedDiff(diff)
    const patched = applyHunksToContent(original, file.hunks)
    assert.ok(patched.includes('const x = 2'))
    assert.ok(!patched.includes('const x = 1'))
  })

  test('applies multiple hunks in one file, bottom-to-top', () => {
    const original = ['a', 'b', 'c', 'd', 'e'].join('\n')
    const diff =
      [
        'diff --git a/f.ts b/f.ts',
        '--- a/f.ts',
        '+++ b/f.ts',
        '@@ -1,1 +1,1 @@',
        '-a',
        '+A',
        '@@ -5,1 +5,1 @@',
        '-e',
        '+E',
        '',
      ].join('\n')
    const [file] = parseUnifiedDiff(diff)
    const patched = applyHunksToContent(original, file.hunks)
    assert.strictEqual(patched, ['A', 'b', 'c', 'd', 'E'].join('\n'))
  })

  test('fuzzy-matches when the target has drifted a few lines from oldStart', () => {
    // Hunk claims line 3, but an extra line was inserted above it since scan time.
    const original = ['line1', 'INSERTED', 'line2', 'const x = 1', 'line4'].join('\n')
    const diff = makeDiff('f.ts', 3, ['const x = 1'], ['const x = 2'])
    const [file] = parseUnifiedDiff(diff)
    const patched = applyHunksToContent(original, file.hunks)
    assert.ok(patched.includes('const x = 2'))
  })

  test('throws a clear error when context no longer exists anywhere in the file', () => {
    const original = ['completely', 'different', 'content'].join('\n')
    const diff = makeDiff('f.ts', 1, ['const x = 1'], ['const x = 2'])
    const [file] = parseUnifiedDiff(diff)
    assert.throws(() => applyHunksToContent(original, file.hunks), /context mismatch/)
  })

  test('preserves trailing newline presence', () => {
    const withNewline = 'const x = 1\n'
    const diff = makeDiff('f.ts', 1, ['const x = 1'], ['const x = 2'])
    const [file] = parseUnifiedDiff(diff)
    const patched = applyHunksToContent(withNewline, file.hunks)
    assert.ok(patched.endsWith('\n'))
  })
})

suite('unified-diff — isSafeRelativePath', () => {
  test('accepts a normal relative path', () => {
    assert.strictEqual(isSafeRelativePath('src/routes/users.ts'), true)
  })

  test('rejects path traversal', () => {
    assert.strictEqual(isSafeRelativePath('../../etc/passwd'), false)
  })

  test('rejects absolute unix paths', () => {
    assert.strictEqual(isSafeRelativePath('/etc/passwd'), false)
  })

  test('rejects windows drive-letter paths', () => {
    assert.strictEqual(isSafeRelativePath('C:/Windows/System32'), false)
  })

  test('rejects /dev/null and empty string', () => {
    assert.strictEqual(isSafeRelativePath('/dev/null'), false)
    assert.strictEqual(isSafeRelativePath(''), false)
  })
})

suite('unified-diff — summarizePatch', () => {
  test('summarizes file and hunk counts', () => {
    const diff =
      makeDiff('a.ts', 1, ['x'], ['y']) + makeDiff('b.ts', 1, ['x'], ['y'])
    const files = parseUnifiedDiff(diff)
    const summary = summarizePatch(files)
    assert.ok(summary.includes('2 file(s)'))
    assert.ok(summary.includes('a.ts'))
    assert.ok(summary.includes('b.ts'))
  })
})
