/**
 * Folds full-engine (Tier-2) findings into a Tier-1 project scan result.
 *
 * Policy, per project file the engine analysed:
 *  - the engine is authoritative for injection-class CWEs: Tier-1 findings of
 *    those CWEs on that file are replaced by the engine's, because Tier-1 only
 *    sees one file and flags any concatenated variable (e.g. an `@Value`
 *    config value) while missing flows that cross files;
 *  - every other Tier-1 finding (crypto, config, secrets, quality...) is kept;
 *  - engine findings are de-duplicated by file + line + CWE.
 *
 * Files the engine did not analyse are left exactly as Tier-1 reported them.
 *
 * @module services/local-engine-merge
 */

import type {
  FileAnalysisResult,
  Issue,
  ProjectAnalysisResult,
} from '../interfaces/code-analysis-service.interface'
import type { EngineResult, EngineIssue } from './local-engine-client'

/** CWEs for which the engine's cross-file, value-aware verdict replaces Tier-1's. */
export const ENGINE_AUTHORITATIVE_CWES: ReadonlySet<string> = new Set([
  'CWE-89', // SQL injection
  'CWE-78', // OS command injection
  'CWE-22', // path traversal
  'CWE-79', // XSS
  'CWE-90', // LDAP injection
  'CWE-643', // XPath injection
  'CWE-601', // open redirect
  'CWE-918', // SSRF
  'CWE-917', // expression-language injection
])

const norm = (p: string) => p.replace(/\\/g, '/')

function cwesOf(issue: Issue): string[] {
  const meta = issue.metadata as { cwe?: unknown } | undefined
  const raw = meta?.cwe
  const out = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string'
      ? [raw]
      : []
  for (const t of issue.tags ?? []) {
    if (/^CWE-\d+$/i.test(t)) out.push(t.toUpperCase())
  }
  return out.map(c => c.toUpperCase())
}

export function engineIssueToIssue(e: EngineIssue): Issue {
  return {
    id: `engine:${e.cweId ?? e.type}:${norm(e.filePath)}:${e.line}`,
    ruleId: e.ruleId ?? e.cweId,
    severity: e.severity,
    category: e.type,
    message: e.message,
    suggestion: e.suggestion,
    source: 'static',
    line: e.line,
    column: e.column,
    location: { startLine: e.line, startColumn: e.column, filePath: e.filePath },
    filePath: e.filePath,
    tags: [
      'local-engine',
      'tier-2',
      ...(e.crossFile ? ['cross-file'] : []),
      ...(e.cweId ? [e.cweId] : []),
    ],
    metadata: {
      source: 'local-engine',
      engineTier: 2,
      cwe: e.cweId ? [e.cweId] : [],
      confidence: e.confidence,
      detectionSources: e.detectionSources,
      crossFile: e.crossFile,
    },
  }
}

export function mergeEngineResults(
  base: ProjectAnalysisResult,
  engine: EngineResult
): ProjectAnalysisResult {
  const analysed = new Set([...engine.byFile.keys()].map(norm))

  // Engine findings, de-duplicated across entries (the same callee sink is
  // reachable from several controllers).
  const engineByFile = new Map<string, Issue[]>()
  const seen = new Set<string>()
  for (const issues of engine.byFile.values()) {
    for (const e of issues) {
      const key = `${norm(e.filePath)}|${e.line}|${e.cweId ?? e.type}`
      if (seen.has(key)) continue
      seen.add(key)
      const list = engineByFile.get(norm(e.filePath)) ?? []
      list.push(engineIssueToIssue(e))
      engineByFile.set(norm(e.filePath), list)
    }
  }

  let replaced = 0
  const fileResults: FileAnalysisResult[] = []
  const known = new Set<string>()
  for (const fr of base.fileResults ?? []) {
    const key = norm(fr.filePath)
    known.add(key)
    let kept = fr.issues
    if (analysed.has(key)) {
      kept = fr.issues.filter(i => {
        const drop = cwesOf(i).some(c => ENGINE_AUTHORITATIVE_CWES.has(c))
        if (drop) replaced++
        return !drop
      })
    }
    const added = (engineByFile.get(key) ?? []).map(i => ({
      ...i,
      filePath: fr.filePath,
    }))
    fileResults.push({ ...fr, issues: [...kept, ...added] })
  }
  // Engine findings on a file Tier-1 did not list (should not happen).
  for (const [key, list] of engineByFile) {
    if (!known.has(key)) {
      fileResults.push({ filePath: list[0]!.filePath!, issues: list })
    }
  }

  const prioritizedIssues = fileResults.flatMap(fr => fr.issues)
  const count = (s: Issue['severity']) =>
    prioritizedIssues.filter(i => i.severity === s).length

  return {
    ...base,
    prioritizedIssues,
    fileResults,
    summary: {
      ...base.summary,
      totalIssues: prioritizedIssues.length,
      criticalIssues: count('critical'),
      highIssues: count('high'),
      mediumIssues: count('medium'),
      lowIssues: count('low'),
    },
    metadata: {
      ...base.metadata,
      analysisTier: 'local+engine',
      engineFilesAnalyzed: analysed.size,
      engineReplacedTier1Findings: replaced,
    } as ProjectAnalysisResult['metadata'],
  }
}
