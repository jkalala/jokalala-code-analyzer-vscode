/**
 * Custom Rule Framework
 *
 * Enterprise-grade custom rule system supporting JSON/YAML definitions.
 * Enables organizations to create and share custom security rules.
 *
 * Features:
 * - JSON/YAML rule definitions
 * - Rule validation and schema enforcement
 * - Rule versioning and compatibility checking
 * - Rule categories and tagging
 * - Rule testing and validation
 * - Import/export functionality
 * - Community rule sharing
 *
 * @module core/custom-rules
 */

import * as crypto from 'crypto'
import { EventEmitter } from 'events'

/**
 * Rule severity levels
 */
export enum RuleSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

/**
 * Rule categories
 */
export enum RuleCategory {
  SECURITY = 'security',
  QUALITY = 'quality',
  PERFORMANCE = 'performance',
  STYLE = 'style',
  BEST_PRACTICE = 'best_practice',
  COMPLIANCE = 'compliance',
  CUSTOM = 'custom',
}

/**
 * Pattern types for rule matching
 */
export enum PatternType {
  REGEX = 'regex',
  AST = 'ast',
  SEMANTIC = 'semantic',
  DATAFLOW = 'dataflow',
}

/**
 * Rule condition operators
 */
export enum ConditionOperator {
  AND = 'and',
  OR = 'or',
  NOT = 'not',
  XOR = 'xor',
}

/**
 * Pattern definition
 */
export interface RulePattern {
  type: PatternType
  value: string
  flags?: string
  multiline?: boolean
  capture?: string[]
  context?: {
    before?: string
    after?: string
    surrounding?: number
  }
  confidence?: number
}

/**
 * Rule condition for complex matching
 */
export interface RuleCondition {
  operator: ConditionOperator
  conditions?: RuleCondition[]
  pattern?: RulePattern
  metadata?: {
    language?: string[]
    filePattern?: string
    excludePattern?: string
  }
}

/**
 * Rule message with placeholders
 */
export interface RuleMessage {
  default: string
  detailed?: string
  fix?: string
  links?: string[]
  placeholders?: Record<string, string>
}

/**
 * Rule fix definition
 */
export interface RuleFix {
  type: 'replace' | 'insert' | 'delete' | 'suggestion'
  pattern?: string
  replacement?: string
  description: string
  isAutoFixable: boolean
  confidence: number
}

/**
 * Rule test case
 */
export interface RuleTestCase {
  name: string
  code: string
  language: string
  shouldMatch: boolean
  expectedMatches?: number
  expectedLine?: number
  expectedColumn?: number
  description?: string
}

/**
 * Custom rule definition
 */
export interface CustomRule {
  id: string
  name: string
  description: string
  version: string
  author?: string
  license?: string
  homepage?: string
  severity: RuleSeverity
  category: RuleCategory
  tags: string[]
  languages: string[]
  patterns: RulePattern[]
  condition?: RuleCondition
  message: RuleMessage
  fixes?: RuleFix[]
  testCases?: RuleTestCase[]
  metadata?: {
    cwe?: string[]
    owasp?: string[]
    cvss?: number
    references?: string[]
    created?: string
    updated?: string
  }
  enabled: boolean
  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}

/**
 * Rule pack (collection of rules)
 */
export interface RulePack {
  id: string
  name: string
  description: string
  version: string
  author?: string
  license?: string
  homepage?: string
  rules: CustomRule[]
  metadata?: {
    created?: string
    updated?: string
    tags?: string[]
  }
}

/**
 * Rule validation result
 */
export interface RuleValidationResult {
  valid: boolean
  errors: Array<{
    field: string
    message: string
    severity: 'error' | 'warning'
  }>
  warnings: Array<{
    field: string
    message: string
  }>
}

/**
 * Rule test result
 */
export interface RuleTestResult {
  passed: boolean
  testCase: RuleTestCase
  matches: Array<{
    line: number
    column: number
    match: string
  }>
  error?: string
  duration: number
}

/**
 * Rule match result
 */
export interface RuleMatch {
  ruleId: string
  ruleName: string
  severity: RuleSeverity
  category: RuleCategory
  message: string
  file: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  codeSnippet: string
  suggestion?: string
  fix?: RuleFix
  confidence: number
  metadata?: Record<string, unknown>
}

/**
 * Rule engine configuration
 */
export interface RuleEngineConfig {
  enableCaching: boolean
  cacheSize: number
  enableParallelExecution: boolean
  maxConcurrency: number
  timeout: number
  strictMode: boolean
  allowDeprecated: boolean
}

const DEFAULT_ENGINE_CONFIG: RuleEngineConfig = {
  enableCaching: true,
  cacheSize: 1000,
  enableParallelExecution: true,
  maxConcurrency: 4,
  timeout: 30000,
  strictMode: false,
  allowDeprecated: false,
}

/**
 * Rule Schema for validation
 */
const RULE_SCHEMA = {
  required: ['id', 'name', 'description', 'version', 'severity', 'category', 'languages', 'patterns', 'message'],
  properties: {
    id: { type: 'string', pattern: /^[a-z][a-z0-9-]*[a-z0-9]$/i },
    name: { type: 'string', minLength: 3, maxLength: 100 },
    description: { type: 'string', minLength: 10 },
    version: { type: 'string', pattern: /^\d+\.\d+\.\d+$/ },
    severity: { type: 'enum', values: Object.values(RuleSeverity) },
    category: { type: 'enum', values: Object.values(RuleCategory) },
    languages: { type: 'array', items: { type: 'string' }, minItems: 1 },
    patterns: { type: 'array', items: { type: 'object' }, minItems: 1 },
    message: { type: 'object', required: ['default'] },
  },
}

/**
 * Rule validator
 */
class RuleValidator {
  validate(rule: Partial<CustomRule>): RuleValidationResult {
    const errors: RuleValidationResult['errors'] = []
    const warnings: RuleValidationResult['warnings'] = []

    // Check required fields
    for (const field of RULE_SCHEMA.required) {
      if (!(field in rule) || rule[field as keyof CustomRule] === undefined) {
        errors.push({
          field,
          message: `Missing required field: ${field}`,
          severity: 'error',
        })
      }
    }

    // Validate ID format
    if (rule.id && !RULE_SCHEMA.properties.id.pattern.test(rule.id)) {
      errors.push({
        field: 'id',
        message: 'Invalid ID format. Must be alphanumeric with hyphens.',
        severity: 'error',
      })
    }

    // Validate name length
    if (rule.name) {
      if (rule.name.length < 3) {
        errors.push({
          field: 'name',
          message: 'Name must be at least 3 characters',
          severity: 'error',
        })
      }
      if (rule.name.length > 100) {
        errors.push({
          field: 'name',
          message: 'Name must be at most 100 characters',
          severity: 'error',
        })
      }
    }

    // Validate version format
    if (rule.version && !RULE_SCHEMA.properties.version.pattern.test(rule.version)) {
      errors.push({
        field: 'version',
        message: 'Version must be in semver format (x.y.z)',
        severity: 'error',
      })
    }

    // Validate severity
    if (rule.severity && !Object.values(RuleSeverity).includes(rule.severity)) {
      errors.push({
        field: 'severity',
        message: `Invalid severity. Must be one of: ${Object.values(RuleSeverity).join(', ')}`,
        severity: 'error',
      })
    }

    // Validate category
    if (rule.category && !Object.values(RuleCategory).includes(rule.category)) {
      errors.push({
        field: 'category',
        message: `Invalid category. Must be one of: ${Object.values(RuleCategory).join(', ')}`,
        severity: 'error',
      })
    }

    // Validate patterns
    if (rule.patterns) {
      for (let i = 0; i < rule.patterns.length; i++) {
        const pattern = rule.patterns[i]

        if (!pattern.type || !Object.values(PatternType).includes(pattern.type)) {
          errors.push({
            field: `patterns[${i}].type`,
            message: `Invalid pattern type. Must be one of: ${Object.values(PatternType).join(', ')}`,
            severity: 'error',
          })
        }

        if (!pattern.value) {
          errors.push({
            field: `patterns[${i}].value`,
            message: 'Pattern value is required',
            severity: 'error',
          })
        }

        // Validate regex patterns
        if (pattern.type === PatternType.REGEX) {
          try {
            new RegExp(pattern.value, pattern.flags || '')
          } catch (e) {
            errors.push({
              field: `patterns[${i}].value`,
              message: `Invalid regex pattern: ${(e as Error).message}`,
              severity: 'error',
            })
          }
        }
      }
    }

    // Validate message
    if (rule.message && !rule.message.default) {
      errors.push({
        field: 'message.default',
        message: 'Default message is required',
        severity: 'error',
      })
    }

    // Warnings
    if (!rule.testCases || rule.testCases.length === 0) {
      warnings.push({
        field: 'testCases',
        message: 'No test cases defined. Consider adding tests for better reliability.',
      })
    }

    if (rule.deprecated && !rule.deprecationMessage) {
      warnings.push({
        field: 'deprecationMessage',
        message: 'Deprecated rule should have a deprecation message.',
      })
    }

    if (!rule.metadata?.cwe && rule.category === RuleCategory.SECURITY) {
      warnings.push({
        field: 'metadata.cwe',
        message: 'Security rules should include CWE references.',
      })
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  validatePack(pack: Partial<RulePack>): RuleValidationResult {
    const errors: RuleValidationResult['errors'] = []
    const warnings: RuleValidationResult['warnings'] = []

    // Validate pack metadata
    if (!pack.id) {
      errors.push({ field: 'id', message: 'Pack ID is required', severity: 'error' })
    }
    if (!pack.name) {
      errors.push({ field: 'name', message: 'Pack name is required', severity: 'error' })
    }
    if (!pack.version) {
      errors.push({ field: 'version', message: 'Pack version is required', severity: 'error' })
    }
    if (!pack.rules || pack.rules.length === 0) {
      errors.push({ field: 'rules', message: 'Pack must contain at least one rule', severity: 'error' })
    }

    // Validate each rule
    if (pack.rules) {
      const ruleIds = new Set<string>()
      for (let i = 0; i < pack.rules.length; i++) {
        const rule = pack.rules[i]
        const ruleValidation = this.validate(rule)

        // Check for duplicate IDs
        if (ruleIds.has(rule.id)) {
          errors.push({
            field: `rules[${i}].id`,
            message: `Duplicate rule ID: ${rule.id}`,
            severity: 'error',
          })
        }
        ruleIds.add(rule.id)

        // Add rule errors with context
        for (const error of ruleValidation.errors) {
          errors.push({
            field: `rules[${i}].${error.field}`,
            message: error.message,
            severity: error.severity,
          })
        }
        for (const warning of ruleValidation.warnings) {
          warnings.push({
            field: `rules[${i}].${warning.field}`,
            message: warning.message,
          })
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

/**
 * Rule compiler - compiles rules to executable form
 */
class RuleCompiler {
  private compiledPatterns: Map<string, RegExp[]> = new Map()

  compile(rule: CustomRule): void {
    const patterns: RegExp[] = []

    for (const pattern of rule.patterns) {
      if (pattern.type === PatternType.REGEX) {
        try {
          const flags = pattern.multiline ? `${pattern.flags || ''}m` : pattern.flags || ''
          patterns.push(new RegExp(pattern.value, flags + 'g'))
        } catch {
          // Invalid pattern - skip
        }
      }
    }

    this.compiledPatterns.set(rule.id, patterns)
  }

  getCompiledPatterns(ruleId: string): RegExp[] {
    return this.compiledPatterns.get(ruleId) || []
  }

  clearCache(): void {
    this.compiledPatterns.clear()
  }
}

/**
 * Rule matcher - executes rules against code
 */
class RuleMatcher {
  private compiler: RuleCompiler

  constructor(compiler: RuleCompiler) {
    this.compiler = compiler
  }

  match(rule: CustomRule, code: string, filename: string): RuleMatch[] {
    const matches: RuleMatch[] = []
    const lines = code.split('\n')
    const patterns = this.compiler.getCompiledPatterns(rule.id)

    // Check language applicability
    const fileExt = filename.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string[]> = {
      'ts': ['typescript'],
      'tsx': ['typescript', 'typescriptreact'],
      'js': ['javascript'],
      'jsx': ['javascript', 'javascriptreact'],
      'py': ['python'],
      'java': ['java'],
      'go': ['go'],
      'rs': ['rust'],
      'c': ['c'],
      'cpp': ['cpp', 'c++'],
      'cs': ['csharp'],
      'php': ['php'],
      'rb': ['ruby'],
    }

    const fileLanguages = languageMap[fileExt || ''] || []
    const isApplicable = rule.languages.includes('*') ||
      rule.languages.some(lang => fileLanguages.includes(lang.toLowerCase()))

    if (!isApplicable) {
      return matches
    }

    // Match each pattern
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match

      while ((match = pattern.exec(code)) !== null) {
        const matchText = match[0]
        const beforeMatch = code.substring(0, match.index)
        const lineNumber = beforeMatch.split('\n').length
        const lastNewline = beforeMatch.lastIndexOf('\n')
        const column = match.index - lastNewline - 1

        // Calculate end position
        const matchLines = matchText.split('\n')
        const endLine = lineNumber + matchLines.length - 1
        const endColumn = matchLines.length > 1
          ? matchLines[matchLines.length - 1].length
          : column + matchText.length

        // Get code snippet
        const snippetStart = Math.max(0, lineNumber - 2)
        const snippetEnd = Math.min(lines.length, endLine + 2)
        const codeSnippet = lines.slice(snippetStart, snippetEnd).join('\n')

        // Build message with placeholders
        let message = rule.message.default
        if (rule.message.placeholders) {
          for (const [key, value] of Object.entries(rule.message.placeholders)) {
            message = message.replace(`{{${key}}}`, value)
          }
        }
        // Replace capture groups
        for (let i = 0; i < match.length; i++) {
          message = message.replace(`{{$${i}}}`, match[i] || '')
        }

        // Find applicable fix
        const fix = rule.fixes?.find(f => f.confidence >= 0.7)

        matches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          category: rule.category,
          message,
          file: filename,
          line: lineNumber,
          column,
          endLine,
          endColumn,
          codeSnippet,
          suggestion: rule.message.fix,
          fix,
          confidence: rule.patterns[0]?.confidence || 0.8,
          metadata: {
            cwe: rule.metadata?.cwe,
            owasp: rule.metadata?.owasp,
            tags: rule.tags,
          },
        })
      }
    }

    return matches
  }
}

/**
 * Rule tester - runs test cases against rules
 */
class RuleTester {
  private matcher: RuleMatcher

  constructor(matcher: RuleMatcher) {
    this.matcher = matcher
  }

  runTests(rule: CustomRule): RuleTestResult[] {
    if (!rule.testCases || rule.testCases.length === 0) {
      return []
    }

    const results: RuleTestResult[] = []

    for (const testCase of rule.testCases) {
      const startTime = performance.now()

      try {
        const matches = this.matcher.match(rule, testCase.code, `test.${testCase.language}`)

        const passed = testCase.shouldMatch
          ? matches.length > 0
          : matches.length === 0

        // Additional checks
        let additionalChecks = true
        if (passed && testCase.shouldMatch) {
          if (testCase.expectedMatches !== undefined && matches.length !== testCase.expectedMatches) {
            additionalChecks = false
          }
          if (testCase.expectedLine !== undefined && !matches.some(m => m.line === testCase.expectedLine)) {
            additionalChecks = false
          }
        }

        results.push({
          passed: passed && additionalChecks,
          testCase,
          matches: matches.map(m => ({
            line: m.line,
            column: m.column,
            match: m.codeSnippet.split('\n')[0] || '',
          })),
          duration: performance.now() - startTime,
        })
      } catch (error) {
        results.push({
          passed: false,
          testCase,
          matches: [],
          error: (error as Error).message,
          duration: performance.now() - startTime,
        })
      }
    }

    return results
  }
}

/**
 * Custom Rule Engine
 *
 * Main engine for managing and executing custom rules.
 */
export class CustomRuleEngine extends EventEmitter {
  private config: RuleEngineConfig
  private rules: Map<string, CustomRule> = new Map()
  private packs: Map<string, RulePack> = new Map()
  private validator: RuleValidator
  private compiler: RuleCompiler
  private matcher: RuleMatcher
  private tester: RuleTester

  constructor(config: Partial<RuleEngineConfig> = {}) {
    super()
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config }
    this.validator = new RuleValidator()
    this.compiler = new RuleCompiler()
    this.matcher = new RuleMatcher(this.compiler)
    this.tester = new RuleTester(this.matcher)
  }

  /**
   * Add a single rule
   */
  addRule(rule: CustomRule): RuleValidationResult {
    const validation = this.validator.validate(rule)

    if (validation.valid || !this.config.strictMode) {
      // Check deprecated rules
      if (rule.deprecated && !this.config.allowDeprecated) {
        validation.errors.push({
          field: 'deprecated',
          message: `Rule ${rule.id} is deprecated: ${rule.deprecationMessage}`,
          severity: 'warning',
        })
        return validation
      }

      this.rules.set(rule.id, rule)
      this.compiler.compile(rule)
      this.emit('rule-added', { ruleId: rule.id })
    }

    return validation
  }

  /**
   * Add a rule pack
   */
  addRulePack(pack: RulePack): RuleValidationResult {
    const validation = this.validator.validatePack(pack)

    if (validation.valid || !this.config.strictMode) {
      this.packs.set(pack.id, pack)

      for (const rule of pack.rules) {
        if (!rule.deprecated || this.config.allowDeprecated) {
          this.rules.set(rule.id, rule)
          this.compiler.compile(rule)
        }
      }

      this.emit('pack-added', { packId: pack.id, rulesCount: pack.rules.length })
    }

    return validation
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId)
    if (removed) {
      this.emit('rule-removed', { ruleId })
    }
    return removed
  }

  /**
   * Remove a rule pack
   */
  removeRulePack(packId: string): boolean {
    const pack = this.packs.get(packId)
    if (!pack) return false

    for (const rule of pack.rules) {
      this.rules.delete(rule.id)
    }

    this.packs.delete(packId)
    this.emit('pack-removed', { packId })
    return true
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): CustomRule | undefined {
    return this.rules.get(ruleId)
  }

  /**
   * Get all rules
   */
  getRules(): CustomRule[] {
    return Array.from(this.rules.values())
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): CustomRule[] {
    return Array.from(this.rules.values()).filter(r => r.enabled)
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): CustomRule[] {
    return Array.from(this.rules.values()).filter(r => r.category === category)
  }

  /**
   * Get rules by language
   */
  getRulesByLanguage(language: string): CustomRule[] {
    return Array.from(this.rules.values()).filter(r =>
      r.languages.includes('*') || r.languages.includes(language)
    )
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId)
    if (rule) {
      rule.enabled = enabled
      this.emit('rule-toggled', { ruleId, enabled })
      return true
    }
    return false
  }

  /**
   * Execute rules against code
   */
  execute(code: string, filename: string, options?: {
    ruleIds?: string[]
    categories?: RuleCategory[]
    minSeverity?: RuleSeverity
    maxMatches?: number
  }): RuleMatch[] {
    const startTime = performance.now()
    const allMatches: RuleMatch[] = []

    // Get applicable rules
    let rules = this.getEnabledRules()

    if (options?.ruleIds) {
      rules = rules.filter(r => options.ruleIds!.includes(r.id))
    }

    if (options?.categories) {
      rules = rules.filter(r => options.categories!.includes(r.category))
    }

    if (options?.minSeverity) {
      const severityOrder: Record<RuleSeverity, number> = {
        [RuleSeverity.CRITICAL]: 0,
        [RuleSeverity.HIGH]: 1,
        [RuleSeverity.MEDIUM]: 2,
        [RuleSeverity.LOW]: 3,
        [RuleSeverity.INFO]: 4,
      }
      const minOrder = severityOrder[options.minSeverity]
      rules = rules.filter(r => severityOrder[r.severity] <= minOrder)
    }

    // Execute rules
    for (const rule of rules) {
      const matches = this.matcher.match(rule, code, filename)
      allMatches.push(...matches)

      if (options?.maxMatches && allMatches.length >= options.maxMatches) {
        break
      }
    }

    // Sort by severity
    allMatches.sort((a, b) => {
      const order: Record<RuleSeverity, number> = {
        [RuleSeverity.CRITICAL]: 0,
        [RuleSeverity.HIGH]: 1,
        [RuleSeverity.MEDIUM]: 2,
        [RuleSeverity.LOW]: 3,
        [RuleSeverity.INFO]: 4,
      }
      return order[a.severity] - order[b.severity]
    })

    this.emit('execution-complete', {
      rulesExecuted: rules.length,
      matchesFound: allMatches.length,
      duration: performance.now() - startTime,
    })

    return allMatches
  }

  /**
   * Validate a rule
   */
  validateRule(rule: CustomRule): RuleValidationResult {
    return this.validator.validate(rule)
  }

  /**
   * Test a rule
   */
  testRule(ruleId: string): RuleTestResult[] {
    const rule = this.rules.get(ruleId)
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`)
    }
    return this.tester.runTests(rule)
  }

  /**
   * Test all rules in a pack
   */
  testPack(packId: string): Map<string, RuleTestResult[]> {
    const pack = this.packs.get(packId)
    if (!pack) {
      throw new Error(`Pack not found: ${packId}`)
    }

    const results = new Map<string, RuleTestResult[]>()
    for (const rule of pack.rules) {
      results.set(rule.id, this.tester.runTests(rule))
    }
    return results
  }

  /**
   * Export rules to JSON
   */
  exportRules(ruleIds?: string[]): string {
    const rules = ruleIds
      ? Array.from(this.rules.values()).filter(r => ruleIds.includes(r.id))
      : Array.from(this.rules.values())

    return JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      rules,
    }, null, 2)
  }

  /**
   * Import rules from JSON
   */
  importRules(json: string): { imported: number; errors: string[] } {
    const data = JSON.parse(json)
    const errors: string[] = []
    let imported = 0

    if (!data.rules || !Array.isArray(data.rules)) {
      return { imported: 0, errors: ['Invalid JSON format: missing rules array'] }
    }

    for (const rule of data.rules) {
      const validation = this.addRule(rule)
      if (validation.valid) {
        imported++
      } else {
        errors.push(`Rule ${rule.id}: ${validation.errors.map(e => e.message).join(', ')}`)
      }
    }

    return { imported, errors }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalRules: number
    enabledRules: number
    byCategory: Record<string, number>
    bySeverity: Record<string, number>
    byLanguage: Record<string, number>
    packsLoaded: number
  } {
    const rules = Array.from(this.rules.values())

    const byCategory: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}

    for (const rule of rules) {
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1
      for (const lang of rule.languages) {
        byLanguage[lang] = (byLanguage[lang] || 0) + 1
      }
    }

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      byCategory,
      bySeverity,
      byLanguage,
      packsLoaded: this.packs.size,
    }
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules.clear()
    this.packs.clear()
    this.compiler.clearCache()
    this.emit('cleared')
  }
}

/**
 * Create a custom rule engine instance
 */
export function createCustomRuleEngine(config?: Partial<RuleEngineConfig>): CustomRuleEngine {
  return new CustomRuleEngine(config)
}

/**
 * Singleton instance
 */
let customRuleEngine: CustomRuleEngine | null = null

export function getCustomRuleEngine(config?: Partial<RuleEngineConfig>): CustomRuleEngine {
  if (!customRuleEngine) {
    customRuleEngine = new CustomRuleEngine(config)
  }
  return customRuleEngine
}

/**
 * Create a rule from JSON definition
 */
export function createRuleFromJSON(json: string): CustomRule {
  return JSON.parse(json) as CustomRule
}

/**
 * Create a rule pack from JSON definition
 */
export function createRulePackFromJSON(json: string): RulePack {
  return JSON.parse(json) as RulePack
}
