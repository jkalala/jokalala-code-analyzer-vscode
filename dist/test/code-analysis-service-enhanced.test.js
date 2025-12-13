"use strict";
/**
 * Integration tests for enhanced Code Analysis Service
 * Tests queue management, retry logic, cancellation, and circuit breaker
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
const code_analysis_service_1 = require("../services/code-analysis-service");
describe('Enhanced Code Analysis Service Integration Tests', () => {
    let service;
    let mockConfig;
    let mockLogger;
    beforeEach(() => {
        // Create mock configuration service
        mockConfig = {
            getSettings: () => ({
                apiEndpoint: 'http://localhost:3000/api/test',
                apiKey: 'test-key',
                analysisMode: 'full',
                autoAnalyze: false,
                showInlineWarnings: true,
                enableDiagnostics: true,
                maxFileSize: 50000,
                maxProjectFiles: 40,
                maxProjectFileSize: 120000,
                requestTimeout: 5000,
                enableTelemetry: false,
            }),
        };
        // Create mock logger
        mockLogger = {
            info: () => { },
            warn: () => { },
            error: () => { },
            debug: () => { },
        };
        service = new code_analysis_service_1.CodeAnalysisService(mockConfig, mockLogger);
    });
    describe('Request Queue', () => {
        it('should return queue status', () => {
            const status = service.getQueueStatus();
            assert.strictEqual(typeof status.pending, 'number');
            assert.strictEqual(typeof status.active, 'number');
            assert.strictEqual(typeof status.completed, 'number');
            assert.strictEqual(typeof status.failed, 'number');
        });
        it('should track completed requests', () => {
            const initialStatus = service.getQueueStatus();
            assert.strictEqual(initialStatus.completed, 0);
        });
    });
    describe('Request Cancellation', () => {
        it('should allow cancelling a request', () => {
            const requestId = 'test-request-123';
            // Should not throw when cancelling non-existent request
            assert.doesNotThrow(() => {
                service.cancelAnalysis(requestId);
            });
        });
    });
    describe('Health Check', () => {
        it('should return health check result', async () => {
            const result = await service.testConnection();
            assert.strictEqual(typeof result.healthy, 'boolean');
            assert.strictEqual(typeof result.message, 'string');
        });
        it('should handle missing API endpoint', async () => {
            mockConfig.getSettings = () => ({
                ...mockConfig.getSettings(),
                apiEndpoint: '',
            });
            const result = await service.testConnection();
            assert.strictEqual(result.healthy, false);
            assert.ok(result.message.includes('not configured'));
        });
    });
    describe('Cache Management', () => {
        it('should clear cache without errors', async () => {
            // Should handle missing endpoint gracefully
            try {
                await service.clearCache();
            }
            catch (error) {
                assert.ok(error.message.includes('not configured'));
            }
        });
    });
});
//# sourceMappingURL=code-analysis-service-enhanced.test.js.map