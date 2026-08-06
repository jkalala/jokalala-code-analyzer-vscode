/**
 * Unit tests for the intraprocedural taint engine (source→sink tracking).
 *
 * Each sink class is tested as a vulnerable/safe pair: the vulnerable variant
 * must produce a js-taint-* finding with path evidence, and the safe variant
 * (parameterized query, sanitizer, numeric coercion, …) must NOT — that
 * asymmetry is the whole point of dataflow over single-node matching.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { getOfflineAnalyzer } from '../core/offline-analyzer'
import { Severity } from '../core/security-types'

function analyze(code: string, filePathHint?: string) {
  const offline = getOfflineAnalyzer()
  return offline.analyze(code, 'javascript', { packProfile: 'precision', filePathHint })
}

function taintIssues(code: string, ruleId?: string) {
  const result = analyze(code)
  return result.issues.filter(
    (i) => i.ruleId.startsWith('js-taint-') && (!ruleId || i.ruleId === ruleId)
  )
}

suite('TaintAnalyzer — SQL injection (CWE-89)', () => {
  test('flags tainted string concatenation into db.query', () => {
    const found = taintIssues(
      'db.query("SELECT * FROM users WHERE id = " + req.query.id);',
      'js-taint-sql-injection'
    )
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.CRITICAL)
    assert.deepStrictEqual(found[0].cwe, ['CWE-89'])
  })

  test('flags tainted template literal into db.query', () => {
    const found = taintIssues(
      'db.query(`SELECT * FROM users WHERE name = \'${req.body.name}\'`);',
      'js-taint-sql-injection'
    )
    assert.strictEqual(found.length, 1)
  })

  test('tracks taint through intermediate variables and records the flow', () => {
    const code = [
      'const id = req.query.id;',
      'const sql = "SELECT * FROM users WHERE id = " + id;',
      'db.query(sql);',
    ].join('\n')
    const found = taintIssues(code, 'js-taint-sql-injection')
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].line, 3)
    const steps = (found[0].metadata as any).taintSteps
    assert.strictEqual(steps.length, 2, 'expected two propagation steps (id, sql)')
    assert.ok((found[0].metadata as any).taintSource.snippet.includes('req.query'))
  })

  test('does NOT flag parameterized queries (the fix pattern)', () => {
    const found = taintIssues(
      'db.query("SELECT * FROM users WHERE id = ?", [req.query.id]);',
      'js-taint-sql-injection'
    )
    assert.strictEqual(found.length, 0)
  })

  test('tracks taint through destructuring of req.query', () => {
    const code = [
      'const { id } = req.query;',
      'db.query("SELECT * FROM users WHERE id = " + id);',
    ].join('\n')
    const found = taintIssues(code, 'js-taint-sql-injection')
    assert.strictEqual(found.length, 1)
  })

  test('subsumes the single-node pack finding for the same CWE+line', () => {
    const result = analyze('db.query("SELECT * FROM x WHERE id = " + req.query.id);')
    const cwe89 = result.issues.filter((i) => (i.cwe || []).includes('CWE-89'))
    assert.strictEqual(cwe89.length, 1, 'taint finding should replace the pack finding')
    assert.strictEqual(cwe89[0].ruleId, 'js-taint-sql-injection')
  })
})

suite('TaintAnalyzer — command injection (CWE-78)', () => {
  test('flags exec() with a command built from req.body', () => {
    const found = taintIssues(
      "const { exec } = require('child_process'); exec('ping -c 1 ' + req.body.host);",
      'js-taint-command-injection'
    )
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.CRITICAL)
  })

  test('does NOT flag when input is coerced with parseInt', () => {
    const found = taintIssues(
      "const { exec } = require('child_process'); exec('sleep ' + parseInt(req.body.seconds));",
      'js-taint-command-injection'
    )
    assert.strictEqual(found.length, 0)
  })

  test('does NOT flag unresolvable free variables (no invented taint)', () => {
    const found = taintIssues(
      "const { exec } = require('child_process'); exec('git checkout ' + branchName);",
      'js-taint-command-injection'
    )
    assert.strictEqual(found.length, 0)
  })

  test('flags exec() on a child_process-shaped receiver', () => {
    const found = taintIssues(
      "child_process.exec('ping ' + req.body.host);",
      'js-taint-command-injection'
    )
    assert.strictEqual(found.length, 1)
  })

  // `exec` is also RegExp.prototype.exec and sqlite's db.exec — matching the
  // bare method name flagged some of the most common code in a JS codebase
  // as critical command injection.
  test('does NOT flag RegExp.prototype.exec', () => {
    for (const code of [
      'const m = pattern.exec(req.query.q);',
      'const m = /ab+/.exec(req.query.q);',
      'const m = SAFE_RE.exec(req.body.value);',
    ]) {
      assert.strictEqual(
        taintIssues(code, 'js-taint-command-injection').length,
        0,
        `unexpected command-injection finding for: ${code}`
      )
    }
  })

  test('does NOT flag a database handle .exec()', () => {
    const found = taintIssues('db.exec(req.body.sql);', 'js-taint-command-injection')
    assert.strictEqual(found.length, 0)
  })
})

suite('TaintAnalyzer — code injection (CWE-95)', () => {
  test('flags eval() of request data and dedupes against the pack eval rule', () => {
    const result = analyze('eval(req.query.code);')
    const cwe95 = result.issues.filter((i) => (i.cwe || []).includes('CWE-95'))
    assert.strictEqual(cwe95.length, 1)
    assert.strictEqual(cwe95[0].ruleId, 'js-taint-code-injection')
    assert.strictEqual(cwe95[0].severity, Severity.CRITICAL)
  })
})

suite('TaintAnalyzer — XSS (CWE-79)', () => {
  test('flags innerHTML assignment from location.hash', () => {
    const found = taintIssues('el.innerHTML = location.hash;', 'js-taint-xss')
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.HIGH)
  })

  test('does NOT flag innerHTML of DOMPurify.sanitize output', () => {
    const found = taintIssues(
      'el.innerHTML = DOMPurify.sanitize(location.hash);',
      'js-taint-xss'
    )
    assert.strictEqual(found.length, 0)
  })

  test('respects sanitizing reassignment (flow-sensitivity)', () => {
    const code = [
      'let q = req.query.q;',
      'q = encodeURIComponent(q);',
      'el.innerHTML = q;',
    ].join('\n')
    const found = taintIssues(code, 'js-taint-xss')
    assert.strictEqual(found.length, 0)
  })

  test('downgrades severity and confidence for partial sanitizers like replace()', () => {
    const code = [
      "const clean = req.query.q.replace('<', '');",
      'document.write(clean);',
    ].join('\n')
    const found = taintIssues(code, 'js-taint-xss')
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.MEDIUM)
    assert.ok(found[0].confidence < 0.9)
    const partials = (found[0].metadata as any).partialSanitizers
    assert.ok(partials.includes('replace()'))
  })

  test('flags dangerouslySetInnerHTML with tainted __html', () => {
    const code = 'const el = <div dangerouslySetInnerHTML={{ __html: req.query.bio }} />;'
    const found = taintIssues(code, 'js-taint-xss')
    assert.strictEqual(found.length, 1)
  })
})

suite('TaintAnalyzer — path traversal (CWE-22)', () => {
  test('flags fs.readFile of a request-controlled path', () => {
    const found = taintIssues(
      'fs.readFile(req.params.name, cb);',
      'js-taint-path-traversal'
    )
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.HIGH)
  })

  test('does NOT flag when the path goes through path.basename', () => {
    const found = taintIssues(
      'fs.readFile(path.basename(req.params.name), cb);',
      'js-taint-path-traversal'
    )
    assert.strictEqual(found.length, 0)
  })
})

suite('TaintAnalyzer — open redirect (CWE-601)', () => {
  test('flags res.redirect of a request parameter', () => {
    const found = taintIssues('res.redirect(req.query.next);', 'js-taint-open-redirect')
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].severity, Severity.MEDIUM)
  })

  test('does NOT flag redirect to a literal path', () => {
    const found = taintIssues("res.redirect('/dashboard');", 'js-taint-open-redirect')
    assert.strictEqual(found.length, 0)
  })
})

suite('TaintAnalyzer — computed confidence', () => {
  test('longer propagation paths score lower than direct flows', () => {
    const direct = taintIssues('el.innerHTML = location.hash;', 'js-taint-xss')
    const indirect = taintIssues(
      ['const a = location.hash;', 'const b = a;', 'el.innerHTML = b;'].join('\n'),
      'js-taint-xss'
    )
    assert.strictEqual(direct.length, 1)
    assert.strictEqual(indirect.length, 1)
    assert.ok(
      indirect[0].confidence < direct[0].confidence,
      `expected ${indirect[0].confidence} < ${direct[0].confidence}`
    )
  })

  test('falsePositiveLikelihood is derived from confidence, not a constant', () => {
    const found = taintIssues('el.innerHTML = location.hash;', 'js-taint-xss')
    assert.strictEqual(
      found[0].falsePositiveLikelihood,
      Math.round((1 - found[0].confidence) * 100) / 100
    )
  })
})

suite('TaintAnalyzer — suppression and options', () => {
  test('suppresses taint findings in test files via filePathHint', () => {
    const result = analyze(
      'db.query("SELECT * FROM x WHERE id = " + req.query.id);',
      'src/__tests__/query.test.ts'
    )
    assert.strictEqual(result.issues.filter((i) => i.ruleId.startsWith('js-taint-')).length, 0)
  })

  test('enableTaintAnalysis: false disables the taint pass', () => {
    const offline = getOfflineAnalyzer()
    const result = offline.analyze(
      'db.query("SELECT * FROM x WHERE id = " + req.query.id);',
      'javascript',
      { packProfile: 'precision', enableTaintAnalysis: false } as any
    )
    assert.strictEqual(result.issues.filter((i) => i.ruleId.startsWith('js-taint-')).length, 0)
  })
})
