/// <reference types="mocha" />

import * as assert from 'assert'
import * as path from 'path'
import { buildFindingRows, resolveFindingPath } from '../providers/findings-panel'
import type { FileAnalysisResult, Issue } from '../interfaces/code-analysis-service.interface'

const issue = (over: Partial<Issue>): Issue => ({
  severity: 'medium',
  category: 'x',
  message: 'm',
  source: 'static',
  ...over,
})

suite('findings panel rows', () => {
  const root = path.resolve('/proj')
  const results: FileAnalysisResult[] = [
    {
      filePath: path.join(root, 'src', 'B.java'),
      issues: [
        issue({ severity: 'low', line: 5, message: 'low one' }),
        issue({
          severity: 'critical',
          line: 21,
          message: '<img src=x onerror=alert(1)> full message',
          filePath: path.join(root, 'src', 'B.java'),
          metadata: { cwe: ['CWE-89'], crossFile: true, engineTier: 2 },
        }),
      ],
    },
    {
      filePath: path.join(root, 'src', 'A.java'),
      issues: [issue({ severity: 'critical', line: 3, tags: ['CWE-78'] })],
    },
  ]

  test('sorts by severity, then file, then line, with sequential indexes', () => {
    const rows = buildFindingRows(results, [root])
    assert.deepStrictEqual(rows.map(r => r.index), [0, 1, 2])
    assert.deepStrictEqual(rows.map(r => `${r.displayPath}:${r.line}`), [
      'src/A.java:3',
      'src/B.java:21',
      'src/B.java:5',
    ])
  })

  test('keeps the full message, extracts CWE and cross-file flags', () => {
    const rows = buildFindingRows(results, [root])
    const b = rows.find(r => r.line === 21)!
    assert.strictEqual(b.cwe, 'CWE-89')
    assert.strictEqual(b.crossFile, true)
    assert.strictEqual(b.tier, 'engine')
    assert.ok(b.message.includes('<img'), 'message is passed through as data, not HTML')
    assert.strictEqual(rows.find(r => r.line === 3)!.cwe, 'CWE-78')
  })

  test('a file outside the workspace keeps its full path', () => {
    const rows = buildFindingRows(
      [{ filePath: path.resolve('/elsewhere/X.java'), issues: [issue({ line: 1 })] }],
      [root]
    )
    assert.ok(rows[0]!.displayPath.endsWith('elsewhere/X.java'))
  })
})

suite('findings panel path resolution', () => {
  test('relative paths resolve against a workspace root; absolute ones are unchanged', () => {
    const r1 = path.resolve('/ws/one')
    const r2 = path.resolve('/ws/two')
    assert.strictEqual(resolveFindingPath('src/A.java', [r1, r2]), path.resolve(r1, 'src/A.java'))
    const abs = path.resolve('/elsewhere/X.java')
    assert.strictEqual(resolveFindingPath(abs, [r1]), abs)
    assert.strictEqual(resolveFindingPath('', [r1]), '')
    assert.strictEqual(resolveFindingPath('src/A.java', []), 'src/A.java')
  })
})
