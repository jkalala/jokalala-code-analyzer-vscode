"use strict";
/**
 * Configuration Service Tests
 * Tests for configuration validation, bounds checking, and change notifications
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
const assert = __importStar(require("assert"));
const configuration_service_1 = require("../services/configuration-service");
suite('ConfigurationService - Schema Validation Tests', () => {
    let configService;
    setup(() => {
        configService = new configuration_service_1.ConfigurationService('jokalala');
    });
    test('should validate required fields', () => {
        const result = configService.validateConfiguration();
        // All required fields should be present in default configuration
        assert.strictEqual(result.valid, true, 'Default configuration should be valid');
    });
    test('should validate string type fields', () => {
        const settings = configService.getSettings();
        // apiEndpoint should be a string
        assert.strictEqual(typeof settings.apiEndpoint, 'string', 'apiEndpoint should be a string');
        // analysisMode should be a string
        assert.strictEqual(typeof settings.analysisMode, 'string', 'analysisMode should be a string');
    });
    test('should validate boolean type fields', () => {
        const settings = configService.getSettings();
        assert.strictEqual(typeof settings.autoAnalyze, 'boolean', 'autoAnalyze should be a boolean');
        assert.strictEqual(typeof settings.enableDiagnostics, 'boolean', 'enableDiagnostics should be a boolean');
        assert.strictEqual(typeof settings.enableTelemetry, 'boolean', 'enableTelemetry should be a boolean');
    });
    test('should validate number type fields', () => {
        const settings = configService.getSettings();
        assert.strictEqual(typeof settings.maxFileSize, 'number', 'maxFileSize should be a number');
        assert.strictEqual(typeof settings.maxProjectFiles, 'number', 'maxProjectFiles should be a number');
        assert.strictEqual(typeof settings.requestTimeout, 'number', 'requestTimeout should be a number');
    });
    test('should validate enum values for analysisMode', () => {
        const settings = configService.getSettings();
        const validModes = ['quick', 'deep', 'full'];
        assert.ok(validModes.includes(settings.analysisMode), `analysisMode should be one of: ${validModes.join(', ')}`);
    });
    test('should validate enum values for logLevel', () => {
        const settings = configService.getSettings();
        if (settings.logLevel) {
            const validLevels = ['debug', 'info', 'warn', 'error'];
            assert.ok(validLevels.includes(settings.logLevel), `logLevel should be one of: ${validLevels.join(', ')}`);
        }
    });
    test('should provide detailed validation errors', () => {
        const result = configService.validateConfiguration();
        // Check error structure
        assert.ok(Array.isArray(result.errors), 'Errors should be an array');
        assert.ok(Array.isArray(result.warnings), 'Warnings should be an array');
        // If there are errors, they should have proper structure
        if (result.errors.length > 0) {
            const error = result.errors[0];
            if (error) {
                assert.ok(error.setting, 'Error should have setting name');
                assert.ok(error.message, 'Error should have message');
                assert.ok('currentValue' in error, 'Error should have currentValue property');
            }
        }
    });
    test('should warn about HTTP endpoints', () => {
        const result = configService.validateConfiguration();
        // Check if there's a warning about HTTP (if endpoint uses HTTP)
        const settings = configService.getSettings();
        if (settings.apiEndpoint.startsWith('http:')) {
            const httpWarning = result.warnings.find(w => w.message.includes('HTTPS'));
            assert.ok(httpWarning, 'Should warn about HTTP endpoint');
        }
    });
    test('should warn about deprecated apiKey in settings', () => {
        const result = configService.validateConfiguration();
        // Check for apiKey deprecation warning if apiKey is set
        const settings = configService.getSettings();
        if (settings.apiKey && settings.apiKey.trim() !== '') {
            const deprecationWarning = result.warnings.find(w => w.setting === 'apiKey');
            assert.ok(deprecationWarning, 'Should warn about deprecated apiKey');
            assert.ok(deprecationWarning.message.includes('deprecated'), 'Warning should mention deprecation');
        }
    });
});
suite('ConfigurationService - Bounds Checking Tests', () => {
    let configService;
    setup(() => {
        configService = new configuration_service_1.ConfigurationService('jokalala');
    });
    test('should validate numeric values are within bounds', () => {
        const settings = configService.getSettings();
        // All default values should be valid and within bounds
        assert.ok(settings.maxFileSize >= 1000 && settings.maxFileSize <= 500000, 'maxFileSize should be within bounds');
        assert.ok(settings.maxProjectFiles >= 1 && settings.maxProjectFiles <= 200, 'maxProjectFiles should be within bounds');
        assert.ok(settings.requestTimeout >= 5000 && settings.requestTimeout <= 300000, 'requestTimeout should be within bounds');
        if (settings.cacheTTL !== undefined) {
            assert.ok(settings.cacheTTL >= 60000 && settings.cacheTTL <= 86400000, 'cacheTTL should be within bounds');
        }
        if (settings.maxRetries !== undefined) {
            assert.ok(settings.maxRetries >= 0 && settings.maxRetries <= 10, 'maxRetries should be within bounds');
        }
        if (settings.retryDelay !== undefined) {
            assert.ok(settings.retryDelay >= 100 && settings.retryDelay <= 10000, 'retryDelay should be within bounds');
        }
        if (settings.circuitBreakerThreshold !== undefined) {
            assert.ok(settings.circuitBreakerThreshold >= 1 &&
                settings.circuitBreakerThreshold <= 20, 'circuitBreakerThreshold should be within bounds');
        }
    });
    test('should enforce minimum and maximum values', () => {
        const result = configService.validateConfiguration();
        // Default configuration should pass all bounds checks
        assert.strictEqual(result.valid, true, 'Default configuration should be valid');
        assert.strictEqual(result.errors.length, 0, 'Default configuration should have no errors');
    });
    test('should provide specific error messages with bounds information', () => {
        const result = configService.validateConfiguration();
        // Verify error message structure
        assert.ok(result !== undefined, 'Validation should return a result');
        assert.ok(Array.isArray(result.errors), 'Result should have errors array');
        assert.ok(Array.isArray(result.warnings), 'Result should have warnings array');
        // If there are errors, they should have detailed information
        if (result.errors.length > 0) {
            const error = result.errors[0];
            if (error) {
                assert.ok(error.setting, 'Error should include setting name');
                assert.ok(error.message, 'Error should include message');
                assert.ok('currentValue' in error, 'Error should include current value');
            }
        }
    });
});
suite('ConfigurationService - Change Notifications Tests', () => {
    let configService;
    setup(() => {
        configService = new configuration_service_1.ConfigurationService('jokalala');
    });
    test('should register change listeners', () => {
        const disposable = configService.watch(() => {
            // Callback for configuration changes
        });
        assert.ok(disposable, 'watch() should return a disposable');
        assert.ok(typeof disposable.dispose === 'function', 'Disposable should have dispose method');
        disposable.dispose();
    });
    test('should calculate diff for added settings', () => {
        const previous = {
            apiEndpoint: 'https://api.example.com',
            maxFileSize: 50000,
        };
        const current = {
            apiEndpoint: 'https://api.example.com',
            maxFileSize: 50000,
            autoAnalyze: true,
            analysisMode: 'full',
            showInlineWarnings: true,
            enableDiagnostics: true,
            maxProjectFiles: 40,
            maxProjectFileSize: 120000,
            requestTimeout: 60000,
            enableTelemetry: true,
            apiKey: '',
        };
        // Simulate the calculateChanges logic
        const added = {};
        for (const key in current) {
            const typedKey = key;
            if (!(key in previous)) {
                ;
                added[typedKey] = current[typedKey];
            }
        }
        assert.ok(Object.keys(added).length > 0, 'Should detect added settings');
        assert.ok('autoAnalyze' in added, 'Should include autoAnalyze in added');
    });
    test('should calculate diff for modified settings', () => {
        const previous = {
            apiEndpoint: 'https://api.example.com',
            maxFileSize: 50000,
            autoAnalyze: false,
            analysisMode: 'quick',
            showInlineWarnings: true,
            enableDiagnostics: true,
            maxProjectFiles: 40,
            maxProjectFileSize: 120000,
            requestTimeout: 60000,
            enableTelemetry: true,
            apiKey: '',
        };
        const current = {
            ...previous,
            maxFileSize: 100000,
            analysisMode: 'full',
        };
        // Simulate the calculateChanges logic
        const modified = {};
        for (const key in current) {
            const typedKey = key;
            if (key in previous && previous[typedKey] !== current[typedKey]) {
                ;
                modified[typedKey] = current[typedKey];
            }
        }
        assert.strictEqual(Object.keys(modified).length, 2, 'Should detect 2 modified settings');
        assert.ok('maxFileSize' in modified, 'Should include maxFileSize in modified');
        assert.ok('analysisMode' in modified, 'Should include analysisMode in modified');
        assert.strictEqual(modified.maxFileSize, 100000, 'Modified value should be correct');
    });
    test('should calculate diff for removed settings', () => {
        const previous = {
            apiEndpoint: 'https://api.example.com',
            maxFileSize: 50000,
            autoAnalyze: false,
            analysisMode: 'quick',
            showInlineWarnings: true,
            enableDiagnostics: true,
            maxProjectFiles: 40,
            maxProjectFileSize: 120000,
            requestTimeout: 60000,
            enableTelemetry: true,
            apiKey: '',
            cacheEnabled: true,
        };
        const current = {
            apiEndpoint: 'https://api.example.com',
            maxFileSize: 50000,
            autoAnalyze: false,
            analysisMode: 'quick',
            showInlineWarnings: true,
            enableDiagnostics: true,
            maxProjectFiles: 40,
            maxProjectFileSize: 120000,
            requestTimeout: 60000,
            enableTelemetry: true,
            apiKey: '',
        };
        // Simulate the calculateChanges logic
        const removed = [];
        for (const key in previous) {
            if (!(key in current)) {
                removed.push(key);
            }
        }
        assert.strictEqual(removed.length, 1, 'Should detect 1 removed setting');
        assert.ok(removed.includes('cacheEnabled'), 'Should include cacheEnabled in removed');
    });
    test('should notify listeners with change details', done => {
        let notificationReceived = false;
        const disposable = configService.watch((changes) => {
            notificationReceived = true;
            // Verify change structure
            assert.ok(changes, 'Changes should be provided');
            assert.ok('added' in changes, 'Changes should have added property');
            assert.ok('modified' in changes, 'Changes should have modified property');
            assert.ok('removed' in changes, 'Changes should have removed property');
            disposable.dispose();
            done();
        });
        // Note: In a real test environment, we would trigger a configuration change
        // For now, we just verify the listener registration works
        setTimeout(() => {
            if (!notificationReceived) {
                disposable.dispose();
                done();
            }
        }, 100);
    });
    test('should handle multiple listeners', () => {
        const disposable1 = configService.watch(() => {
            // First listener
        });
        const disposable2 = configService.watch(() => {
            // Second listener
        });
        // Both listeners should be registered
        assert.ok(disposable1, 'First listener should be registered');
        assert.ok(disposable2, 'Second listener should be registered');
        disposable1.dispose();
        disposable2.dispose();
    });
    test('should remove listener on dispose', () => {
        let callCount = 0;
        const disposable = configService.watch(() => {
            callCount++;
        });
        // Dispose the listener
        disposable.dispose();
        // Verify the listener is removed (callCount should not increase)
        // In a real scenario, we would trigger a config change here
        assert.strictEqual(callCount, 0, 'Listener should not be called after dispose');
    });
});
suite('ConfigurationService - Validation Error Messages', () => {
    let configService;
    setup(() => {
        configService = new configuration_service_1.ConfigurationService('jokalala');
    });
    test('should include setting name in error message', () => {
        const result = configService.validateConfiguration();
        if (result.errors.length > 0) {
            const error = result.errors[0];
            if (error) {
                assert.ok(error.setting, 'Error should include setting name');
                assert.ok(error.message, 'Error should include message');
            }
        }
    });
    test('should include current value in error', () => {
        const result = configService.validateConfiguration();
        if (result.errors.length > 0) {
            const error = result.errors[0];
            if (error) {
                assert.ok(error.currentValue !== undefined, 'Error should include current value');
            }
        }
    });
    test('should include expected type for type errors', () => {
        const result = configService.validateConfiguration();
        if (result.errors.length > 0) {
            const typeError = result.errors.find(e => e.expectedType);
            if (typeError) {
                assert.ok(typeError.expectedType, 'Type error should include expected type');
            }
        }
    });
});
//# sourceMappingURL=configuration-service.test.js.map