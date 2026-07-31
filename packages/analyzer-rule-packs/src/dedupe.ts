/**
 * Deduplicate findings for IDE precision: one alert per CWE+line.
 * Prefer AST over regex; then higher severity.
 */

import type { PackFinding, Severity } from './types'

const SEV_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
}

function score(f: PackFinding): number {
  const sev = SEV_RANK[String(f.severity).toLowerCase()] || 0
  const engineBonus = f.engine === 'ast' ? 100 : 0
  // Prefer javascript pack over overlapping patterns pack
  const packBonus = f.packId.includes('javascript')
    ? 10
    : f.packId.includes('secrets')
      ? 8
      : 0
  return engineBonus + packBonus + sev
}

export function dedupeFindingsByCweLine(findings: PackFinding[]): PackFinding[] {
  const best = new Map<string, PackFinding>()
  for (const f of findings) {
    const cwe = f.cweId || f.ruleId
    const key = `${cwe}:${f.line}`
    const prev = best.get(key)
    if (!prev || score(f) > score(prev)) {
      best.set(key, f)
    }
  }
  return Array.from(best.values()).sort((a, b) => a.line - b.line || a.column - b.column)
}

export function severityRank(s: Severity | string): number {
  return SEV_RANK[String(s).toLowerCase()] || 0
}
