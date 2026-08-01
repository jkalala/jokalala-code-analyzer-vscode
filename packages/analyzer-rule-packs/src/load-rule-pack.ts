/**
 * Validate and compile rule packs for Tier-1 surface matching.
 * Keeps zero Node-only runtime deps beyond JSON (fs optional for file load).
 */

import { compileMetavarPattern } from './compile-metavar'
import type {
  CompiledRule,
  LoadedRulePack,
  MetavariableConstraint,
  RulePackManifest,
  RulePackPattern,
  RulePackPatternAtom,
  RulePackRule,
  Severity,
} from './types'

/** Matches the safe comparison subset this matcher supports: `$VAR <op> NUMBER`. */
const COMPARISON_RE = /^\$(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])

function asSeverity(raw: string): Severity {
  const s = String(raw || 'medium').toLowerCase()
  if (VALID_SEVERITIES.has(s)) return s as Severity
  return 'medium'
}

function compileRegexPattern(value: string, flags?: string): RegExp {
  const f = flags && flags.length > 0 ? flags : 'g'
  const normalized = f.includes('g') ? f : `${f}g`
  return new RegExp(value, normalized)
}

function compileAtom(p: RulePackPatternAtom): RegExp {
  if (p.type === 'pattern') {
    return compileMetavarPattern(p.value, p.metavariableRegex, p.flags)
  }
  return compileRegexPattern(p.value, p.flags)
}

function validateAtom(p: unknown, pathLabel: string): string | null {
  if (!p || typeof p !== 'object') return `${pathLabel} must be an object`
  const pat = p as Record<string, unknown>
  if (pat.type === 'regex') {
    if (typeof pat.value !== 'string' || !pat.value) {
      return `${pathLabel} regex value is required`
    }
    return null
  }
  if (pat.type === 'pattern') {
    if (typeof pat.value !== 'string' || !pat.value) {
      return `${pathLabel} pattern value is required`
    }
    return null
  }
  return `${pathLabel} type must be "regex" or "pattern"`
}

export function validatePattern(p: unknown, pathLabel: string): string | null {
  if (!p || typeof p !== 'object') return `${pathLabel} must be an object`
  const pat = p as Record<string, unknown>
  if (pat.type === 'regex' || pat.type === 'pattern') {
    return validateAtom(p, pathLabel)
  }
  if (pat.type === 'pattern-either') {
    if (!Array.isArray(pat.patterns) || pat.patterns.length === 0) {
      return `${pathLabel} pattern-either requires a non-empty patterns array`
    }
    for (let i = 0; i < pat.patterns.length; i++) {
      const err = validateAtom(pat.patterns[i], `${pathLabel}.patterns[${i}]`)
      if (err) return err
    }
    return null
  }
  if (
    pat.type === 'pattern-not' ||
    pat.type === 'pattern-inside' ||
    pat.type === 'pattern-not-inside'
  ) {
    if (!pat.pattern || typeof pat.pattern !== 'object') {
      return `${pathLabel} requires a pattern object`
    }
    return validateAtom(pat.pattern, `${pathLabel}.pattern`)
  }
  if (pat.type === 'metavariable-pattern') {
    if (typeof pat.metavariable !== 'string' || !pat.metavariable.trim()) {
      return `${pathLabel} metavariable-pattern requires a metavariable name`
    }
    if (!pat.pattern || typeof pat.pattern !== 'object') {
      return `${pathLabel} metavariable-pattern requires a pattern object`
    }
    return validateAtom(pat.pattern, `${pathLabel}.pattern`)
  }
  if (pat.type === 'metavariable-comparison') {
    if (typeof pat.metavariable !== 'string' || !pat.metavariable.trim()) {
      return `${pathLabel} metavariable-comparison requires a metavariable name`
    }
    if (typeof pat.comparison !== 'string' || !pat.comparison.trim()) {
      return `${pathLabel} metavariable-comparison requires a comparison string`
    }
    return null
  }
  return `${pathLabel} unknown pattern type`
}

export function validateRulePackManifest(raw: unknown): string[] {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    return ['manifest must be an object']
  }
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !m.id) errors.push('id is required')
  if (typeof m.name !== 'string' || !m.name) errors.push('name is required')
  if (typeof m.version !== 'string' || !m.version) errors.push('version is required')
  if (!Array.isArray(m.rules)) {
    errors.push('rules must be an array')
    return errors
  }
  m.rules.forEach((rule, i) => {
    if (!rule || typeof rule !== 'object') {
      errors.push(`rules[${i}] must be an object`)
      return
    }
    const r = rule as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id) errors.push(`rules[${i}].id is required`)
    if (typeof r.cweId !== 'string' || !r.cweId) errors.push(`rules[${i}].cweId is required`)
    if (typeof r.name !== 'string' || !r.name) errors.push(`rules[${i}].name is required`)
    if (!Array.isArray(r.patterns) || r.patterns.length === 0) {
      errors.push(`rules[${i}].patterns must be a non-empty array`)
      return
    }
    r.patterns.forEach((p, j) => {
      const err = validatePattern(p, `rules[${i}].patterns[${j}]`)
      if (err) errors.push(err)
    })
  })
  return errors
}

function compileRulePatterns(
  rule: RulePackRule,
  packId: string,
  packVersion: string
): CompiledRule {
  const positive: RegExp[] = []
  const negative: RegExp[] = []
  const inside: RegExp[] = []
  const notInside: RegExp[] = []
  const metavariableConstraints: MetavariableConstraint[] = []

  for (const p of rule.patterns as RulePackPattern[]) {
    if (p.type === 'regex' || p.type === 'pattern') {
      positive.push(compileAtom(p))
    } else if (p.type === 'pattern-either') {
      for (const alt of p.patterns) {
        positive.push(compileAtom(alt))
      }
    } else if (p.type === 'pattern-not') {
      negative.push(compileAtom(p.pattern))
    } else if (p.type === 'pattern-inside') {
      inside.push(compileAtom(p.pattern))
    } else if (p.type === 'pattern-not-inside') {
      notInside.push(compileAtom(p.pattern))
    } else if (p.type === 'metavariable-pattern') {
      // Constrain an already-captured metavariable (e.g. $CODE) to also
      // match a nested pattern — e.g. "only if $CODE contains req.".
      const metavariable = p.metavariable.replace(/^\$/, '')
      metavariableConstraints.push({
        kind: 'pattern',
        metavariable,
        regex: compileAtom(p.pattern),
      })
    } else if (p.type === 'metavariable-comparison') {
      // Only a safe `$VAR <op> NUMBER` subset is supported — anything else
      // (arbitrary expressions) is dropped rather than silently ignored at
      // match time, so an over-broad rule fails loud in tests/parity checks
      // instead of quietly over-firing in production.
      const match = COMPARISON_RE.exec(p.comparison.trim())
      if (match) {
        const [, metavariable, operator, value] = match
        metavariableConstraints.push({
          kind: 'comparison',
          metavariable: metavariable!,
          operator: operator as '<' | '<=' | '>' | '>=' | '==' | '!=',
          value: Number(value),
        })
      }
    }
  }

  return {
    rule: { ...rule, severity: asSeverity(String(rule.severity)) },
    packId,
    packVersion,
    positive,
    negative,
    inside,
    notInside,
    metavariableConstraints,
  }
}

export function getAstRules(manifest: RulePackManifest): RulePackRule[] {
  return manifest.rules.filter(
    (r) => r.enabled !== false && (r.engine === 'ast' || !!r.astVisitor)
  )
}

/**
 * Compile surface (regex/metavar) rules. When `includeAstFallback` is true,
 * also compile AST-tagged rules so regex can run if Babel parse fails.
 */
export function compileRulePack(
  manifest: RulePackManifest,
  options?: { includeAstFallback?: boolean }
): LoadedRulePack {
  const errors = validateRulePackManifest(manifest)
  if (errors.length > 0) {
    throw new Error(`Invalid rule pack ${manifest.id}: ${errors.join('; ')}`)
  }
  const includeAst = options?.includeAstFallback === true
  const compiled = manifest.rules
    .filter((r) => r.enabled !== false)
    .filter((r) => includeAst || (r.engine !== 'ast' && !r.astVisitor))
    .map((r) => compileRulePatterns(r, manifest.id, manifest.version))
  return { manifest, compiled }
}

export function loadRulePackFromObject(raw: unknown): LoadedRulePack {
  const errors = validateRulePackManifest(raw)
  if (errors.length > 0) {
    throw new Error(`Invalid rule pack: ${errors.join('; ')}`)
  }
  return compileRulePack(raw as RulePackManifest)
}
