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
import { runTaintAnalysis, type TaintFinding } from './taint-analysis'
import { buildSuppressionIndex } from './suppression-directives'
import { fingerprintIssues } from './baseline'
import { getSyntaxFacts } from './syntax-service'

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

/**
 * Taint findings carry evidence-based confidence and a full source→sink path;
 * they outrank the single-node pack findings for the same CWE+line, which are
 * dropped in favor of these (see analyze()).
 */
function taintFindingToIssue(f: TaintFinding, index: number): SecurityIssue {
  return {
    id: `local-taint-${f.ruleId}-${f.line}-${index}`,
    ruleId: f.ruleId,
    title: f.name,
    description: f.message,
    severity: toSeverity(f.severity),
    category: f.category,
    cwe: [f.cweId],
    owasp: [f.owaspCategory],
    line: f.line,
    column: f.column,
    endLine: f.endLine,
    endColumn: f.endColumn,
    codeSnippet: f.sinkSnippet,
    suggestion: f.recommendation,
    confidence: f.confidence,
    falsePositiveLikelihood: Math.round((1 - f.confidence) * 100) / 100,
    references: [
      `https://cwe.mitre.org/data/definitions/${f.cweId.replace('CWE-', '')}.html`,
    ],
    message: f.message,
    metadata: {
      source: 'local-taint',
      engine: 'taint',
      engineTier: 1,
      taintSource: f.source,
      taintSteps: f.steps,
      partialSanitizers: f.partialSanitizers,
    },
  }
}

const TEST_PATH_RE = /\b(?:__tests__|\.test\.|\.spec\.|\/tests?\/|\\tests?\\)/i

/**
 * Reported in OfflineAnalysisResult.metadata and consumed by telemetry.
 * Read from the manifest so it cannot drift from the published version the
 * way the previously hardcoded '2.4.1' did.
 */
const ENGINE_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../../package.json') as { version?: string }).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

/** Languages with a tree-sitter grammar backing the syntax precision layer. */
const SYNTAX_LANGS = new Set(['python', 'java'])

/** Python rules eligible for the static-string-argument severity downgrade. */
const PY_STATIC_ARG_RULES: Record<string, string[]> = {
  'py-eval-call': ['eval'],
  'py-exec-call': ['exec'],
  'py-os-system-call': ['os.system', 'os.popen'],
}

/**
 * Syntax-aware refinement for regex-pack findings (no-op until the WASM
 * syntax service has initialized): drops matches inside comments — dead
 * code can't execute, though commented-out secrets are still real leaks,
 * so the secrets pack is exempt — and mirrors the JS static-argument
 * downgrade for Python eval/exec/os.system with literal-only arguments.
 */
function refineWithSyntaxFacts(
  code: string,
  lang: string,
  findings: PackFinding[]
): PackFinding[] {
  if (findings.length === 0) return findings
  const facts = getSyntaxFacts(code, lang)
  if (!facts) return findings

  const out: PackFinding[] = []
  for (const f of findings) {
    const offset = offsetFromLineCol(code, f.line, f.column)
    if (f.packId !== 'jokalala.secrets' && facts.isInComment(offset)) continue

    const callees = PY_STATIC_ARG_RULES[f.ruleId]
    if (callees && facts.language === 'python') {
      const call = facts.pythonCalls.find(
        (c) => c.startIndex <= offset && offset < c.endIndex && callees.includes(c.callee)
      )
      if (call?.staticStringArgument) {
        out.push({
          ...f,
          severity: 'low',
          message: `${f.message} (argument is a static string literal — no dynamic input detected; still avoid this API where possible)`,
        })
        continue
      }
    }
    out.push(f)
  }
  return out
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

/**
 * True when a call's command/code argument is a plain string with no
 * variable interpolation at all — a StringLiteral, or a TemplateLiteral
 * with zero `${...}` expressions. There is nothing for an attacker to
 * influence in a call shaped like `exec("git status")` or `` eval(`1+1`) ``;
 * the risk only exists once *some* part of the argument is dynamic.
 */
function isStaticStringArgument(node: Node | null | undefined): boolean {
  if (!node) return false
  if (node.type === 'StringLiteral') return true
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0
  return false
}

function findingFromAstRule(
  rule: RulePackRule,
  packId: string,
  packVersion: string,
  node: Node,
  matchedText: string,
  opts?: { staticArgument?: boolean }
): PackFinding {
  const loc = locOf(node)
  // Downgrade (never fully suppress) when the dangerous call's argument is
  // provably static — still worth flagging as a practice to avoid, since
  // code changes, but it shouldn't carry the same urgency as a call that
  // could genuinely be reached with attacker-controlled input today. This
  // is what was inflating "critical" counts on codebases (like SAST/SCA
  // tooling) that legitimately shell out with hardcoded commands.
  const downgrade = opts?.staticArgument === true
  return {
    ruleId: rule.id,
    packId,
    packVersion,
    name: rule.name,
    message: downgrade
      ? `${rule.message || rule.name} (argument is a static string literal — no dynamic input detected; still avoid this API where possible)`
      : rule.message || rule.name,
    severity: downgrade ? 'low' : (rule.severity as PackFinding['severity']) || 'medium',
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

/**
 * Parse once per file; both the pack AST visitors and the taint pass run on
 * the same tree. Returns null on parse failure (zero-noise: no regex fallback
 * for AST-tier analyses).
 */
function parseJsAst(code: string, language: string): ReturnType<typeof parser.parse> | null {
  const isTs = language === 'typescript' || language === 'tsx' || language === 'ts'
  try {
    return parser.parse(code, {
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
    return null
  }
}

function runAstVisitors(
  ast: ReturnType<typeof parser.parse>,
  code: string,
  packs: LoadedRulePack[]
): PackFinding[] {
  const findings: PackFinding[] = []

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

  const byVisitor = new Map<string, typeof visitorRules>()
  for (const vr of visitorRules) {
    const list = byVisitor.get(vr.visitor) || []
    list.push(vr)
    byVisitor.set(vr.visitor, list)
  }

  const emit = (
    visitorId: string,
    node: Node,
    text: string,
    opts?: { staticArgument?: boolean }
  ) => {
    const rules = byVisitor.get(visitorId)
    if (!rules) return
    for (const vr of rules) {
      findings.push(findingFromAstRule(vr.rule, vr.packId, vr.packVersion, node, text, opts))
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
      const firstArg = path.node.arguments?.[0] as Node | undefined
      const staticArgument = isStaticStringArgument(firstArg)
      if (name === 'eval') {
        emit('eval', path.node, code.slice(path.node.start ?? 0, path.node.end ?? 0), {
          staticArgument,
        })
      }
      if (name === 'exec' || name === 'execSync' || name === 'spawn' || name === 'spawnSync') {
        emit(
          'childProcessExec',
          path.node,
          code.slice(path.node.start ?? 0, path.node.end ?? 0),
          { staticArgument }
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
    let surface = analyzeWithPacks(code, lang, {
      packs,
      suppressNoise: false,
      dedupe: false,
    })
    if (SYNTAX_LANGS.has(lang)) {
      surface = refineWithSyntaxFacts(code, lang, surface)
    }

    // JS/TS AST — no regex fallback when parse fails (zero-noise policy)
    let astFindings: PackFinding[] = []
    let taintFindings: TaintFinding[] = []
    if (JS_LANGS.has(lang) || JS_LANGS.has(language.toLowerCase())) {
      const ast = parseJsAst(code, lang)
      if (ast) {
        astFindings = runAstVisitors(ast, code, packs)
        if (options.enableTaintAnalysis !== false) {
          taintFindings = runTaintAnalysis(ast, code)
        }
      }
    }

    // Taint findings bypass the ±160-char safe-sink window (the taint pass
    // models sanitizers precisely, so proximity heuristics would only hide
    // real flows) but still respect the test-path suppression.
    if (options.filePathHint && TEST_PATH_RE.test(options.filePathHint)) {
      taintFindings = []
    }

    let all = applySuppressions(
      code,
      [...surface, ...astFindings],
      options.filePathHint
    )

    // Inline directives run BEFORE taint-wins dedupe so that suppressing a
    // specific js-taint-* rule can still leave the broader pack finding
    // visible; a bare `jokalala-ignore` clears the line entirely.
    let suppressedCount = 0
    if (options.respectInlineSuppressions !== false) {
      const directives = buildSuppressionIndex(code)
      if (directives.directiveCount > 0) {
        const before = all.length + taintFindings.length
        all = all.filter((f) => !directives.isSuppressed(f.line, f.ruleId))
        taintFindings = taintFindings.filter(
          (f) => !directives.isSuppressed(f.line, f.ruleId)
        )
        suppressedCount = before - all.length - taintFindings.length
      }
    }

    // A taint finding subsumes the single-node pack finding for the same
    // CWE on the same line — it carries the full source→sink evidence.
    const taintKeys = new Set(taintFindings.map((f) => `${f.cweId}:${f.line}`))
    const deduped = dedupeFindingsByCweLine(all).filter(
      (f) => !taintKeys.has(`${f.cweId || f.ruleId}:${f.line}`)
    )

    let issues = [
      ...taintFindings.map((f, i) => taintFindingToIssue(f, i)),
      ...deduped.map((f, i) => packFindingToIssue(f, i)),
    ].sort((a, b) => a.line - b.line || a.column - b.column)

    // Baseline: drop findings the team has already reviewed and accepted.
    let baselinedCount = 0
    if (options.baseline && options.baseline.size > 0 && options.filePathHint) {
      const prints = fingerprintIssues(issues, options.filePathHint, code)
      const kept: SecurityIssue[] = []
      for (let i = 0; i < issues.length; i++) {
        if (options.baseline.has(prints[i])) baselinedCount++
        else kept.push(issues[i])
      }
      issues = kept
    }

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
        suppressedCount,
        baselinedCount,
      },
      metadata: {
        version: ENGINE_VERSION,
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
