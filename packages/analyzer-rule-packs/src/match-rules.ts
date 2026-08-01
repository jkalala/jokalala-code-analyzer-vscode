/**
 * Surface regex matcher for compiled rule packs.
 */

import type { CompiledRule, MetavariableConstraint, PackFinding, Severity } from './types'

function evaluateComparison(operator: string, actual: number, expected: number): boolean {
  switch (operator) {
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    case '==':
      return actual === expected
    case '!=':
      return actual !== expected
    default:
      return true
  }
}

/**
 * Checks whether a positive match's captured metavariables (named capture
 * groups compiled by compile-metavar.ts) satisfy the rule's
 * metavariable-pattern/metavariable-comparison constraints. A constraint
 * whose metavariable wasn't captured by this particular positive pattern is
 * treated as satisfied (not every pattern in a rule captures every
 * metavariable the rule references).
 */
function satisfiesMetavariableConstraints(
  constraints: MetavariableConstraint[],
  groups: Record<string, string> | undefined
): boolean {
  if (constraints.length === 0) return true
  for (const constraint of constraints) {
    const captured = groups?.[constraint.metavariable]
    if (captured === undefined) continue

    if (constraint.kind === 'pattern') {
      // The compiled pattern always carries a global flag (compileAtom
      // forces one) and is reused across every match of this rule, so
      // .test() would otherwise advance lastIndex statefully and produce
      // intermittent false negatives on repeated calls.
      constraint.regex.lastIndex = 0
      if (!constraint.regex.test(captured)) return false
    } else {
      const actual = Number(captured)
      if (Number.isNaN(actual)) return false
      if (!evaluateComparison(constraint.operator, actual, constraint.value)) return false
    }
  }
  return true
}

function lineColAt(source: string, index: number): { line: number; column: number } {
  let line = 1
  let column = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

function spansOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd
}

function collectSpans(re: RegExp, source: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const clone = new RegExp(re.source, flags)
  let m: RegExpExecArray | null
  while ((m = clone.exec(source)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) clone.lastIndex++
  }
  return spans
}

function languageMatches(ruleLangs: string[] | undefined, language: string): boolean {
  if (!ruleLangs || ruleLangs.length === 0) return true
  if (ruleLangs.includes('*')) return true
  const lang = language.toLowerCase()
  const aliases: Record<string, string[]> = {
    javascript: ['javascript', 'js', 'jsx'],
    typescript: ['typescript', 'ts', 'tsx'],
    python: ['python', 'py'],
    java: ['java'],
  }
  return ruleLangs.some((r) => {
    const key = r.toLowerCase()
    if (key === lang) return true
    const group = aliases[key]
    return group ? group.includes(lang) : false
  })
}

export function matchCompiledRules(
  source: string,
  compiled: CompiledRule[],
  language: string
): PackFinding[] {
  const findings: PackFinding[] = []

  for (const cr of compiled) {
    if (!languageMatches(cr.rule.languages, language)) continue
    if (cr.positive.length === 0) continue

    const insideSpans =
      cr.inside.length > 0
        ? cr.inside.flatMap((re) => collectSpans(re, source))
        : null
    const notInsideSpans =
      cr.notInside.length > 0
        ? cr.notInside.flatMap((re) => collectSpans(re, source))
        : []

    for (const re of cr.positive) {
      const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
      const clone = new RegExp(re.source, flags)
      let m: RegExpExecArray | null
      while ((m = clone.exec(source)) !== null) {
        const start = m.index
        const end = start + m[0].length
        const hit = m[0]

        if (cr.negative.some((neg) => {
          const n = new RegExp(neg.source, neg.flags.includes('g') ? neg.flags : `${neg.flags}g`)
          return n.test(hit) || n.test(source.slice(Math.max(0, start - 40), end + 40))
        })) {
          if (hit.length === 0) clone.lastIndex++
          continue
        }

        if (insideSpans && !insideSpans.some((s) => spansOverlap(start, end, s.start, s.end))) {
          if (hit.length === 0) clone.lastIndex++
          continue
        }

        if (notInsideSpans.some((s) => spansOverlap(start, end, s.start, s.end))) {
          if (hit.length === 0) clone.lastIndex++
          continue
        }

        if (!satisfiesMetavariableConstraints(cr.metavariableConstraints, m.groups)) {
          if (hit.length === 0) clone.lastIndex++
          continue
        }

        const { line, column } = lineColAt(source, start)
        const endPos = lineColAt(source, Math.max(start, end - 1))
        findings.push({
          ruleId: cr.rule.id,
          packId: cr.packId,
          packVersion: cr.packVersion,
          name: cr.rule.name,
          message: cr.rule.message || cr.rule.name,
          severity: (cr.rule.severity as Severity) || 'medium',
          category: cr.rule.category,
          cweId: cr.rule.cweId,
          owaspCategory: cr.rule.owaspCategory,
          recommendation: cr.rule.recommendation,
          line,
          column,
          endLine: endPos.line,
          endColumn: endPos.column + 1,
          matchedText: hit.slice(0, 200),
          engine: 'regex',
          source: 'local-pack',
          engineTier: 1,
        })
        if (hit.length === 0) clone.lastIndex++
      }
    }
  }

  return findings
}
