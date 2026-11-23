/// <reference types="mocha" />

import * as assert from 'assert'
import {
  LocalEngineClient,
  attributeEngineIssue,
  isLoopbackUrl,
} from '../services/local-engine-client'
import { mergeEngineResults } from '../services/local-engine-merge'
import type {
  Issue,
  ProjectAnalysisResult,
} from '../interfaces/code-analysis-service.interface'

const cfg = { enabled: true, url: 'http://127.0.0.1:3847', timeoutMs: 1000 }

const files = [
  { path: 'src/ProductController.java', content: 'class C {}', language: 'java' },
  { path: 'src/ProductRepository.java', content: 'class R {}', language: 'java' },
  { path: 'web/app.js', content: 'x', language: 'javascript' },
]

function fakeFetch(handler: (url: string, body: any) => unknown, status = 200) {
  const calls: Array<{ url: string; body: any }> = []
  const fn = async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined
    calls.push({ url, body })
    return { ok: status < 400, status, json: async () => handler(url, body) }
  }
  return { fn: fn as any, calls }
}

suite('local engine client', () => {
  test('only loopback URLs are accepted', () => {
    assert.ok(isLoopbackUrl('http://127.0.0.1:3847'))
    assert.ok(isLoopbackUrl('http://localhost:3847'))
    assert.ok(isLoopbackUrl('http://[::1]:3847'))
    assert.ok(!isLoopbackUrl('https://example.com'))
    assert.ok(!isLoopbackUrl('http://127.0.0.1.evil.com'))
    assert.ok(!isLoopbackUrl('file:///etc/passwd'))
  })

  test('never contacts a non-loopback endpoint', async () => {
    const { fn, calls } = fakeFetch(() => ({}))
    const client = new LocalEngineClient(
      { ...cfg, url: 'https://example.com' },
      [],
      undefined,
      fn
    )
    assert.strictEqual(await client.analyzeProject(files), null)
    assert.strictEqual(calls.length, 0)
  })

  test('returns null when disabled, unreachable, mock or non-Java', async () => {
    const off = fakeFetch(() => ({}))
    assert.strictEqual(
      await new LocalEngineClient({ ...cfg, enabled: false }, [], undefined, off.fn).analyzeProject(files),
      null
    )
    assert.strictEqual(off.calls.length, 0)

    const mock = fakeFetch(() => ({ analyzerAvailable: false }))
    assert.strictEqual(
      await new LocalEngineClient(cfg, [], undefined, mock.fn).analyzeProject(files),
      null
    )

    const down = (async () => {
      throw new Error('ECONNREFUSED')
    }) as any
    assert.strictEqual(
      await new LocalEngineClient(cfg, [], undefined, down).analyzeProject(files),
      null
    )

    const none = fakeFetch(() => ({ analyzerAvailable: true }))
    assert.strictEqual(
      await new LocalEngineClient(cfg, [], undefined, none.fn).analyzeProject([files[2]!]),
      null
    )
    assert.strictEqual(none.calls.length, 0)
  })

  test('sends Java files with one shared file map and attributes cross-file findings', async () => {
    const { fn, calls } = fakeFetch((url, body) => {
      if (url.endsWith('/health')) return { analyzerAvailable: true }
      return {
        results: body.files.map((f: { path: string }) => ({
          path: f.path,
          result: {
            securityIssues:
              f.path === 'src/ProductController.java'
                ? [
                    {
                      type: 'sql_injection',
                      severity: 'critical',
                      line: 21,
                      cweId: 'CWE-89',
                      message: '[ProductRepository.java] Entire SQL query taken from a tainted variable',
                    },
                  ]
                : [],
          },
        })),
      }
    })
    const client = new LocalEngineClient(cfg, [], undefined, fn)
    const res = await client.analyzeProject(files)
    assert.ok(res)

    const batch = calls.find(c => c.url.endsWith('/api/analyze/batch'))!
    assert.deepStrictEqual(Object.keys(batch.body.fileMap).sort(), [
      'src/ProductController.java',
      'src/ProductRepository.java',
    ])
    assert.strictEqual(batch.body.files.length, 2)

    assert.strictEqual(res!.byFile.get('src/ProductRepository.java')!.length, 0)
    const issue = res!.byFile.get('src/ProductController.java')![0]!
    assert.strictEqual(issue.filePath, 'src/ProductRepository.java')
    assert.strictEqual(issue.line, 21)
    assert.strictEqual(issue.crossFile, true)
    assert.ok(!issue.message.startsWith('['))
  })

  test('an HTTP error fails open', async () => {
    let first = true
    const fn = (async (url: string) => {
      if (url.endsWith('/health')) {
        return { ok: true, status: 200, json: async () => ({ analyzerAvailable: true }) }
      }
      first = false
      return { ok: false, status: 401, json: async () => ({}) }
    }) as any
    const res = await new LocalEngineClient(cfg, [], undefined, fn).analyzeProject(files)
    assert.strictEqual(res, null)
    assert.strictEqual(first, false)
  })

  test('an unknown or ambiguous file prefix is not guessed', () => {
    const known = ['a/Dup.java', 'b/Dup.java', 'src/X.java']
    const amb = attributeEngineIssue({ line: 3, message: '[Dup.java] boom' }, 'src/X.java', known)!
    assert.strictEqual(amb.filePath, 'src/X.java')
    assert.strictEqual(amb.crossFile, false)
    const unk = attributeEngineIssue({ line: 3, message: '[Nope.java] boom' }, 'src/X.java', known)!
    assert.strictEqual(unk.filePath, 'src/X.java')
  })
})

suite('local engine merge', () => {
  const tier1 = (id: string, line: number, cwe: string[], file: string): Issue => ({
    id,
    severity: 'critical',
    category: 'sql',
    message: 'tier1',
    source: 'static',
    line,
    filePath: file,
    metadata: { source: 'local-pack', cwe },
  })

  const base = (): ProjectAnalysisResult =>
    ({
      prioritizedIssues: [],
      recommendations: [],
      summary: { totalIssues: 0, criticalIssues: 0, highIssues: 0, mediumIssues: 0, lowIssues: 0 },
      filesAnalyzed: 3,
      filesSkipped: 0,
      metadata: {},
      fileResults: [
        {
          filePath: 'src/ProductRepository.java',
          language: 'java',
          issues: [
            tier1('t-region', 56, ['CWE-89'], 'src/ProductRepository.java'),
            tier1('t-crypto', 10, ['CWE-327'], 'src/ProductRepository.java'),
          ],
        },
        { filePath: 'src/ProductController.java', language: 'java', issues: [] },
        {
          filePath: 'web/app.js',
          language: 'javascript',
          issues: [tier1('t-js', 1, ['CWE-89'], 'web/app.js')],
        },
      ],
    }) as unknown as ProjectAnalysisResult

  test('engine verdict replaces Tier-1 injection findings, keeps the rest', () => {
    const merged = mergeEngineResults(base(), {
      byFile: new Map([
        [
          'src/ProductController.java',
          [
            {
              filePath: 'src/ProductRepository.java',
              line: 21,
              severity: 'critical',
              message: 'tainted',
              type: 'sql_injection',
              cweId: 'CWE-89',
              crossFile: true,
            },
          ],
        ],
        ['src/ProductRepository.java', []],
      ]),
    })
    const repo = merged.fileResults!.find(f => f.filePath === 'src/ProductRepository.java')!
    const ids = repo.issues.map(i => i.id)
    assert.ok(!ids.includes('t-region'), 'Tier-1 false positive on config value is dropped')
    assert.ok(ids.includes('t-crypto'), 'non-injection Tier-1 finding is kept')
    assert.ok(ids.some(i => i?.startsWith('engine:CWE-89:src/ProductRepository.java:21')))
    // A file the engine did not analyse is untouched.
    const js = merged.fileResults!.find(f => f.filePath === 'web/app.js')!
    assert.strictEqual(js.issues.length, 1)
    assert.strictEqual(merged.summary.totalIssues, merged.prioritizedIssues.length)
  })

  test('the same callee sink reached from two controllers is reported once', () => {
    const issue = {
      filePath: 'src/ProductRepository.java',
      line: 21,
      severity: 'critical' as const,
      message: 'tainted',
      type: 'sql_injection',
      cweId: 'CWE-89',
      crossFile: true,
    }
    const merged = mergeEngineResults(base(), {
      byFile: new Map([
        ['src/A.java', [issue]],
        ['src/B.java', [issue]],
      ]),
    })
    const engineHits = merged.prioritizedIssues.filter(i => i.id?.startsWith('engine:'))
    assert.strictEqual(engineHits.length, 1)
  })
})
