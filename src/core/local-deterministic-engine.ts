/**
 * Local Deterministic Engine (Tier 1)
 *
 * Precision-first: high-confidence packs, AST when parse succeeds,
 * no noisy regex fallback for AST rules, CWE+line dedupe, safe-sink suppressions.
 */

import * as parser from '@babel/parser'
import traverseImport from '@babel/traverse'
import type { Node } from '@babel/types'
import {
  analyzeWithPacks,
  getAstRules,
  loadTier1Packs,
  listBuiltinPackVersions,
  dedupeFindingsByCweLine,
  shouldSuppressFinding,
  offsetFromLineCol,
  type PackFinding,
  type LoadedRulePack,
  type RulePackRule,
} from '@jokalala/analyzer-rule-packs'
import {
  Severity,
  type SecurityIssue,
  type OfflineAnalysisOptions,
  type OfflineAnalysisResult,
} from './security-types'

export type { SecurityIssue, OfflineAnalysisOptions, OfflineAnalysisResult }
export { Severity }

const traverse =
  typeof traverseImport === 'function'
    ? traverseImport
    : (traverseImport as { default: typeof traverseImport }).default

const JS_LANGS = new Set([
  'javascript',
  'js',
  'jsx',
  'typescript',
  'ts',
  'tsx',
  'mjs',
  'cjs',
])

export type LocalPackProfile = 'precision' | 'full'

function normalizeLang(language: string): string {
  const l = (language || '').toLowerCase()
  if (l === 'js' || l === 'jsx' || l === 'mjs' || l === 'cjs') return 'javascript'
  if (l === 'ts' || l === 'tsx') return 'typescript'
  return l || 'javascript'
}

function toSeverity(s: string): Severity {
  const v = String(s || 'medium').toLowerCase()
  switch (v) {
    case 'critical':
      return Severity.CRITICAL
    case 'high':
      return Severity.HIGH
    case 'low':
      return Severity.LOW
    case 'info':
      return Severity.INFO
    default:
      return Severity.MEDIUM
  }
}

function packFindingToIssue(f: PackFinding, index: number): SecurityIssue {
  return {
    id: `local-${f.packId}-${f.ruleId}-${f.line}-${index}`,
    ruleId: f.ruleId,
    title: f.name,
    description: f.message,
    severity: toSeverity(f.severity),
    category: f.category,
    cwe: f.cweId ? [f.cweId] : [],
    owasp: f.owaspCategory ? [f.owaspCategory] : [],
    line: f.line,
    column: f.column,
    endLine: f.endLine,
    endColumn: f.endColumn,
    codeSnippet: f.matchedText,
    suggestion: f.recommendation || 'Review and remediate this finding.',
    confidence: f.engine === 'ast' ? 0.92 : 0.8,
    falsePositiveLikelihood: f.engine === 'ast' ? 0.1 : 0.2,
    references: f.cweId
      ? [`https://cwe.mitre.org/data/definitions/${f.cweId.replace('CWE-', '')}.html`]
      : [],
    message: f.message,
    metadata: {
      source: f.source,
      packId: f.packId,
      packVersion: f.packVersion,
      engineTier: f.engineTier,
      engine: f.engine,
    },
  }
}

function locOf(node: Node): { line: number; column: number; endLine?: number; endColumn?: number } {
  const loc = node.loc
  if (!loc) return { line: 1, column: 1 }
  return {
    line: loc.start.line,
    column: loc.start.column + 1,
    endLine: loc.end.line,
    endColumn: loc.end.column + 1,
  }
}

function findingFromAstRule(
  rule: RulePackRule,
  packId: string,
  packVersion: string,
  node: Node,
  matchedText: string
): PackFinding {
  const loc = locOf(node)
  return {
    ruleId: rule.id,
    packId,
    packVersion,
    name: rule.name,
    message: rule.message || rule.name,
    severity: (rule.severity as PackFinding['severity']) || 'medium',
    category: rule.category,
    cweId: rule.cweId,
    owaspCategory: rule.owaspCategory,
    recommendation: rule.recommendation,
    line: loc.line,
    column: loc.column,
    endLine: loc.endLine,
    endColumn: loc.endColumn,
    matchedText: matchedText.slice(0, 200),
    engine: 'ast',
    source: 'local-pack',
    engineTier: 1,
  }
}

function isMemberNamed(node: Node | null | undefined, name: string): boolean {
  if (!node || node.type !== 'MemberExpression') return false
  const prop = node.property
  if (prop.type === 'Identifier') return prop.name === name
  if (prop.type === 'StringLiteral') return prop.value === name
  return false
}

function calleeName(node: Node): string | null {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') {
    const prop = node.property
    if (prop.type === 'Identifier') return prop.name
    if (prop.type === 'StringLiteral') return prop.value
  }
  return null
}

function runAstVisitors(
  code: string,
  language: string,
  packs: LoadedRulePack[]
): PackFinding[] {
  const findings: PackFinding[] = []
  const isTs = language === 'typescript' || language === 'tsx' || language === 'ts'

  const visitorRules: Array<{
    rule: RulePackRule
    packId: string
    packVersion: string
    visitor: string
  }> = []

  for (const pack of packs) {
    for (const rule of getAstRules(pack.manifest)) {
      if (rule.astVisitor) {
        visitorRules.push({
          rule,
          packId: pack.manifest.id,
          packVersion: pack.manifest.version,
          visitor: rule.astVisitor,
        })
      }
    }
  }

  if (visitorRules.length === 0) return findings

  let ast
  try {
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx',
        ...(isTs ? (['typescript' as const]) : []),
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'topLevelAwait',
      ],
    })
  } catch {
    // Zero-noise: skip AST rules when parse fails — do not fall back to noisy regex
    return findings
  }

  const byVisitor = new Map<string, typeof visitorRules>()
  for (const vr of visitorRules) {
    const list = byVisitor.get(vr.visitor) || []
    list.push(vr)
    byVisitor.set(vr.visitor, list)
  }

  const emit = (visitorId: string, node: Node, text: string) => {
    const rules = byVisitor.get(visitorId)
    if (!rules) return
    for (const vr of rules) {
      findings.push(findingFromAstRule(vr.rule, vr.packId, vr.packVersion, node, text))
    }
  }

  traverse(ast, {
    AssignmentExpression(path: any) {
      const left = path.node.left
      if (isMemberNamed(left, 'innerHTML')) {
        emit('innerHTML', path.node, code.slice(path.node.start ?? 0, path.node.end ?? 0))
      }
    },
    JSXAttribute(path: any) {
      const name = path.node.name
      const n =
        name.type === 'JSXIdentifier'
          ? name.name
          : name.type === 'JSXNamespacedName'
            ? name.name.name
            : ''
      if (n === 'dangerouslySetInnerHTML') {
        emit(
          'dangerouslySetInnerHTML',
          path.node,
          code.slice(path.node.start ?? 0, path.node.end ?? 0)
        )
      }
    },
    CallExpression(path: any) {
      const name = calleeName(path.node.callee)
      if (name === 'eval') {
        emit('eval', path.node, code.slice(path.node.start ?? 0, path.node.end ?? 0))
      }
      if (name === 'exec' || name === 'execSync' || name === 'spawn' || name === 'spawnSync') {
        emit(
          'childProcessExec',
          path.node,
          code.slice(path.node.start ?? 0, path.node.end ?? 0)
        )
      }
    },
    NewExpression(path: any) {
      if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'Function') {
        emit('newFunction', path.node, code.slice(path.node.start ?? 0, path.node.end ?? 0))
      }
    },
  })

  return findings
}

function applySuppressions(
  source: string,
  findings: PackFinding[],
  filePathHint?: string
): PackFinding[] {
  return findings.filter((f) => {
    const start = offsetFromLineCol(source, f.line, f.column)
    const end = start + (f.matchedText?.length || 1)
    return !shouldSuppressFinding(source, start, end, filePathHint)
  })
}

export interface LocalEngineOptions extends OfflineAnalysisOptions {
  packs?: LoadedRulePack[]
  packProfile?: LocalPackProfile
  filePathHint?: string
  /** Allow AST-rule regex fallback (default false — zero-noise). */
  allowAstRegexFallback?: boolean
}

export class LocalDeterministicEngine {
  private packProfile: LocalPackProfile
  private packs: LoadedRulePack[]

  constructor(packsOrProfile?: LoadedRulePack[] | LocalPackProfile) {
    if (Array.isArray(packsOrProfile)) {
      this.packs = packsOrProfile
      this.packProfile = 'precision'
    } else {
      this.packProfile = packsOrProfile || 'precision'
      this.packs = loadTier1Packs(this.packProfile)
    }
  }

  getPackVersions(): Array<{ id: string; version: string; name: string }> {
    return this.packs.map((p) => ({
      id: p.manifest.id,
      version: p.manifest.version,
      name: p.manifest.name,
    }))
  }

  setPackProfile(profile: LocalPackProfile): void {
    this.packProfile = profile
    this.packs = loadTier1Packs(profile)
  }

  analyze(
    code: string,
    language: string,
    options: LocalEngineOptions = {}
  ): OfflineAnalysisResult {
    const start = performance.now()
    const lang = normalizeLang(language)
    const packs =
      options.packs ||
      (options.packProfile ? loadTier1Packs(options.packProfile) : this.packs)

    // Surface regex (non-AST rules only) — suppressions + dedupe applied later
    const surface = analyzeWithPacks(code, lang, {
      packs,
      suppressNoise: false,
      dedupe: false,
    })

    // JS/TS AST — no regex fallback when parse fails (zero-noise policy)
    let astFindings: PackFinding[] = []
    if (JS_LANGS.has(lang) || JS_LANGS.has(language.toLowerCase())) {
      astFindings = runAstVisitors(code, lang, packs)
    }

    const all = applySuppressions(
      code,
      [...surface, ...astFindings],
      options.filePathHint
    )
    const deduped = dedupeFindingsByCweLine(all)

    let issues = deduped.map((f, i) => packFindingToIssue(f, i))

    if (options.disabledRules?.length) {
      const disabled = new Set(options.disabledRules)
      issues = issues.filter((i) => !disabled.has(i.ruleId))
    }
    if (options.enabledCategories?.length) {
      const cats = new Set(options.enabledCategories.map((c) => c.toLowerCase()))
      issues = issues.filter((i) => cats.has(i.category.toLowerCase()))
    }
    if (options.minSeverity) {
      const order = [
        Severity.INFO,
        Severity.LOW,
        Severity.MEDIUM,
        Severity.HIGH,
        Severity.CRITICAL,
      ]
      const minIdx = order.indexOf(options.minSeverity)
      issues = issues.filter((i) => order.indexOf(i.severity) >= minIdx)
    }
    if (!options.includeInfoIssues) {
      issues = issues.filter((i) => i.severity !== Severity.INFO)
    }
    if (options.maxIssues && issues.length > options.maxIssues) {
      issues = issues.slice(0, options.maxIssues)
    }

    const analysisTime = performance.now() - start
    const packsMeta = this.getPackVersions()

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        criticalCount: issues.filter((i) => i.severity === Severity.CRITICAL).length,
        highCount: issues.filter((i) => i.severity === Severity.HIGH).length,
        mediumCount: issues.filter((i) => i.severity === Severity.MEDIUM).length,
        lowCount: issues.filter((i) => i.severity === Severity.LOW).length,
        infoCount: issues.filter((i) => i.severity === Severity.INFO).length,
        rulesTriggered: new Set(issues.map((i) => i.ruleId)).size,
        analysisTime,
        linesAnalyzed: code.split('\n').length,
        coverage: 1,
      },
      metadata: {
        version: '2.4.1',
        rulesVersion: packsMeta.map((p) => `${p.id}@${p.version}`).join(','),
        language: lang,
        isOffline: true,
        timestamp: Date.now(),
      },
    }
  }
}

let engine: LocalDeterministicEngine | null = null

export function getLocalDeterministicEngine(): LocalDeterministicEngine {
  if (!engine) {
    engine = new LocalDeterministicEngine('precision')
  }
  return engine
}

export function resetLocalDeterministicEngine(): void {
  engine = null
}
