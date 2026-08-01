/**
 * Shared rule-pack types — byte-compatible with cloud Semgrep-lite packs.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface RulePackPatternRegex {
  type: 'regex'
  value: string
  flags?: string
}

export interface RulePackPatternMetavar {
  type: 'pattern'
  value: string
  flags?: string
  metavariableRegex?: Record<string, string>
}

export type RulePackPatternAtom = RulePackPatternRegex | RulePackPatternMetavar

export interface RulePackPatternEither {
  type: 'pattern-either'
  patterns: RulePackPatternAtom[]
}

export interface RulePackPatternNot {
  type: 'pattern-not'
  pattern: RulePackPatternAtom
}

export interface RulePackPatternInside {
  type: 'pattern-inside'
  pattern: RulePackPatternAtom
}

export interface RulePackPatternNotInside {
  type: 'pattern-not-inside'
  pattern: RulePackPatternAtom
}

export interface RulePackMetavariablePattern {
  type: 'metavariable-pattern'
  metavariable: string
  pattern: RulePackPatternAtom
}

export interface RulePackMetavariableComparison {
  type: 'metavariable-comparison'
  metavariable: string
  comparison: string
  strip?: boolean
  base?: number
}

export type RulePackPattern =
  | RulePackPatternAtom
  | RulePackPatternEither
  | RulePackPatternNot
  | RulePackPatternInside
  | RulePackPatternNotInside
  | RulePackMetavariablePattern
  | RulePackMetavariableComparison

/** Local Tier-1 engine hint (optional; defaults to regex/surface). */
export type RuleEngineHint = 'regex' | 'ast'

export interface RulePackRule {
  id: string
  cweId: string
  name: string
  category: string
  severity: Severity | string
  enabled?: boolean
  languages?: string[]
  patterns: RulePackPattern[]
  message?: string
  description?: string
  recommendation?: string
  owaspCategory?: string
  engine?: RuleEngineHint
  astVisitor?: string
}

export interface RulePackManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  license?: string
  rules: RulePackRule[]
}

export interface PackFinding {
  ruleId: string
  packId: string
  packVersion: string
  name: string
  message: string
  severity: Severity
  category: string
  cweId: string
  owaspCategory?: string
  recommendation?: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  matchedText: string
  engine: 'regex' | 'ast'
  source: 'local-pack'
  engineTier: 1
}

/**
 * A metavariable-pattern/metavariable-comparison constraint, evaluated
 * against the named capture group a positive match produced for that
 * metavariable (see compile-metavar.ts, which compiles `$FOO` into
 * `(?<FOO>...)`). Only a safe, minimal subset of semgrep's comparison
 * language is supported: `$VAR <op> NUMBER`. Comparisons outside that
 * subset are dropped at compile time rather than silently ignored at
 * match time (see load-rule-pack.ts).
 */
export type MetavariableConstraint =
  | { kind: 'pattern'; metavariable: string; regex: RegExp }
  | {
      kind: 'comparison'
      metavariable: string
      operator: '<' | '<=' | '>' | '>=' | '==' | '!='
      value: number
    }

export interface CompiledRule {
  rule: RulePackRule
  packId: string
  packVersion: string
  positive: RegExp[]
  negative: RegExp[]
  inside: RegExp[]
  notInside: RegExp[]
  metavariableConstraints: MetavariableConstraint[]
}

export interface LoadedRulePack {
  manifest: RulePackManifest
  compiled: CompiledRule[]
}
