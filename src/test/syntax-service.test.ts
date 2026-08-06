/**
 * Tests for the tree-sitter syntax precision layer (Python/Java).
 *
 * The layer must be strictly additive: before initialization the engine
 * behaves exactly as regex-only (fallback suite), and after initialization
 * it removes comment noise and downgrades provably-static Python calls
 * without losing any live finding.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as path from 'path'
import { getOfflineAnalyzer } from '../core/offline-analyzer'
import { Severity } from '../core/security-types'
import {
  initSyntaxService,
  resetSyntaxService,
} from '../core/syntax-service'

function analyze(code: string, lang: string) {
  return getOfflineAnalyzer().analyze(code, lang, { packProfile: 'precision' })
}

function findRule(code: string, lang: string, ruleId: string) {
  return analyze(code, lang).issues.find((i) => i.ruleId === ruleId)
}

function wasmPaths() {
  return {
    runtimeWasm: path.join(
      path.dirname(require.resolve('web-tree-sitter')),
      'web-tree-sitter.wasm'
    ),
    grammars: {
      python: path.join(
        path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
        'wasm',
        'tree-sitter-python.wasm'
      ),
      java: path.join(
        path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
        'wasm',
        'tree-sitter-java.wasm'
      ),
    },
  }
}

suite('Syntax layer — not-ready fallback (regex-only)', () => {
  suiteSetup(() => resetSyntaxService())

  test('findings in comments are still reported before init (no silent behavior change)', () => {
    const found = findRule('# os.system("rm -rf " + p)', 'python', 'py-os-system-call')
    assert.ok(found, 'regex-only mode should keep the comment match')
  })

  test('static-argument calls are NOT downgraded before init', () => {
    const found = findRule('os.system("ls -la")', 'python', 'py-os-system-call')
    assert.ok(found)
    assert.notStrictEqual(found!.severity, Severity.LOW)
  })
})

suite('Syntax layer — tree-sitter refinement', () => {
  suiteSetup(async function () {
    this.timeout(30000)
    resetSyntaxService()
    const ok = await initSyntaxService(wasmPaths())
    if (!ok) this.skip()
  })

  suiteTeardown(() => resetSyntaxService())

  suite('comment filtering', () => {
    test('drops a Python finding inside a comment', () => {
      const found = findRule('# os.system("rm -rf " + p)', 'python', 'py-os-system-call')
      assert.strictEqual(found, undefined)
    })

    test('keeps the identical live Python finding', () => {
      const found = findRule('os.system("rm -rf " + p)', 'python', 'py-os-system-call')
      assert.ok(found)
    })

    test('drops a Java finding inside a line comment', () => {
      const found = findRule(
        '// Runtime.getRuntime().exec("ping " + host);',
        'java',
        'java-runtime-exec-concat'
      )
      assert.strictEqual(found, undefined)
    })

    test('keeps the identical live Java finding', () => {
      const found = findRule(
        'Runtime.getRuntime().exec("ping " + host);',
        'java',
        'java-runtime-exec-concat'
      )
      assert.ok(found)
    })

    test('commented-out secrets are still reported (secrets pack exempt)', () => {
      const found = findRule('# key = "AKIA' + 'A'.repeat(16) + '"', 'python', 'aws-access-key-id')
      assert.ok(found, 'a leaked credential is a leak even in a comment')
    })
  })

  suite('Python static-argument downgrade', () => {
    test('downgrades os.system with a pure string literal', () => {
      const found = findRule('os.system("ls -la")', 'python', 'py-os-system-call')
      assert.ok(found)
      assert.strictEqual(found!.severity, Severity.LOW)
      assert.ok(found!.message?.includes('static string literal'))
    })

    test('does NOT downgrade os.system with concatenated input', () => {
      const found = findRule('os.system("convert " + filename)', 'python', 'py-os-system-call')
      assert.ok(found)
      assert.notStrictEqual(found!.severity, Severity.LOW)
    })

    test('does NOT downgrade os.system with an f-string argument', () => {
      const found = findRule('os.system(f"ping {host}")', 'python', 'py-os-system-call')
      assert.ok(found)
      assert.notStrictEqual(found!.severity, Severity.LOW)
    })

    test('downgrades eval("1+1") but not eval(expr)', () => {
      const staticCall = findRule('eval("1+1")', 'python', 'py-eval-call')
      assert.ok(staticCall)
      assert.strictEqual(staticCall!.severity, Severity.LOW)

      const dynamic = findRule('eval(expr)', 'python', 'py-eval-call')
      assert.ok(dynamic)
      assert.notStrictEqual(dynamic!.severity, Severity.LOW)
    })
  })
})
