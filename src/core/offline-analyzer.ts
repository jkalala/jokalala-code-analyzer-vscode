/**
 * Offline Analysis Engine
 *
 * Thin wrapper around LocalDeterministicEngine (shared versioned packs + JS/TS AST).
 * Preserves the public API used by fail-open and hybrid Tier-1 paths.
 *
 * @module core/offline-analyzer
 */

import { EventEmitter } from 'events'
import {
  getLocalDeterministicEngine,
  LocalDeterministicEngine,
} from './local-deterministic-engine'
import {
  Severity,
  type SecurityIssue,
  type OfflineAnalysisOptions,
  type OfflineAnalysisResult,
} from './security-types'

export { Severity }
export type { SecurityIssue, OfflineAnalysisOptions, OfflineAnalysisResult }

/**
 * Security rule definition (legacy custom-rule API)
 */
export interface SecurityRule {
  id: string
  name: string
  description: string
  severity: Severity
  category: string
  cwe: string[]
  owasp: string[]
  languages: string[]
  patterns: RulePattern[]
  message: string
  suggestion: string
  fixTemplate?: string
  falsePositivePatterns?: string[]
  enabled: boolean
  priority: number
  references: string[]
}

/**
 * Pattern for rule matching
 */
export interface RulePattern {
  type: 'regex' | 'ast' | 'semantic' | 'taint'
  pattern: string
  flags?: string
  multiline?: boolean
  negativePatterns?: string[]
  contextPatterns?: string[]
  minConfidence?: number
}

/**
 * Offline Security Analyzer — delegates to LocalDeterministicEngine (Tier 1).
 */
export class OfflineAnalyzer extends EventEmitter {
  private engine: LocalDeterministicEngine
  private isInitialized: boolean = false

  constructor() {
    super()
    this.engine = getLocalDeterministicEngine()
  }

  initialize(): void {
    if (this.isInitialized) return
    this.isInitialized = true
    this.emit('initialized', {
      packs: this.engine.getPackVersions(),
    })
  }

  /** @deprecated Custom hardcoded rules superseded by shared packs */
  addRules(_rules: SecurityRule[]): void {
    this.emit('rules-added', { count: 0, note: 'use shared rule packs' })
  }

  analyze(
    code: string,
    language: string,
    options: OfflineAnalysisOptions = {}
  ): OfflineAnalysisResult {
    if (!this.isInitialized) {
      this.initialize()
    }
    return this.engine.analyze(code, language, options)
  }

  getRules(): SecurityRule[] {
    return []
  }

  getRule(_id: string): SecurityRule | undefined {
    return undefined
  }

  setRuleEnabled(_id: string, _enabled: boolean): void {
    /* packs are versioned; enable/disable via options.disabledRules */
  }

  getSupportedLanguages(): string[] {
    return [
      'javascript',
      'typescript',
      'python',
      'java',
      'go',
      'ruby',
      'php',
      'csharp',
    ]
  }

  getCategories(): string[] {
    return [
      'injection',
      'xss',
      'data_exposure',
      'credentials',
      'cryptography',
      'configuration',
    ]
  }
}

let offlineAnalyzer: OfflineAnalyzer | null = null

export function getOfflineAnalyzer(): OfflineAnalyzer {
  if (!offlineAnalyzer) {
    offlineAnalyzer = new OfflineAnalyzer()
    offlineAnalyzer.initialize()
  }
  return offlineAnalyzer
}
