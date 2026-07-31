"use strict";
/**
 * Offline Analysis Engine
 *
 * Thin wrapper around LocalDeterministicEngine (shared versioned packs + JS/TS AST).
 * Preserves the public API used by fail-open and hybrid Tier-1 paths.
 *
 * @module core/offline-analyzer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineAnalyzer = exports.Severity = void 0;
exports.getOfflineAnalyzer = getOfflineAnalyzer;
const events_1 = require("events");
const local_deterministic_engine_1 = require("./local-deterministic-engine");
const security_types_1 = require("./security-types");
Object.defineProperty(exports, "Severity", { enumerable: true, get: function () { return security_types_1.Severity; } });
/**
 * Offline Security Analyzer — delegates to LocalDeterministicEngine (Tier 1).
 */
class OfflineAnalyzer extends events_1.EventEmitter {
    constructor() {
        super();
        Object.defineProperty(this, "engine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.engine = (0, local_deterministic_engine_1.getLocalDeterministicEngine)();
    }
    initialize() {
        if (this.isInitialized)
            return;
        this.isInitialized = true;
        this.emit('initialized', {
            packs: this.engine.getPackVersions(),
        });
    }
    /** @deprecated Custom hardcoded rules superseded by shared packs */
    addRules(_rules) {
        this.emit('rules-added', { count: 0, note: 'use shared rule packs' });
    }
    analyze(code, language, options = {}) {
        if (!this.isInitialized) {
            this.initialize();
        }
        return this.engine.analyze(code, language, options);
    }
    getRules() {
        return [];
    }
    getRule(_id) {
        return undefined;
    }
    setRuleEnabled(_id, _enabled) {
        /* packs are versioned; enable/disable via options.disabledRules */
    }
    getSupportedLanguages() {
        return [
            'javascript',
            'typescript',
            'python',
            'java',
            'go',
            'ruby',
            'php',
            'csharp',
        ];
    }
    getCategories() {
        return [
            'injection',
            'xss',
            'data_exposure',
            'credentials',
            'cryptography',
            'configuration',
        ];
    }
}
exports.OfflineAnalyzer = OfflineAnalyzer;
let offlineAnalyzer = null;
function getOfflineAnalyzer() {
    if (!offlineAnalyzer) {
        offlineAnalyzer = new OfflineAnalyzer();
        offlineAnalyzer.initialize();
    }
    return offlineAnalyzer;
}
//# sourceMappingURL=offline-analyzer.js.map