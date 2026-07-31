/**
 * Builtin pack manifests (JSON next to package packs/).
 * Embedded require keeps the package usable from extension + Node without a CDN.
 */

import type { RulePackManifest } from './types'
import { loadRulePackFromObject, validateRulePackManifest, compileRulePack } from './load-rule-pack'
import { matchCompiledRules } from './match-rules'
import { compileMetavarPattern } from './compile-metavar'
import { dedupeFindingsByCweLine } from './dedupe'
import {
  shouldSuppressFinding,
  offsetFromLineCol,
} from './suppressions'
import type { LoadedRulePack, PackFinding } from './types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const secretsJson = require('../packs/jokalala.secrets.json') as RulePackManifest
// eslint-disable-next-line @typescript-eslint/no-var-requires
const patternsJson = require('../packs/jokalala.patterns.json') as RulePackManifest
// eslint-disable-next-line @typescript-eslint/no-var-requires
const javascriptJson = require('../packs/jokalala.javascript.json') as RulePackManifest

export const BUILTIN_PACK_MANIFESTS: Record<string, RulePackManifest> = {
  'jokalala.secrets': secretsJson,
  'jokalala.patterns': patternsJson,
  'jokalala.javascript': javascriptJson,
}

/**
 * Precision profile (default IDE Tier-1): secrets + JS/TS high-signal packs.
 * Omits noisy Semgrep-lite `jokalala.patterns` — opt in via full profile.
 */
export const DEFAULT_TIER1_PACK_IDS = [
  'jokalala.secrets',
  'jokalala.javascript',
] as const

/** Full local corpus including Semgrep-lite patterns (parity / deep local). */
export const FULL_TIER1_PACK_IDS = [
  'jokalala.secrets',
  'jokalala.patterns',
  'jokalala.javascript',
] as const

let cachedDefaultPacks: LoadedRulePack[] | null = null
let cachedFullPacks: LoadedRulePack[] | null = null

export function getBuiltinManifest(packId: string): RulePackManifest | undefined {
  return BUILTIN_PACK_MANIFESTS[packId]
}

export function loadBuiltinPack(packId: string): LoadedRulePack {
  const manifest = BUILTIN_PACK_MANIFESTS[packId]
  if (!manifest) {
    throw new Error(`Unknown builtin pack: ${packId}`)
  }
  return loadRulePackFromObject(manifest)
}

export function loadDefaultTier1Packs(): LoadedRulePack[] {
  if (cachedDefaultPacks) return cachedDefaultPacks
  cachedDefaultPacks = DEFAULT_TIER1_PACK_IDS.map((id) => loadBuiltinPack(id))
  return cachedDefaultPacks
}

export function loadFullTier1Packs(): LoadedRulePack[] {
  if (cachedFullPacks) return cachedFullPacks
  cachedFullPacks = FULL_TIER1_PACK_IDS.map((id) => loadBuiltinPack(id))
  return cachedFullPacks
}

export function loadTier1Packs(
  profile: 'precision' | 'full' = 'precision'
): LoadedRulePack[] {
  return profile === 'full' ? loadFullTier1Packs() : loadDefaultTier1Packs()
}

export function listBuiltinPackVersions(): Array<{ id: string; version: string; name: string }> {
  return Object.values(BUILTIN_PACK_MANIFESTS).map((m) => ({
    id: m.id,
    version: m.version,
    name: m.name,
  }))
}

export interface AnalyzePackOptions {
  packs?: LoadedRulePack[]
  /** Apply safe-sink / test-path suppressions (default true). */
  suppressNoise?: boolean
  filePathHint?: string
  /** Dedupe by CWE+line (default true). */
  dedupe?: boolean
}

/**
 * Run surface matching with optional noise controls.
 */
export function analyzeWithPacks(
  source: string,
  language: string,
  packsOrOptions?: LoadedRulePack[] | AnalyzePackOptions
): PackFinding[] {
  const options: AnalyzePackOptions = Array.isArray(packsOrOptions)
    ? { packs: packsOrOptions }
    : packsOrOptions || {}

  const loaded = options.packs || loadDefaultTier1Packs()
  let findings: PackFinding[] = []
  for (const pack of loaded) {
    findings.push(...matchCompiledRules(source, pack.compiled, language))
  }

  if (options.suppressNoise !== false) {
    findings = findings.filter((f) => {
      const start = offsetFromLineCol(source, f.line, f.column)
      const end = start + (f.matchedText?.length || 1)
      return !shouldSuppressFinding(source, start, end, options.filePathHint)
    })
  }

  if (options.dedupe !== false) {
    findings = dedupeFindingsByCweLine(findings)
  }

  return findings
}

export type {
  RulePackManifest,
  RulePackRule,
  RulePackPattern,
  LoadedRulePack,
  PackFinding,
  CompiledRule,
  Severity,
  RuleEngineHint,
} from './types'

export {
  validateRulePackManifest,
  compileRulePack,
  loadRulePackFromObject,
  validatePattern,
  getAstRules,
} from './load-rule-pack'

export { matchCompiledRules } from './match-rules'
export { compileMetavarPattern } from './compile-metavar'
export { dedupeFindingsByCweLine, severityRank } from './dedupe'
export { shouldSuppressFinding, offsetFromLineCol } from './suppressions'
