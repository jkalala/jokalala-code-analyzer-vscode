/**
 * Unit tests for the local-deterministic-engine's AST visitors, focused on
 * the static-argument severity downgrade for eval()/child_process calls.
 *
 * Real-world motivation: scanning a large production codebase (a SAST/SCA
 * tooling repo whose whole job is to shell out to external tools) showed
 * js-child-process-exec alone accounted for 73.6% of all findings, almost
 * entirely on calls with fully hardcoded command strings — code that
 * genuinely can't be reached with attacker-controlled input, but was still
 * screaming "critical" alongside the small number of calls that actually
 * matter. This downgrades (never fully suppresses) findings whose command
 * argument has no variable interpolation at all.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { getOfflineAnalyzer } from '../core/offline-analyzer'
import { Severity } from '../core/security-types'

function analyze(code: string) {
  const offline = getOfflineAnalyzer()
  return offline.analyze(code, 'javascript', { packProfile: 'precision' })
}

suite('LocalDeterministicEngine — static-argument downgrade', () => {
  suite('eval()', () => {
    test('downgrades eval() with a plain string literal argument', () => {
      const result = analyze('eval("1 + 1");')
      const finding = result.issues.find(i => i.ruleId === 'js-eval-call')
      assert.ok(finding, 'expected an eval finding')
      assert.strictEqual(finding!.severity, Severity.LOW)
      assert.ok(finding!.message?.includes('static string literal'))
    })

    test('does NOT downgrade eval() with a dynamic (variable) argument', () => {
      const result = analyze('eval(userInput);')
      const finding = result.issues.find(i => i.ruleId === 'js-eval-call')
      assert.ok(finding, 'expected an eval finding')
      assert.notStrictEqual(finding!.severity, Severity.LOW)
    })

    test('does NOT downgrade eval() with a template literal that interpolates a variable', () => {
      const result = analyze('eval(`run ${cmd}`);')
      const finding = result.issues.find(i => i.ruleId === 'js-eval-call')
      assert.ok(finding, 'expected an eval finding')
      assert.notStrictEqual(finding!.severity, Severity.LOW)
    })

    test('downgrades eval() with a template literal that has no interpolation', () => {
      const result = analyze('eval(`1 + 1`);')
      const finding = result.issues.find(i => i.ruleId === 'js-eval-call')
      assert.ok(finding, 'expected an eval finding')
      assert.strictEqual(finding!.severity, Severity.LOW)
    })
  })

  suite('child_process exec/spawn', () => {
    test('downgrades exec() with a plain string literal command', () => {
      const result = analyze("const { exec } = require('child_process'); exec('git status');")
      const finding = result.issues.find(i => i.ruleId === 'js-child-process-exec')
      assert.ok(finding, 'expected a child_process finding')
      assert.strictEqual(finding!.severity, Severity.LOW)
    })

    test('does NOT downgrade exec() with a dynamic command built from a variable', () => {
      const result = analyze(
        "const { exec } = require('child_process'); exec('git ' + userBranch);"
      )
      const finding = result.issues.find(i => i.ruleId === 'js-child-process-exec')
      assert.ok(finding, 'expected a child_process finding')
      assert.notStrictEqual(finding!.severity, Severity.LOW)
    })

    test('does NOT downgrade execSync() with a variable command', () => {
      const result = analyze(
        "const { execSync } = require('child_process'); execSync(command);"
      )
      const finding = result.issues.find(i => i.ruleId === 'js-child-process-exec')
      assert.ok(finding, 'expected a child_process finding')
      assert.notStrictEqual(finding!.severity, Severity.LOW)
    })
  })
})
