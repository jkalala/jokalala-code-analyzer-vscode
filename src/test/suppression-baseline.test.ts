/**
 * Tests for inline suppression directives (// jokalala-ignore, nosec) and
 * baseline fingerprinting — the two mechanisms that make findings actionable
 * in CI without disabling rules globally.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { getOfflineAnalyzer } from '../core/offline-analyzer'
import {
  fingerprintIssues,
  createBaselineFile,
  parseBaselineFile,
} from '../core/baseline'
import { buildSuppressionIndex } from '../core/suppression-directives'

function analyze(code: string, extra: Record<string, unknown> = {}) {
  const offline = getOfflineAnalyzer()
  return offline.analyze(code, 'javascript', { packProfile: 'precision', ...extra } as any)
}

suite('Inline suppression directives', () => {
  test('trailing // jokalala-ignore suppresses all findings on that line', () => {
    const result = analyze('eval(req.query.code); // jokalala-ignore')
    assert.strictEqual(result.issues.length, 0)
    assert.strictEqual(result.summary.suppressedCount! > 0, true)
  })

  test('standalone // jokalala-ignore suppresses the NEXT line', () => {
    const code = ['// jokalala-ignore', 'eval(req.query.code);'].join('\n')
    const result = analyze(code)
    assert.strictEqual(result.issues.length, 0)
  })

  test('jokalala-ignore-next-line works as a trailing comment too', () => {
    const code = ['const x = 1; // jokalala-ignore-next-line', 'eval(req.query.code);'].join('\n')
    const result = analyze(code)
    assert.strictEqual(result.issues.length, 0)
  })

  test('rule-scoped ignore suppresses only the named rule', () => {
    const result = analyze('eval(req.query.code); // jokalala-ignore: js-taint-code-injection')
    const ruleIds = result.issues.map((i) => i.ruleId)
    assert.ok(!ruleIds.includes('js-taint-code-injection'), 'taint rule should be suppressed')
    assert.ok(ruleIds.includes('js-eval-call'), 'pack rule should surface once taint is suppressed')
  })

  test('ignore naming a different rule does NOT suppress', () => {
    const result = analyze('eval(req.query.code); // jokalala-ignore: some-other-rule')
    assert.ok(result.issues.some((i) => i.ruleId === 'js-taint-code-injection'))
  })

  test('nosec and NOSONAR compat aliases suppress the line', () => {
    for (const alias of ['nosec', 'NOSONAR']) {
      const result = analyze(`eval(req.query.code); // ${alias}`)
      assert.strictEqual(result.issues.length, 0, `${alias} should suppress`)
    }
  })

  test('directives on one line do not affect other lines', () => {
    const code = [
      'eval(req.query.a); // jokalala-ignore',
      'eval(req.query.b);',
    ].join('\n')
    const result = analyze(code)
    assert.ok(result.issues.some((i) => i.line === 2))
    assert.ok(!result.issues.some((i) => i.line === 1))
  })

  test('respectInlineSuppressions: false ignores directives', () => {
    const result = analyze('eval(req.query.code); // jokalala-ignore', {
      respectInlineSuppressions: false,
    })
    assert.ok(result.issues.length > 0)
  })

  // Rule lists are only read after an explicit colon. Otherwise Bandit's
  // `# nosec B101` or a trailing reason would be parsed as a rule filter and
  // suppress nothing — the opposite of what the author asked for.
  test('nosec with a foreign tool rule id still suppresses everything', () => {
    const result = analyze('eval(req.query.code); // nosec B101')
    assert.strictEqual(result.issues.length, 0)
  })

  test('jokalala-ignore followed by a prose reason still suppresses', () => {
    const result = analyze('eval(req.query.code); // jokalala-ignore false positive, reviewed')
    assert.strictEqual(result.issues.length, 0)
  })

  test('standalone directive with a prose reason still targets the next line', () => {
    const code = ['// jokalala-ignore reviewed by security', 'eval(req.query.code);'].join('\n')
    assert.strictEqual(analyze(code).issues.length, 0)
  })

  test('index parses # and /* comment styles and hash-style rules lists', () => {
    const idx = buildSuppressionIndex(
      ['os.system(cmd)  # nosec', 'other()', '/* jokalala-ignore: rule-x */ dangerous()'].join('\n')
    )
    assert.strictEqual(idx.isSuppressed(1, 'anything'), true)
    assert.strictEqual(idx.isSuppressed(2, 'anything'), false)
    assert.strictEqual(idx.isSuppressed(3, 'rule-x'), true)
    assert.strictEqual(idx.isSuppressed(3, 'rule-y'), false)
  })
})

suite('Baseline fingerprinting', () => {
  const VULN = 'db.query("SELECT * FROM users WHERE id = " + req.query.id);'
  const FILE = 'src/routes/users.js'

  function baselineFor(code: string): Set<string> {
    const result = analyze(code, { filePathHint: FILE })
    const file = createBaselineFile(fingerprintIssues(result.issues, FILE, code))
    return parseBaselineFile(JSON.stringify(file))
  }

  test('baselined findings are excluded on re-scan and counted', () => {
    const baseline = baselineFor(VULN)
    assert.ok(baseline.size > 0, 'expected fingerprints in baseline')
    const result = analyze(VULN, { filePathHint: FILE, baseline })
    assert.strictEqual(result.issues.length, 0)
    assert.strictEqual(result.summary.baselinedCount, baseline.size)
  })

  test('fingerprints survive line-number drift (code shifted down)', () => {
    const baseline = baselineFor(VULN)
    const shifted = ['// new comment', 'const unrelated = 1;', VULN].join('\n')
    const result = analyze(shifted, { filePathHint: FILE, baseline })
    assert.strictEqual(
      result.issues.filter((i) => i.ruleId === 'js-taint-sql-injection').length,
      0,
      'shifted finding should still match its baseline fingerprint'
    )
  })

  test('NEW findings are still reported alongside baselined ones', () => {
    const baseline = baselineFor(VULN)
    const withNew = [VULN, 'eval(req.query.code);'].join('\n')
    const result = analyze(withNew, { filePathHint: FILE, baseline })
    const ruleIds = result.issues.map((i) => i.ruleId)
    assert.ok(!ruleIds.includes('js-taint-sql-injection'), 'old finding stays baselined')
    assert.ok(ruleIds.includes('js-taint-code-injection'), 'new finding must surface')
  })

  test('a second identical vulnerable line is NOT absorbed by the baseline', () => {
    const baseline = baselineFor(VULN)
    const duplicated = [VULN, VULN].join('\n')
    const result = analyze(duplicated, { filePathHint: FILE, baseline })
    assert.strictEqual(
      result.issues.filter((i) => i.ruleId === 'js-taint-sql-injection').length,
      1,
      'occurrence indexing should keep the second copy visible'
    )
  })

  test('baseline is path-specific', () => {
    const baseline = baselineFor(VULN)
    const result = analyze(VULN, { filePathHint: 'src/routes/orders.js', baseline })
    assert.ok(result.issues.length > 0, 'different file must not match the baseline')
  })

  test('editing the flagged line invalidates its fingerprint', () => {
    const baseline = baselineFor(VULN)
    const edited = 'db.query("SELECT * FROM users WHERE email = " + req.query.email);'
    const result = analyze(edited, { filePathHint: FILE, baseline })
    assert.ok(result.issues.length > 0, 'changed code deserves a fresh finding')
  })

  test('parseBaselineFile tolerates malformed JSON', () => {
    assert.strictEqual(parseBaselineFile('{not json').size, 0)
    assert.strictEqual(parseBaselineFile('{"fingerprints": "nope"}').size, 0)
  })
})
