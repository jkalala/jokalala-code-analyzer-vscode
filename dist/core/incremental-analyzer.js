"use strict";
/**
 * Incremental Analysis Engine
 *
 * High-performance incremental analysis that only processes changed code regions.
 * Uses diff-based detection and AST-aware change tracking for minimal reanalysis.
 *
 * Performance targets:
 * - Sub-100ms analysis for single-line changes
 * - Intelligent scope detection (function/class/module level)
 * - Memory-efficient change tracking with LRU eviction
 * - Support for real-time typing analysis with debouncing
 *
 * @module core/incremental-analyzer
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncrementalAnalyzer = void 0;
exports.getIncrementalAnalyzer = getIncrementalAnalyzer;
const crypto = __importStar(require("crypto"));
const events_1 = require("events");
const DEFAULT_CONFIG = {
    maxCachedDocuments: 100,
    maxScopeSize: 500,
    debounceDelay: 300,
    scopeExpansionLines: 5,
    enableDependencyTracking: true,
    enableCrossFileAnalysis: true,
    minConfidenceThreshold: 0.7,
    analysisTimeout: 30000,
};
/**
 * Scope detector for different languages
 */
class ScopeDetector {
    constructor() {
        Object.defineProperty(this, "scopePatterns", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map([
                ['javascript', [
                        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
                        /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/,
                        /^(?:export\s+)?class\s+(\w+)/,
                        /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*class/,
                    ]],
                ['typescript', [
                        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
                        /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/,
                        /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
                        /^(?:export\s+)?interface\s+(\w+)/,
                        /^(?:export\s+)?type\s+(\w+)/,
                        /^(?:export\s+)?enum\s+(\w+)/,
                    ]],
                ['python', [
                        /^def\s+(\w+)\s*\(/,
                        /^async\s+def\s+(\w+)\s*\(/,
                        /^class\s+(\w+)/,
                    ]],
                ['java', [
                        /^(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(?:synchronized)?\s*(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/,
                        /^(?:public|private|protected)?\s*(?:abstract)?\s*(?:final)?\s*class\s+(\w+)/,
                        /^(?:public|private|protected)?\s*interface\s+(\w+)/,
                        /^(?:public|private|protected)?\s*enum\s+(\w+)/,
                    ]],
                ['go', [
                        /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/,
                        /^type\s+(\w+)\s+struct/,
                        /^type\s+(\w+)\s+interface/,
                    ]],
                ['rust', [
                        /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
                        /^(?:pub\s+)?struct\s+(\w+)/,
                        /^(?:pub\s+)?enum\s+(\w+)/,
                        /^(?:pub\s+)?trait\s+(\w+)/,
                        /^impl(?:<[^>]+>)?\s+(?:\w+(?:<[^>]+>)?\s+for\s+)?(\w+)/,
                    ]],
                ['csharp', [
                        /^(?:public|private|protected|internal)?\s*(?:static)?\s*(?:async)?\s*(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/,
                        /^(?:public|private|protected|internal)?\s*(?:abstract)?\s*(?:sealed)?\s*(?:partial)?\s*class\s+(\w+)/,
                        /^(?:public|private|protected|internal)?\s*interface\s+(\w+)/,
                        /^(?:public|private|protected|internal)?\s*enum\s+(\w+)/,
                    ]],
            ])
        });
    }
    /**
     * Detect scopes in a document
     */
    detectScopes(content, language) {
        const lines = content.split('\n');
        const scopes = [];
        const patterns = this.scopePatterns.get(language) ||
            this.scopePatterns.get('javascript') || [];
        const scopeStack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            // Track brace depth for scope detection
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            // Check for scope start
            for (const pattern of patterns) {
                const match = trimmedLine.match(pattern);
                if (match) {
                    const scopeType = this.determineScopeType(trimmedLine, language);
                    scopeStack.push({
                        type: scopeType,
                        name: match[1] || 'anonymous',
                        startLine: i,
                        braceCount: openBraces,
                    });
                    break;
                }
            }
            // Update brace counts and close scopes
            if (scopeStack.length > 0) {
                const currentScope = scopeStack[scopeStack.length - 1];
                currentScope.braceCount += openBraces - closeBraces;
                // Scope closed
                if (currentScope.braceCount <= 0 || this.isScopeEnd(trimmedLine, language)) {
                    const closedScope = scopeStack.pop();
                    const scopeContent = lines.slice(closedScope.startLine, i + 1).join('\n');
                    scopes.push({
                        type: closedScope.type,
                        name: closedScope.name,
                        startLine: closedScope.startLine,
                        endLine: i,
                        language,
                        hash: this.hashContent(scopeContent),
                        dependencies: this.extractDependencies(scopeContent, language),
                        exports: this.extractExports(scopeContent, language),
                    });
                }
            }
        }
        // Handle unclosed scopes (typically at file level)
        while (scopeStack.length > 0) {
            const unclosedScope = scopeStack.pop();
            const scopeContent = lines.slice(unclosedScope.startLine).join('\n');
            scopes.push({
                type: unclosedScope.type,
                name: unclosedScope.name,
                startLine: unclosedScope.startLine,
                endLine: lines.length - 1,
                language,
                hash: this.hashContent(scopeContent),
                dependencies: this.extractDependencies(scopeContent, language),
                exports: this.extractExports(scopeContent, language),
            });
        }
        // Add file-level scope if no scopes detected
        if (scopes.length === 0) {
            scopes.push({
                type: 'file',
                name: 'module',
                startLine: 0,
                endLine: lines.length - 1,
                language,
                hash: this.hashContent(content),
                dependencies: this.extractDependencies(content, language),
                exports: this.extractExports(content, language),
            });
        }
        return scopes;
    }
    determineScopeType(line, _language) {
        if (/class\s+/.test(line))
            return 'class';
        if (/interface\s+/.test(line))
            return 'class';
        if (/struct\s+/.test(line))
            return 'class';
        if (/enum\s+/.test(line))
            return 'class';
        if (/function\s+|def\s+|fn\s+|func\s+/.test(line))
            return 'function';
        if (/=>\s*{/.test(line))
            return 'function';
        return 'block';
    }
    isScopeEnd(line, language) {
        // Python uses indentation
        if (language === 'python') {
            return /^[^\s]/.test(line) && line.trim() !== '';
        }
        return false;
    }
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    extractDependencies(content, language) {
        const deps = [];
        const patterns = {
            javascript: [
                /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
                /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            ],
            typescript: [
                /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
                /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            ],
            python: [
                /from\s+(\S+)\s+import/g,
                /import\s+(\S+)/g,
            ],
            java: [
                /import\s+([^;]+);/g,
            ],
            go: [
                /import\s+(?:\(\s*)?["']([^"']+)["']/g,
            ],
        };
        const langPatterns = patterns[language] || [];
        for (const pattern of langPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                deps.push(match[1]);
            }
        }
        return [...new Set(deps)];
    }
    extractExports(content, language) {
        const exports = [];
        const patterns = {
            javascript: [
                /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
                /export\s+{\s*([^}]+)\s*}/g,
                /module\.exports\s*=\s*(\w+)/g,
            ],
            typescript: [
                /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
                /export\s+{\s*([^}]+)\s*}/g,
            ],
            python: [
                /__all__\s*=\s*\[([^\]]+)\]/g,
            ],
        };
        const langPatterns = patterns[language] || [];
        for (const pattern of langPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const exported = match[1];
                if (exported.includes(',')) {
                    exports.push(...exported.split(',').map(e => e.trim()));
                }
                else {
                    exports.push(exported.trim());
                }
            }
        }
        return [...new Set(exports)];
    }
}
/**
 * Change detector for tracking document modifications
 */
class ChangeDetector {
    /**
     * Detect changes between two versions of content
     */
    detectChanges(oldContent, newContent) {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const changes = [];
        // Use a simple line-based diff algorithm
        const lcs = this.computeLCS(oldLines, newLines);
        let oldIndex = 0;
        let newIndex = 0;
        let lcsIndex = 0;
        while (oldIndex < oldLines.length || newIndex < newLines.length) {
            if (lcsIndex < lcs.length && oldIndex < oldLines.length && oldLines[oldIndex] === lcs[lcsIndex]) {
                // Line unchanged
                if (newIndex < newLines.length && newLines[newIndex] === lcs[lcsIndex]) {
                    oldIndex++;
                    newIndex++;
                    lcsIndex++;
                }
                else {
                    // Insertion
                    changes.push({
                        startLine: newIndex,
                        endLine: newIndex,
                        startColumn: 0,
                        endColumn: newLines[newIndex]?.length || 0,
                        type: 'insert',
                        content: newLines[newIndex] || '',
                    });
                    newIndex++;
                }
            }
            else if (newIndex < newLines.length && lcsIndex < lcs.length && newLines[newIndex] === lcs[lcsIndex]) {
                // Deletion
                changes.push({
                    startLine: oldIndex,
                    endLine: oldIndex,
                    startColumn: 0,
                    endColumn: oldLines[oldIndex]?.length || 0,
                    type: 'delete',
                    content: '',
                    previousContent: oldLines[oldIndex],
                });
                oldIndex++;
            }
            else {
                // Replacement
                if (oldIndex < oldLines.length && newIndex < newLines.length) {
                    changes.push({
                        startLine: newIndex,
                        endLine: newIndex,
                        startColumn: 0,
                        endColumn: newLines[newIndex]?.length || 0,
                        type: 'replace',
                        content: newLines[newIndex] || '',
                        previousContent: oldLines[oldIndex],
                    });
                    oldIndex++;
                    newIndex++;
                }
                else if (oldIndex < oldLines.length) {
                    changes.push({
                        startLine: oldIndex,
                        endLine: oldIndex,
                        startColumn: 0,
                        endColumn: oldLines[oldIndex]?.length || 0,
                        type: 'delete',
                        content: '',
                        previousContent: oldLines[oldIndex],
                    });
                    oldIndex++;
                }
                else if (newIndex < newLines.length) {
                    changes.push({
                        startLine: newIndex,
                        endLine: newIndex,
                        startColumn: 0,
                        endColumn: newLines[newIndex]?.length || 0,
                        type: 'insert',
                        content: newLines[newIndex] || '',
                    });
                    newIndex++;
                }
            }
        }
        return this.mergeAdjacentChanges(changes);
    }
    /**
     * Compute Longest Common Subsequence
     */
    computeLCS(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                }
                else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        // Backtrack to find LCS
        const lcs = [];
        let i = m, j = n;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                lcs.unshift(a[i - 1]);
                i--;
                j--;
            }
            else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            }
            else {
                j--;
            }
        }
        return lcs;
    }
    /**
     * Merge adjacent change regions for efficiency
     */
    mergeAdjacentChanges(changes) {
        if (changes.length <= 1)
            return changes;
        const merged = [];
        let current = changes[0];
        for (let i = 1; i < changes.length; i++) {
            const next = changes[i];
            // Merge if adjacent and same type
            if (next.startLine <= current.endLine + 1 && next.type === current.type) {
                current = {
                    ...current,
                    endLine: Math.max(current.endLine, next.endLine),
                    endColumn: next.endColumn,
                    content: current.content + '\n' + next.content,
                    previousContent: current.previousContent
                        ? current.previousContent + '\n' + (next.previousContent || '')
                        : next.previousContent,
                };
            }
            else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }
}
/**
 * LRU Cache for document states
 */
class DocumentCache {
    constructor(maxSize) {
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "maxSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.maxSize = maxSize;
    }
    get(uri) {
        const state = this.cache.get(uri);
        if (state) {
            // Move to end (most recently used)
            this.cache.delete(uri);
            this.cache.set(uri, state);
        }
        return state;
    }
    set(uri, state) {
        // Remove if exists
        this.cache.delete(uri);
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(uri, state);
    }
    delete(uri) {
        return this.cache.delete(uri);
    }
    clear() {
        this.cache.clear();
    }
    getAll() {
        return Array.from(this.cache.values());
    }
    size() {
        return this.cache.size;
    }
}
/**
 * Incremental Analyzer - Enterprise-grade incremental analysis engine
 *
 * Features:
 * - AST-aware scope detection
 * - Intelligent change region expansion
 * - Dependency-aware analysis
 * - Memory-efficient LRU caching
 * - Real-time typing support
 */
class IncrementalAnalyzer extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "documentCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "scopeDetector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "changeDetector", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "debounceTimers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "analysisCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.documentCache = new DocumentCache(this.config.maxCachedDocuments);
        this.scopeDetector = new ScopeDetector();
        this.changeDetector = new ChangeDetector();
        this.analysisCallbacks = new Map();
    }
    /**
     * Register an analyzer callback for a language
     */
    registerAnalyzer(language, callback) {
        this.analysisCallbacks.set(language, callback);
    }
    /**
     * Analyze a document incrementally
     */
    async analyze(uri, content, language, version) {
        const startTime = performance.now();
        const hash = this.hashContent(content);
        // Get previous state
        const previousState = this.documentCache.get(uri);
        // Detect scopes
        const scopes = this.scopeDetector.detectScopes(content, language);
        // Determine what needs analysis
        let scopesToAnalyze;
        let scopesToSkip;
        if (!previousState || previousState.hash !== hash) {
            // Content changed - determine affected scopes
            if (previousState) {
                const changes = this.changeDetector.detectChanges(previousState.scopes.map(s => content.substring(s.startLine, s.endLine)).join('\n'), content);
                const result = this.determineAffectedScopes(scopes, previousState.scopes, changes);
                scopesToAnalyze = result.affected;
                scopesToSkip = result.unchanged;
            }
            else {
                // New document - analyze everything
                scopesToAnalyze = scopes;
                scopesToSkip = [];
            }
        }
        else {
            // No changes
            scopesToAnalyze = [];
            scopesToSkip = scopes;
        }
        // Perform analysis on affected scopes
        const newIssues = [];
        const analyzer = this.analysisCallbacks.get(language);
        if (analyzer && scopesToAnalyze.length > 0) {
            for (const scope of scopesToAnalyze) {
                const scopeContent = this.extractScopeContent(content, scope);
                try {
                    const issues = await analyzer(scopeContent, [scope]);
                    scope.issues = issues;
                    scope.lastAnalyzed = Date.now();
                    newIssues.push(...issues);
                }
                catch (error) {
                    this.emit('analysis-error', { uri, scope: scope.name, error });
                }
            }
        }
        // Collect unchanged issues
        const unchangedIssues = [];
        for (const scope of scopesToSkip) {
            const previousScope = previousState?.scopes.find(s => s.name === scope.name && s.startLine === scope.startLine);
            if (previousScope?.issues) {
                unchangedIssues.push(...previousScope.issues);
                scope.issues = previousScope.issues;
                scope.lastAnalyzed = previousScope.lastAnalyzed;
            }
        }
        // Determine resolved issues
        const resolvedIssues = this.findResolvedIssues(previousState?.scopes.flatMap(s => s.issues || []) || [], [...newIssues, ...unchangedIssues]);
        // Update document state
        const newState = {
            uri,
            version,
            hash,
            language,
            lineCount: content.split('\n').length,
            lastModified: Date.now(),
            lastAnalyzed: Date.now(),
            scopes,
            pendingChanges: [],
        };
        this.documentCache.set(uri, newState);
        const analysisTime = performance.now() - startTime;
        const totalLines = content.split('\n').length;
        const analyzedLines = scopesToAnalyze.reduce((sum, s) => sum + (s.endLine - s.startLine + 1), 0);
        const result = {
            uri,
            version,
            analyzedScopes: scopesToAnalyze,
            skippedScopes: scopesToSkip,
            newIssues,
            resolvedIssues,
            unchangedIssues,
            analysisTime,
            coverage: {
                linesAnalyzed: analyzedLines,
                linesSkipped: totalLines - analyzedLines,
                percentAnalyzed: totalLines > 0 ? (analyzedLines / totalLines) * 100 : 0,
            },
        };
        this.emit('analysis-complete', result);
        return result;
    }
    /**
     * Analyze with debouncing for real-time typing
     */
    analyzeDebounced(uri, content, language, version) {
        return new Promise((resolve, reject) => {
            // Cancel existing timer
            const existingTimer = this.debounceTimers.get(uri);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
            // Set new timer
            const timer = setTimeout(async () => {
                this.debounceTimers.delete(uri);
                try {
                    const result = await this.analyze(uri, content, language, version);
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            }, this.config.debounceDelay);
            this.debounceTimers.set(uri, timer);
        });
    }
    /**
     * Force full analysis of a document
     */
    async analyzeFullDocument(uri, content, language, version) {
        // Clear cached state to force full analysis
        this.documentCache.delete(uri);
        return this.analyze(uri, content, language, version);
    }
    /**
     * Get cached analysis for a document
     */
    getCachedAnalysis(uri) {
        return this.documentCache.get(uri);
    }
    /**
     * Invalidate cache for a document
     */
    invalidateCache(uri) {
        this.documentCache.delete(uri);
        this.emit('cache-invalidated', { uri });
    }
    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.documentCache.clear();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.emit('all-caches-cleared');
    }
    /**
     * Get analysis statistics
     */
    getStatistics() {
        return {
            cachedDocuments: this.documentCache.size(),
            pendingAnalyses: this.debounceTimers.size,
        };
    }
    // Private methods
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    determineAffectedScopes(newScopes, previousScopes, changes) {
        const affected = [];
        const unchanged = [];
        for (const scope of newScopes) {
            // Check if scope was modified
            const isAffected = changes.some(change => this.doRangesOverlap(change.startLine - this.config.scopeExpansionLines, change.endLine + this.config.scopeExpansionLines, scope.startLine, scope.endLine));
            // Check if scope hash changed
            const previousScope = previousScopes.find(s => s.name === scope.name && Math.abs(s.startLine - scope.startLine) < 5);
            const hashChanged = !previousScope || previousScope.hash !== scope.hash;
            if (isAffected || hashChanged) {
                affected.push(scope);
            }
            else {
                // Carry over previous analysis results
                if (previousScope) {
                    scope.issues = previousScope.issues;
                    scope.lastAnalyzed = previousScope.lastAnalyzed;
                }
                unchanged.push(scope);
            }
        }
        // Check for dependency changes if enabled
        if (this.config.enableDependencyTracking) {
            const affectedNames = new Set(affected.map(s => s.name));
            for (const scope of unchanged) {
                const hasDependencyChange = scope.dependencies.some(dep => affectedNames.has(dep));
                if (hasDependencyChange) {
                    // Move from unchanged to affected
                    const index = unchanged.indexOf(scope);
                    unchanged.splice(index, 1);
                    affected.push(scope);
                }
            }
        }
        return { affected, unchanged };
    }
    doRangesOverlap(start1, end1, start2, end2) {
        return start1 <= end2 && end1 >= start2;
    }
    extractScopeContent(content, scope) {
        const lines = content.split('\n');
        return lines.slice(scope.startLine, scope.endLine + 1).join('\n');
    }
    findResolvedIssues(previousIssues, currentIssues) {
        // Simple comparison - in production, use proper issue fingerprinting
        const currentSet = new Set(currentIssues.map(i => JSON.stringify(i)));
        return previousIssues.filter(i => !currentSet.has(JSON.stringify(i)));
    }
}
exports.IncrementalAnalyzer = IncrementalAnalyzer;
/**
 * Singleton instance
 */
let incrementalAnalyzer = null;
function getIncrementalAnalyzer(config) {
    if (!incrementalAnalyzer) {
        incrementalAnalyzer = new IncrementalAnalyzer(config);
    }
    return incrementalAnalyzer;
}
//# sourceMappingURL=incremental-analyzer.js.map