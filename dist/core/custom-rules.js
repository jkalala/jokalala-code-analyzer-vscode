"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomRuleEngine = exports.ConditionOperator = exports.PatternType = exports.RuleCategory = exports.RuleSeverity = void 0;
exports.createCustomRuleEngine = createCustomRuleEngine;
exports.getCustomRuleEngine = getCustomRuleEngine;
exports.createRuleFromJSON = createRuleFromJSON;
exports.createRulePackFromJSON = createRulePackFromJSON;
const events_1 = require("events");
/**
 * Rule severity levels
 */
var RuleSeverity;
(function (RuleSeverity) {
    RuleSeverity["CRITICAL"] = "critical";
    RuleSeverity["HIGH"] = "high";
    RuleSeverity["MEDIUM"] = "medium";
    RuleSeverity["LOW"] = "low";
    RuleSeverity["INFO"] = "info";
})(RuleSeverity || (exports.RuleSeverity = RuleSeverity = {}));
/**
 * Rule categories
 */
var RuleCategory;
(function (RuleCategory) {
    RuleCategory["SECURITY"] = "security";
    RuleCategory["QUALITY"] = "quality";
    RuleCategory["PERFORMANCE"] = "performance";
    RuleCategory["STYLE"] = "style";
    RuleCategory["BEST_PRACTICE"] = "best_practice";
    RuleCategory["COMPLIANCE"] = "compliance";
    RuleCategory["CUSTOM"] = "custom";
})(RuleCategory || (exports.RuleCategory = RuleCategory = {}));
/**
 * Pattern types for rule matching
 */
var PatternType;
(function (PatternType) {
    PatternType["REGEX"] = "regex";
    PatternType["AST"] = "ast";
    PatternType["SEMANTIC"] = "semantic";
    PatternType["DATAFLOW"] = "dataflow";
})(PatternType || (exports.PatternType = PatternType = {}));
/**
 * Rule condition operators
 */
var ConditionOperator;
(function (ConditionOperator) {
    ConditionOperator["AND"] = "and";
    ConditionOperator["OR"] = "or";
    ConditionOperator["NOT"] = "not";
    ConditionOperator["XOR"] = "xor";
})(ConditionOperator || (exports.ConditionOperator = ConditionOperator = {}));
const DEFAULT_ENGINE_CONFIG = {
    enableCaching: true,
    cacheSize: 1000,
    enableParallelExecution: true,
    maxConcurrency: 4,
    timeout: 30000,
    strictMode: false,
    allowDeprecated: false,
};
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
};
/**
 * Rule validator
 */
class RuleValidator {
    validate(rule) {
        const errors = [];
        const warnings = [];
        // Check required fields
        for (const field of RULE_SCHEMA.required) {
            if (!(field in rule) || rule[field] === undefined) {
                errors.push({
                    field,
                    message: `Missing required field: ${field}`,
                    severity: 'error',
                });
            }
        }
        // Validate ID format
        if (rule.id && !RULE_SCHEMA.properties.id.pattern.test(rule.id)) {
            errors.push({
                field: 'id',
                message: 'Invalid ID format. Must be alphanumeric with hyphens.',
                severity: 'error',
            });
        }
        // Validate name length
        if (rule.name) {
            if (rule.name.length < 3) {
                errors.push({
                    field: 'name',
                    message: 'Name must be at least 3 characters',
                    severity: 'error',
                });
            }
            if (rule.name.length > 100) {
                errors.push({
                    field: 'name',
                    message: 'Name must be at most 100 characters',
                    severity: 'error',
                });
            }
        }
        // Validate version format
        if (rule.version && !RULE_SCHEMA.properties.version.pattern.test(rule.version)) {
            errors.push({
                field: 'version',
                message: 'Version must be in semver format (x.y.z)',
                severity: 'error',
            });
        }
        // Validate severity
        if (rule.severity && !Object.values(RuleSeverity).includes(rule.severity)) {
            errors.push({
                field: 'severity',
                message: `Invalid severity. Must be one of: ${Object.values(RuleSeverity).join(', ')}`,
                severity: 'error',
            });
        }
        // Validate category
        if (rule.category && !Object.values(RuleCategory).includes(rule.category)) {
            errors.push({
                field: 'category',
                message: `Invalid category. Must be one of: ${Object.values(RuleCategory).join(', ')}`,
                severity: 'error',
            });
        }
        // Validate patterns
        if (rule.patterns) {
            for (let i = 0; i < rule.patterns.length; i++) {
                const pattern = rule.patterns[i];
                if (!pattern.type || !Object.values(PatternType).includes(pattern.type)) {
                    errors.push({
                        field: `patterns[${i}].type`,
                        message: `Invalid pattern type. Must be one of: ${Object.values(PatternType).join(', ')}`,
                        severity: 'error',
                    });
                }
                if (!pattern.value) {
                    errors.push({
                        field: `patterns[${i}].value`,
                        message: 'Pattern value is required',
                        severity: 'error',
                    });
                }
                // Validate regex patterns
                if (pattern.type === PatternType.REGEX) {
                    try {
                        new RegExp(pattern.value, pattern.flags || '');
                    }
                    catch (e) {
                        errors.push({
                            field: `patterns[${i}].value`,
                            message: `Invalid regex pattern: ${e.message}`,
                            severity: 'error',
                        });
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
            });
        }
        // Warnings
        if (!rule.testCases || rule.testCases.length === 0) {
            warnings.push({
                field: 'testCases',
                message: 'No test cases defined. Consider adding tests for better reliability.',
            });
        }
        if (rule.deprecated && !rule.deprecationMessage) {
            warnings.push({
                field: 'deprecationMessage',
                message: 'Deprecated rule should have a deprecation message.',
            });
        }
        if (!rule.metadata?.cwe && rule.category === RuleCategory.SECURITY) {
            warnings.push({
                field: 'metadata.cwe',
                message: 'Security rules should include CWE references.',
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validatePack(pack) {
        const errors = [];
        const warnings = [];
        // Validate pack metadata
        if (!pack.id) {
            errors.push({ field: 'id', message: 'Pack ID is required', severity: 'error' });
        }
        if (!pack.name) {
            errors.push({ field: 'name', message: 'Pack name is required', severity: 'error' });
        }
        if (!pack.version) {
            errors.push({ field: 'version', message: 'Pack version is required', severity: 'error' });
        }
        if (!pack.rules || pack.rules.length === 0) {
            errors.push({ field: 'rules', message: 'Pack must contain at least one rule', severity: 'error' });
        }
        // Validate each rule
        if (pack.rules) {
            const ruleIds = new Set();
            for (let i = 0; i < pack.rules.length; i++) {
                const rule = pack.rules[i];
                const ruleValidation = this.validate(rule);
                // Check for duplicate IDs
                if (ruleIds.has(rule.id)) {
                    errors.push({
                        field: `rules[${i}].id`,
                        message: `Duplicate rule ID: ${rule.id}`,
                        severity: 'error',
                    });
                }
                ruleIds.add(rule.id);
                // Add rule errors with context
                for (const error of ruleValidation.errors) {
                    errors.push({
                        field: `rules[${i}].${error.field}`,
                        message: error.message,
                        severity: error.severity,
                    });
                }
                for (const warning of ruleValidation.warnings) {
                    warnings.push({
                        field: `rules[${i}].${warning.field}`,
                        message: warning.message,
                    });
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
}
/**
 * Rule compiler - compiles rules to executable form
 */
class RuleCompiler {
    constructor() {
        Object.defineProperty(this, "compiledPatterns", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    compile(rule) {
        const patterns = [];
        for (const pattern of rule.patterns) {
            if (pattern.type === PatternType.REGEX) {
                try {
                    const flags = pattern.multiline ? `${pattern.flags || ''}m` : pattern.flags || '';
                    patterns.push(new RegExp(pattern.value, flags + 'g'));
                }
                catch {
                    // Invalid pattern - skip
                }
            }
        }
        this.compiledPatterns.set(rule.id, patterns);
    }
    getCompiledPatterns(ruleId) {
        return this.compiledPatterns.get(ruleId) || [];
    }
    clearCache() {
        this.compiledPatterns.clear();
    }
}
/**
 * Rule matcher - executes rules against code
 */
class RuleMatcher {
    constructor(compiler) {
        Object.defineProperty(this, "compiler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.compiler = compiler;
    }
    match(rule, code, filename) {
        const matches = [];
        const lines = code.split('\n');
        const patterns = this.compiler.getCompiledPatterns(rule.id);
        // Check language applicability
        const fileExt = filename.split('.').pop()?.toLowerCase();
        const languageMap = {
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
        };
        const fileLanguages = languageMap[fileExt || ''] || [];
        const isApplicable = rule.languages.includes('*') ||
            rule.languages.some(lang => fileLanguages.includes(lang.toLowerCase()));
        if (!isApplicable) {
            return matches;
        }
        // Match each pattern
        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const matchText = match[0];
                const beforeMatch = code.substring(0, match.index);
                const lineNumber = beforeMatch.split('\n').length;
                const lastNewline = beforeMatch.lastIndexOf('\n');
                const column = match.index - lastNewline - 1;
                // Calculate end position
                const matchLines = matchText.split('\n');
                const endLine = lineNumber + matchLines.length - 1;
                const endColumn = matchLines.length > 1
                    ? matchLines[matchLines.length - 1].length
                    : column + matchText.length;
                // Get code snippet
                const snippetStart = Math.max(0, lineNumber - 2);
                const snippetEnd = Math.min(lines.length, endLine + 2);
                const codeSnippet = lines.slice(snippetStart, snippetEnd).join('\n');
                // Build message with placeholders
                let message = rule.message.default;
                if (rule.message.placeholders) {
                    for (const [key, value] of Object.entries(rule.message.placeholders)) {
                        message = message.replace(`{{${key}}}`, value);
                    }
                }
                // Replace capture groups
                for (let i = 0; i < match.length; i++) {
                    message = message.replace(`{{$${i}}}`, match[i] || '');
                }
                // Find applicable fix
                const fix = rule.fixes?.find(f => f.confidence >= 0.7);
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
                });
            }
        }
        return matches;
    }
}
/**
 * Rule tester - runs test cases against rules
 */
class RuleTester {
    constructor(matcher) {
        Object.defineProperty(this, "matcher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.matcher = matcher;
    }
    runTests(rule) {
        if (!rule.testCases || rule.testCases.length === 0) {
            return [];
        }
        const results = [];
        for (const testCase of rule.testCases) {
            const startTime = performance.now();
            try {
                const matches = this.matcher.match(rule, testCase.code, `test.${testCase.language}`);
                const passed = testCase.shouldMatch
                    ? matches.length > 0
                    : matches.length === 0;
                // Additional checks
                let additionalChecks = true;
                if (passed && testCase.shouldMatch) {
                    if (testCase.expectedMatches !== undefined && matches.length !== testCase.expectedMatches) {
                        additionalChecks = false;
                    }
                    if (testCase.expectedLine !== undefined && !matches.some(m => m.line === testCase.expectedLine)) {
                        additionalChecks = false;
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
                });
            }
            catch (error) {
                results.push({
                    passed: false,
                    testCase,
                    matches: [],
                    error: error.message,
                    duration: performance.now() - startTime,
                });
            }
        }
        return results;
    }
}
/**
 * Custom Rule Engine
 *
 * Main engine for managing and executing custom rules.
 */
class CustomRuleEngine extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rules", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "packs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "validator", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "compiler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "matcher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tester", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
        this.validator = new RuleValidator();
        this.compiler = new RuleCompiler();
        this.matcher = new RuleMatcher(this.compiler);
        this.tester = new RuleTester(this.matcher);
    }
    /**
     * Add a single rule
     */
    addRule(rule) {
        const validation = this.validator.validate(rule);
        if (validation.valid || !this.config.strictMode) {
            // Check deprecated rules
            if (rule.deprecated && !this.config.allowDeprecated) {
                validation.errors.push({
                    field: 'deprecated',
                    message: `Rule ${rule.id} is deprecated: ${rule.deprecationMessage}`,
                    severity: 'warning',
                });
                return validation;
            }
            this.rules.set(rule.id, rule);
            this.compiler.compile(rule);
            this.emit('rule-added', { ruleId: rule.id });
        }
        return validation;
    }
    /**
     * Add a rule pack
     */
    addRulePack(pack) {
        const validation = this.validator.validatePack(pack);
        if (validation.valid || !this.config.strictMode) {
            this.packs.set(pack.id, pack);
            for (const rule of pack.rules) {
                if (!rule.deprecated || this.config.allowDeprecated) {
                    this.rules.set(rule.id, rule);
                    this.compiler.compile(rule);
                }
            }
            this.emit('pack-added', { packId: pack.id, rulesCount: pack.rules.length });
        }
        return validation;
    }
    /**
     * Remove a rule
     */
    removeRule(ruleId) {
        const removed = this.rules.delete(ruleId);
        if (removed) {
            this.emit('rule-removed', { ruleId });
        }
        return removed;
    }
    /**
     * Remove a rule pack
     */
    removeRulePack(packId) {
        const pack = this.packs.get(packId);
        if (!pack)
            return false;
        for (const rule of pack.rules) {
            this.rules.delete(rule.id);
        }
        this.packs.delete(packId);
        this.emit('pack-removed', { packId });
        return true;
    }
    /**
     * Get a rule by ID
     */
    getRule(ruleId) {
        return this.rules.get(ruleId);
    }
    /**
     * Get all rules
     */
    getRules() {
        return Array.from(this.rules.values());
    }
    /**
     * Get enabled rules
     */
    getEnabledRules() {
        return Array.from(this.rules.values()).filter(r => r.enabled);
    }
    /**
     * Get rules by category
     */
    getRulesByCategory(category) {
        return Array.from(this.rules.values()).filter(r => r.category === category);
    }
    /**
     * Get rules by language
     */
    getRulesByLanguage(language) {
        return Array.from(this.rules.values()).filter(r => r.languages.includes('*') || r.languages.includes(language));
    }
    /**
     * Enable/disable a rule
     */
    setRuleEnabled(ruleId, enabled) {
        const rule = this.rules.get(ruleId);
        if (rule) {
            rule.enabled = enabled;
            this.emit('rule-toggled', { ruleId, enabled });
            return true;
        }
        return false;
    }
    /**
     * Execute rules against code
     */
    execute(code, filename, options) {
        const startTime = performance.now();
        const allMatches = [];
        // Get applicable rules
        let rules = this.getEnabledRules();
        if (options?.ruleIds) {
            rules = rules.filter(r => options.ruleIds.includes(r.id));
        }
        if (options?.categories) {
            rules = rules.filter(r => options.categories.includes(r.category));
        }
        if (options?.minSeverity) {
            const severityOrder = {
                [RuleSeverity.CRITICAL]: 0,
                [RuleSeverity.HIGH]: 1,
                [RuleSeverity.MEDIUM]: 2,
                [RuleSeverity.LOW]: 3,
                [RuleSeverity.INFO]: 4,
            };
            const minOrder = severityOrder[options.minSeverity];
            rules = rules.filter(r => severityOrder[r.severity] <= minOrder);
        }
        // Execute rules
        for (const rule of rules) {
            const matches = this.matcher.match(rule, code, filename);
            allMatches.push(...matches);
            if (options?.maxMatches && allMatches.length >= options.maxMatches) {
                break;
            }
        }
        // Sort by severity
        allMatches.sort((a, b) => {
            const order = {
                [RuleSeverity.CRITICAL]: 0,
                [RuleSeverity.HIGH]: 1,
                [RuleSeverity.MEDIUM]: 2,
                [RuleSeverity.LOW]: 3,
                [RuleSeverity.INFO]: 4,
            };
            return order[a.severity] - order[b.severity];
        });
        this.emit('execution-complete', {
            rulesExecuted: rules.length,
            matchesFound: allMatches.length,
            duration: performance.now() - startTime,
        });
        return allMatches;
    }
    /**
     * Validate a rule
     */
    validateRule(rule) {
        return this.validator.validate(rule);
    }
    /**
     * Test a rule
     */
    testRule(ruleId) {
        const rule = this.rules.get(ruleId);
        if (!rule) {
            throw new Error(`Rule not found: ${ruleId}`);
        }
        return this.tester.runTests(rule);
    }
    /**
     * Test all rules in a pack
     */
    testPack(packId) {
        const pack = this.packs.get(packId);
        if (!pack) {
            throw new Error(`Pack not found: ${packId}`);
        }
        const results = new Map();
        for (const rule of pack.rules) {
            results.set(rule.id, this.tester.runTests(rule));
        }
        return results;
    }
    /**
     * Export rules to JSON
     */
    exportRules(ruleIds) {
        const rules = ruleIds
            ? Array.from(this.rules.values()).filter(r => ruleIds.includes(r.id))
            : Array.from(this.rules.values());
        return JSON.stringify({
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            rules,
        }, null, 2);
    }
    /**
     * Import rules from JSON
     */
    importRules(json) {
        const data = JSON.parse(json);
        const errors = [];
        let imported = 0;
        if (!data.rules || !Array.isArray(data.rules)) {
            return { imported: 0, errors: ['Invalid JSON format: missing rules array'] };
        }
        for (const rule of data.rules) {
            const validation = this.addRule(rule);
            if (validation.valid) {
                imported++;
            }
            else {
                errors.push(`Rule ${rule.id}: ${validation.errors.map(e => e.message).join(', ')}`);
            }
        }
        return { imported, errors };
    }
    /**
     * Get statistics
     */
    getStatistics() {
        const rules = Array.from(this.rules.values());
        const byCategory = {};
        const bySeverity = {};
        const byLanguage = {};
        for (const rule of rules) {
            byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
            bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
            for (const lang of rule.languages) {
                byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            }
        }
        return {
            totalRules: rules.length,
            enabledRules: rules.filter(r => r.enabled).length,
            byCategory,
            bySeverity,
            byLanguage,
            packsLoaded: this.packs.size,
        };
    }
    /**
     * Clear all rules
     */
    clear() {
        this.rules.clear();
        this.packs.clear();
        this.compiler.clearCache();
        this.emit('cleared');
    }
}
exports.CustomRuleEngine = CustomRuleEngine;
/**
 * Create a custom rule engine instance
 */
function createCustomRuleEngine(config) {
    return new CustomRuleEngine(config);
}
/**
 * Singleton instance
 */
let customRuleEngine = null;
function getCustomRuleEngine(config) {
    if (!customRuleEngine) {
        customRuleEngine = new CustomRuleEngine(config);
    }
    return customRuleEngine;
}
/**
 * Create a rule from JSON definition
 */
function createRuleFromJSON(json) {
    return JSON.parse(json);
}
/**
 * Create a rule pack from JSON definition
 */
function createRulePackFromJSON(json) {
    return JSON.parse(json);
}
//# sourceMappingURL=custom-rules.js.map