/**
 * Unit tests for the local-first, uncapped project-scan path added to make
 * "Analyze Entire Project" handle real codebases instead of a 40-file demo:
 *  - analyzeProjectLocally (no cloud, no auth, no file-count wall)
 *  - custom/plugin rules actually contributing findings (previously UI-only)
 *  - mergeProjectResults / the filePath-aware dedupe key fix
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CodeAnalysisService } from '../services/code-analysis-service'
import { ConfigurationService } from '../services/configuration-service'
import { Logger } from '../services/logger'
import { getCustomRuleEngine, RuleCategory, RuleSeverity, PatternType } from '../core/custom-rules'
import type { ProjectAnalysisResult } from '../interfaces/code-analysis-service.interface'

function makeService(): CodeAnalysisService {
  const mockConfig = {
    getSettings: () => ({
      apiEndpoint: 'https://example.invalid/api',
      apiKey: '',
      analysisMode: 'full',
      analysisTier: 'hybrid',
      localPackProfile: 'precision',
      autoAnalyze: false,
      showInlineWarnings: true,
      enableDiagnostics: true,
      maxFileSize: 50000,
      maxProjectFiles: 5000,
      maxProjectFileSize: 120000,
      requestTimeout: 5000,
      enableTelemetry: false,
      cloudEnrichmentEnabled: false,
      cloudEnrichmentMaxFiles: 200,
      cloudEnrichmentBatchSize: 40,
      retryEnabled: true,
      maxRetries: 3,
      retryDelay: 10,
    }),
  } as unknown as ConfigurationService

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as Logger

  return new CodeAnalysisService(mockConfig, mockLogger)
}

suite('CodeAnalysisService — local project scan', () => {
  let service: CodeAnalysisService

  setup(() => {
    service = makeService()
  })

  test('analyzeProjectLocally scans every file with no cap and no network', async () => {
    const files = [
      { path: 'src/danger.js', content: 'eval(userInput)', language: 'javascript' },
      { path: 'src/clean.js', content: 'const x = 1 + 1;', language: 'javascript' },
    ]

    const result = await service.analyzeProjectLocally(files)

    assert.strictEqual(result.filesAnalyzed, 2)
    assert.strictEqual(result.fileResults?.length, 2)
    assert.strictEqual(result.metadata?.analysisTier, 'local')

    const dangerFile = result.fileResults?.find(fr => fr.filePath === 'src/danger.js')
    const cleanFile = result.fileResults?.find(fr => fr.filePath === 'src/clean.js')
    assert.ok(dangerFile, 'danger.js should be present even though it has findings')
    assert.ok(cleanFile, 'clean.js should be present even with zero findings')
    assert.ok(
      dangerFile!.issues.length > 0,
      'eval(userInput) should produce at least one local finding'
    )
    assert.strictEqual(cleanFile!.issues.length, 0)

    // Every issue must carry filePath — the whole merge/dedupe/diagnostics
    // pipeline downstream depends on this.
    for (const issue of result.prioritizedIssues) {
      assert.ok(issue.filePath, 'every issue must be tagged with its file path')
    }
  })

  test('analyzeProjectLocally handles an arbitrarily large file count (no 40-file wall)', async () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
      path: `src/file${i}.js`,
      content: 'const x = 1;',
      language: 'javascript',
    }))

    const result = await service.analyzeProjectLocally(files)

    assert.strictEqual(result.filesAnalyzed, 250)
    assert.strictEqual(result.fileResults?.length, 250)
  })

  test('analyzeProjectLocally stops early when cancelled', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `src/file${i}.js`,
      content: 'const x = 1;',
      language: 'javascript',
    }))

    const cts = new vscode.CancellationTokenSource()
    cts.cancel()

    const result = await service.analyzeProjectLocally(files, cts.token)

    assert.strictEqual(result.filesAnalyzed, 0, 'already-cancelled token should stop before any file')
  })

  test('custom/plugin rules contribute real findings, not just "Test Rule" output', async () => {
    const ruleEngine = getCustomRuleEngine()
    const ruleId = 'test-no-console-log-' + Date.now()
    ruleEngine.addRule({
      id: ruleId,
      name: 'No console.log',
      description: 'Flags console.log calls',
      version: '1.0.0',
      severity: RuleSeverity.LOW,
      category: RuleCategory.QUALITY,
      tags: ['test'],
      languages: ['javascript'],
      patterns: [{ type: PatternType.REGEX, value: 'console\\.log\\(' }],
      message: { default: 'Avoid console.log in production code' },
      enabled: true,
    })

    try {
      const files = [
        { path: 'src/logger.js', content: 'console.log("debug")', language: 'javascript' },
      ]
      const result = await service.analyzeProjectLocally(files)

      const customIssue = result.prioritizedIssues.find(i => i.ruleId === ruleId)
      assert.ok(customIssue, 'enabled custom rule should produce a finding during a real scan')
      assert.ok(customIssue!.tags?.includes('custom-rule'))
    } finally {
      ruleEngine.removeRule(ruleId)
    }
  })

  test('mergeProjectResults keeps same-CWE/same-line issues in different files distinct', () => {
    const local: ProjectAnalysisResult = {
      prioritizedIssues: [
        {
          ruleId: 'rule-a',
          severity: 'high',
          category: 'injection',
          message: 'Local finding in fileA',
          source: 'static',
          line: 10,
          filePath: 'src/fileA.js',
        },
      ],
      recommendations: [],
      summary: { totalIssues: 1, criticalIssues: 0, highIssues: 1, mediumIssues: 0, lowIssues: 0 },
      filesAnalyzed: 2,
      filesSkipped: 0,
      fileResults: [
        { filePath: 'src/fileA.js', issues: [], language: 'javascript' },
        { filePath: 'src/fileB.js', issues: [], language: 'javascript' },
      ],
    }
    const cloud: ProjectAnalysisResult = {
      prioritizedIssues: [
        {
          ruleId: 'rule-a',
          severity: 'high',
          category: 'injection',
          message: 'Cloud finding in fileB, same rule + same line number as fileA',
          source: 'llm',
          line: 10,
          filePath: 'src/fileB.js',
        },
      ],
      recommendations: [],
      summary: { totalIssues: 1, criticalIssues: 0, highIssues: 1, mediumIssues: 0, lowIssues: 0 },
      filesAnalyzed: 1,
      filesSkipped: 0,
    }

    const merged = service.mergeProjectResults(local, cloud, 'test-request')

    // Before the filePath-aware dedupe key fix, these two issues (same
    // ruleId/line, different files) would have collided and one would be
    // silently dropped.
    assert.strictEqual(merged.prioritizedIssues.length, 2)
    const fileA = merged.fileResults?.find(fr => fr.filePath === 'src/fileA.js')
    const fileB = merged.fileResults?.find(fr => fr.filePath === 'src/fileB.js')
    assert.strictEqual(fileA?.issues.length, 1)
    assert.strictEqual(fileB?.issues.length, 1)
  })

  test('mergeProjectResults still dedupes true duplicates within the same file', () => {
    const sharedIssue = {
      ruleId: 'rule-a',
      severity: 'high' as const,
      category: 'injection',
      message: 'Same finding from both engines',
      line: 10,
      filePath: 'src/fileA.js',
    }
    const local: ProjectAnalysisResult = {
      prioritizedIssues: [{ ...sharedIssue, source: 'static' }],
      recommendations: [],
      summary: { totalIssues: 1, criticalIssues: 0, highIssues: 1, mediumIssues: 0, lowIssues: 0 },
      filesAnalyzed: 1,
      filesSkipped: 0,
      fileResults: [{ filePath: 'src/fileA.js', issues: [], language: 'javascript' }],
    }
    const cloud: ProjectAnalysisResult = {
      prioritizedIssues: [{ ...sharedIssue, source: 'llm' }],
      recommendations: [],
      summary: { totalIssues: 1, criticalIssues: 0, highIssues: 1, mediumIssues: 0, lowIssues: 0 },
      filesAnalyzed: 1,
      filesSkipped: 0,
    }

    const merged = service.mergeProjectResults(local, cloud, 'test-request')

    assert.strictEqual(merged.prioritizedIssues.length, 1, 'true duplicate should be deduped')
    assert.ok(
      merged.prioritizedIssues[0]!.tags?.includes('local-pack'),
      'local finding should win the tie over cloud'
    )
  })
})
