"use strict";
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
exports.ConfigurationService = void 0;
const vscode = __importStar(require("vscode"));
// Configuration schema for validation
const CONFIGURATION_SCHEMA = {
    apiEndpoint: {
        type: 'string',
        default: 'http://localhost:3000/api/agents/dev-assistant',
        description: 'API endpoint for code analysis service',
        required: true,
    },
    apiKey: {
        type: 'string',
        default: '',
        description: 'API key for authentication (deprecated - use SecretStorage)',
        required: false,
    },
    analysisMode: {
        type: 'string',
        default: 'full',
        description: 'Analysis mode: quick, deep, or full',
        enum: ['quick', 'deep', 'full'],
        required: true,
    },
    autoAnalyze: {
        type: 'boolean',
        default: false,
        description: 'Automatically analyze files on save',
        required: true,
    },
    showInlineWarnings: {
        type: 'boolean',
        default: true,
        description: 'Show inline warnings in editor',
        required: true,
    },
    enableDiagnostics: {
        type: 'boolean',
        default: true,
        description: 'Enable diagnostics integration',
        required: true,
    },
    maxFileSize: {
        type: 'number',
        default: 50000,
        description: 'Maximum file size for analysis (characters)',
        minimum: 1000,
        maximum: 500000,
        required: true,
    },
    maxProjectFiles: {
        type: 'number',
        default: 40,
        description: 'Maximum number of files to analyze in project',
        minimum: 1,
        maximum: 200,
        required: true,
    },
    maxProjectFileSize: {
        type: 'number',
        default: 120000,
        description: 'Maximum file size for project analysis (characters)',
        minimum: 1000,
        maximum: 1000000,
        required: true,
    },
    requestTimeout: {
        type: 'number',
        default: 60000,
        description: 'Request timeout in milliseconds',
        minimum: 5000,
        maximum: 300000,
        required: true,
    },
    enableTelemetry: {
        type: 'boolean',
        default: true,
        description: 'Enable anonymous telemetry collection',
        required: true,
    },
    cacheEnabled: {
        type: 'boolean',
        default: true,
        description: 'Enable result caching',
        required: false,
    },
    cacheTTL: {
        type: 'number',
        default: 1800000, // 30 minutes
        description: 'Cache time-to-live in milliseconds',
        minimum: 60000, // 1 minute
        maximum: 86400000, // 24 hours
        required: false,
    },
    maxCacheSize: {
        type: 'number',
        default: 104857600, // 100 MB
        description: 'Maximum cache size in bytes',
        minimum: 10485760, // 10 MB
        maximum: 1073741824, // 1 GB
        required: false,
    },
    retryEnabled: {
        type: 'boolean',
        default: true,
        description: 'Enable request retry logic',
        required: false,
    },
    maxRetries: {
        type: 'number',
        default: 3,
        description: 'Maximum number of retry attempts',
        minimum: 0,
        maximum: 10,
        required: false,
    },
    retryDelay: {
        type: 'number',
        default: 1000,
        description: 'Initial retry delay in milliseconds',
        minimum: 100,
        maximum: 10000,
        required: false,
    },
    logLevel: {
        type: 'string',
        default: 'info',
        description: 'Logging level',
        enum: ['debug', 'info', 'warn', 'error'],
        required: false,
    },
    circuitBreakerEnabled: {
        type: 'boolean',
        default: true,
        description: 'Enable circuit breaker pattern',
        required: false,
    },
    circuitBreakerThreshold: {
        type: 'number',
        default: 5,
        description: 'Circuit breaker failure threshold',
        minimum: 1,
        maximum: 20,
        required: false,
    },
};
// Helper functions removed - not currently used
// Can be re-added if needed in the future
// Create default settings from schema (not used but kept for reference)
// const DEFAULT_SETTINGS: ExtensionSettings = {
//   apiEndpoint: getSchemaDefault<string>('apiEndpoint'),
//   apiKey: getSchemaDefault<string>('apiKey'),
//   analysisMode: getSchemaDefault<AnalysisMode>('analysisMode'),
//   autoAnalyze: getSchemaDefault<boolean>('autoAnalyze'),
//   showInlineWarnings: getSchemaDefault<boolean>('showInlineWarnings'),
//   enableDiagnostics: getSchemaDefault<boolean>('enableDiagnostics'),
//   maxFileSize: getSchemaDefault<number>('maxFileSize'),
//   maxProjectFiles: getSchemaDefault<number>('maxProjectFiles'),
//   maxProjectFileSize: getSchemaDefault<number>('maxProjectFileSize'),
//   requestTimeout: getSchemaDefault<number>('requestTimeout'),
//   enableTelemetry: getSchemaDefault<boolean>('enableTelemetry'),
//   cacheEnabled: getOptionalSchemaDefault<boolean>('cacheEnabled'),
//   cacheTTL: getOptionalSchemaDefault<number>('cacheTTL'),
//   maxCacheSize: getOptionalSchemaDefault<number>('maxCacheSize'),
//   retryEnabled: getOptionalSchemaDefault<boolean>('retryEnabled'),
//   maxRetries: getOptionalSchemaDefault<number>('maxRetries'),
//   retryDelay: getOptionalSchemaDefault<number>('retryDelay'),
//   logLevel: getOptionalSchemaDefault<'debug' | 'info' | 'warn' | 'error'>('logLevel'),
//   circuitBreakerEnabled: getOptionalSchemaDefault<boolean>('circuitBreakerEnabled'),
//   circuitBreakerThreshold: getOptionalSchemaDefault<number>('circuitBreakerThreshold'),
// }
class ConfigurationService {
    constructor(section = 'jokalala') {
        Object.defineProperty(this, "section", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: section
        });
        Object.defineProperty(this, "settings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "changeListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "previousSettings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.settings = this.readSettings();
        this.previousSettings = { ...this.settings };
    }
    getSettings() {
        return { ...this.settings };
    }
    getSetting(key) {
        return this.settings[key];
    }
    validateConfiguration() {
        const errors = [];
        const warnings = [];
        // Validate each setting against schema
        for (const [key, schema] of Object.entries(CONFIGURATION_SCHEMA)) {
            const value = this.settings[key];
            // Check required fields
            if (schema.required &&
                (value === undefined || value === null || value === '')) {
                errors.push({
                    setting: key,
                    message: `${key} is required but not set`,
                    currentValue: value,
                    expectedType: schema.type,
                });
                continue;
            }
            // Skip validation for optional undefined values
            if (!schema.required && (value === undefined || value === null)) {
                continue;
            }
            // Type validation
            if (!this.validateType(value, schema.type)) {
                errors.push({
                    setting: key,
                    message: `${key} must be of type ${schema.type}`,
                    currentValue: value,
                    expectedType: schema.type,
                });
                continue;
            }
            // Enum validation
            if (schema.enum && !schema.enum.includes(value)) {
                errors.push({
                    setting: key,
                    message: `${key} must be one of: ${schema.enum.join(', ')}`,
                    currentValue: value,
                    allowedValues: schema.enum,
                });
                continue;
            }
            // Numeric bounds validation
            if (schema.type === 'number' && typeof value === 'number') {
                if (schema.minimum !== undefined && value < schema.minimum) {
                    errors.push({
                        setting: key,
                        message: `${key} must be at least ${schema.minimum} (current: ${value})`,
                        currentValue: value,
                        expectedType: schema.type,
                    });
                    continue;
                }
                if (schema.maximum !== undefined && value > schema.maximum) {
                    errors.push({
                        setting: key,
                        message: `${key} must be at most ${schema.maximum} (current: ${value})`,
                        currentValue: value,
                        expectedType: schema.type,
                    });
                    continue;
                }
            }
            // URL validation for apiEndpoint
            if (key === 'apiEndpoint' && typeof value === 'string') {
                try {
                    const url = new URL(value);
                    if (url.protocol !== 'https:') {
                        warnings.push({
                            setting: key,
                            message: 'API endpoint should use HTTPS for security',
                            currentValue: value,
                            suggestedValue: value.replace('http:', 'https:'),
                        });
                    }
                }
                catch (error) {
                    errors.push({
                        setting: key,
                        message: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        currentValue: value,
                    });
                }
            }
            // Deprecated apiKey warning
            if (key === 'apiKey' &&
                value &&
                typeof value === 'string' &&
                value.trim() !== '') {
                warnings.push({
                    setting: key,
                    message: 'Storing API key in settings is deprecated. Use SecretStorage instead.',
                    currentValue: '[REDACTED]',
                    suggestedValue: 'Move to SecretStorage',
                });
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    async migrateConfiguration(fromVersion) {
        // Migration logic for different versions
        const config = vscode.workspace.getConfiguration(this.section);
        // Example migration from version 1.x to 2.x
        if (fromVersion.startsWith('1.')) {
            // Migrate HTTP to HTTPS
            const apiEndpoint = config.get('apiEndpoint');
            if (apiEndpoint && apiEndpoint.startsWith('http:')) {
                await config.update('apiEndpoint', apiEndpoint.replace('http:', 'https:'), vscode.ConfigurationTarget.Global);
            }
            // Set new default values for new settings
            if (config.get('cacheEnabled') === undefined) {
                await config.update('cacheEnabled', true, vscode.ConfigurationTarget.Global);
            }
            if (config.get('retryEnabled') === undefined) {
                await config.update('retryEnabled', true, vscode.ConfigurationTarget.Global);
            }
        }
        // Refresh settings after migration
        this.refresh();
    }
    watch(callback) {
        this.changeListeners.push(callback);
        const disposable = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(this.section)) {
                const newSettings = this.readSettings();
                const changes = this.calculateChanges(this.previousSettings, newSettings);
                this.previousSettings = { ...this.settings };
                this.settings = newSettings;
                // Notify all listeners
                this.changeListeners.forEach(listener => {
                    try {
                        listener(changes);
                    }
                    catch (error) {
                        console.error('Error in configuration change listener:', error);
                    }
                });
            }
        });
        return {
            dispose: () => {
                const index = this.changeListeners.indexOf(callback);
                if (index >= 0) {
                    this.changeListeners.splice(index, 1);
                }
                disposable.dispose();
            },
        };
    }
    async resetToDefaults() {
        const config = vscode.workspace.getConfiguration(this.section);
        // Reset all settings to defaults
        for (const key of Object.keys(CONFIGURATION_SCHEMA)) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        this.refresh();
    }
    exportConfiguration() {
        const exportData = {
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            settings: { ...this.settings },
        };
        // Redact sensitive information
        if (exportData.settings.apiKey) {
            exportData.settings.apiKey = '[REDACTED]';
        }
        return JSON.stringify(exportData, null, 2);
    }
    async importConfiguration(configJson) {
        try {
            const importData = JSON.parse(configJson);
            if (!importData.settings) {
                throw new Error('Invalid configuration format: missing settings');
            }
            const config = vscode.workspace.getConfiguration(this.section);
            // Import each setting with validation
            for (const [key, value] of Object.entries(importData.settings)) {
                if (key === 'apiKey') {
                    // Skip API key import for security
                    continue;
                }
                if (CONFIGURATION_SCHEMA[key]) {
                    await config.update(key, value, vscode.ConfigurationTarget.Global);
                }
            }
            this.refresh();
        }
        catch (error) {
            throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    refresh() {
        this.settings = this.readSettings();
        return this.settings;
    }
    validateType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return (typeof value === 'object' && value !== null && !Array.isArray(value));
            default:
                return true;
        }
    }
    calculateChanges(previous, current) {
        const added = {};
        const modified = {};
        const removed = [];
        // Check for added and modified settings
        for (const key in current) {
            const typedKey = key;
            if (!(key in previous)) {
                ;
                added[typedKey] = current[typedKey];
            }
            else if (previous[typedKey] !== current[typedKey]) {
                ;
                modified[typedKey] = current[typedKey];
            }
        }
        // Check for removed settings
        for (const key in previous) {
            if (!(key in current)) {
                removed.push(key);
            }
        }
        return { added, modified, removed };
    }
    readSettings() {
        const config = vscode.workspace.getConfiguration(this.section);
        const settings = {};
        // Read each setting with proper defaults
        for (const [key, schema] of Object.entries(CONFIGURATION_SCHEMA)) {
            const typedKey = key;
            const value = config.get(key, schema.default);
            settings[typedKey] = value;
        }
        return settings;
    }
}
exports.ConfigurationService = ConfigurationService;
//# sourceMappingURL=configuration-service.js.map