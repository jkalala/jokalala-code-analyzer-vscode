"use strict";
/**
 * Unit tests for DiagnosticsManager
 * Tests debouncing behavior, location normalization, and severity mapping
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
/// <reference types="mocha" />
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const diagnostics_manager_1 = require("../services/diagnostics-manager");
suite('DiagnosticsManager Test Suite', () => {
    let diagnosticsManager;
    let testUri;
    setup(() => {
        diagnosticsManager = new diagnostics_manager_1.DiagnosticsManager();
        testUri = vscode.Uri.file('/test/file.ts');
    });
    teardown(() => {
        diagnosticsManager.dispose();
    });
    suite('Debouncing Behavior', () => {
        test('should debounce multiple rapid updates', async () => {
            const issues1 = [
                {
                    severity: 'high',
                    category: 'security',
                    message: 'Issue 1',
                    source: 'static',
                    location: { startLine: 1, endLine: 1 },
                },
            ];
            const issues2 = [
                {
                    severity: 'medium',
                    category: 'performance',
                    message: 'Issue 2',
                    source: 'static',
                    location: { startLine: 2, endLine: 2 },
                },
            ];
            // Trigger multiple updates rapidly
            diagnosticsManager.updateDiagnostics(testUri, issues1);
            diagnosticsManager.updateDiagnostics(testUri, issues2);
            // Wait for debounce delay (300ms + buffer)
            await new Promise(resolve => setTimeout(resolve, 400));
            // Should only have the last update
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            assert.strictEqual(diagnostics.length, 1);
            assert.strictEqual(diagnostics[0]?.message, 'Issue 2');
        });
        test('should update immediately when using updateDiagnosticsImmediate', () => {
            const issues = [
                {
                    severity: 'critical',
                    category: 'security',
                    message: 'Critical issue',
                    source: 'static',
                    location: { startLine: 1, endLine: 1 },
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            // Should be available immediately
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            assert.strictEqual(diagnostics.length, 1);
            assert.strictEqual(diagnostics[0]?.message, 'Critical issue');
        });
    });
    suite('Location Normalization', () => {
        test('should handle structured location format', () => {
            const issues = [
                {
                    severity: 'high',
                    category: 'bug',
                    message: 'Test issue',
                    source: 'static',
                    location: {
                        startLine: 5,
                        endLine: 7,
                        startColumn: 10,
                        endColumn: 20,
                    },
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            assert.strictEqual(diagnostics.length, 1);
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            const range = diagnostic.range;
            assert.strictEqual(range.start.line, 4); // 0-based
            assert.strictEqual(range.start.character, 10);
            assert.strictEqual(range.end.line, 6); // 0-based
            assert.strictEqual(range.end.character, 20);
        });
        test('should handle legacy line/column format', () => {
            const issues = [
                {
                    severity: 'medium',
                    category: 'style',
                    message: 'Legacy format issue',
                    source: 'static',
                    line: 10,
                    column: 5,
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            assert.strictEqual(diagnostics.length, 1);
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            const range = diagnostic.range;
            assert.strictEqual(range.start.line, 9); // 0-based
            assert.strictEqual(range.start.character, 5);
        });
        test('should handle missing location data', () => {
            const issues = [
                {
                    severity: 'low',
                    category: 'info',
                    message: 'No location',
                    source: 'llm',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            assert.strictEqual(diagnostics.length, 1);
            // Should default to line 0
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            const range = diagnostic.range;
            assert.strictEqual(range.start.line, 0);
        });
    });
    suite('Severity Mapping', () => {
        test('should map critical to Error', () => {
            const issues = [
                {
                    severity: 'critical',
                    category: 'security',
                    message: 'Critical',
                    source: 'static',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
        });
        test('should map medium to Warning', () => {
            const issues = [
                {
                    severity: 'medium',
                    category: 'performance',
                    message: 'Medium',
                    source: 'static',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
        });
        test('should map low to Information', () => {
            const issues = [
                {
                    severity: 'low',
                    category: 'style',
                    message: 'Low',
                    source: 'static',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.ok(diagnostics, 'Diagnostics should exist');
            const diagnostic = diagnostics[0];
            assert.ok(diagnostic, 'First diagnostic should exist');
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information);
        });
    });
    suite('Clear Operations', () => {
        test('should clear all diagnostics', () => {
            const issues = [
                {
                    severity: 'high',
                    category: 'bug',
                    message: 'Test',
                    source: 'static',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            assert.ok(diagnosticsManager.getDiagnostics(testUri));
            diagnosticsManager.clear();
            const diagnostics = diagnosticsManager.getDiagnostics(testUri);
            assert.strictEqual(diagnostics?.length || 0, 0);
        });
        test('should clear diagnostics for specific file', () => {
            const testUri2 = vscode.Uri.file('/test/file2.ts');
            const issues = [
                {
                    severity: 'high',
                    category: 'bug',
                    message: 'Test',
                    source: 'static',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            diagnosticsManager.updateDiagnosticsImmediate(testUri2, issues);
            diagnosticsManager.clearFile(testUri);
            assert.strictEqual(diagnosticsManager.getDiagnostics(testUri)?.length || 0, 0);
            assert.strictEqual(diagnosticsManager.getDiagnostics(testUri2)?.length, 1);
        });
    });
    suite('Issue Metadata', () => {
        test('should store and retrieve issue metadata', () => {
            const issues = [
                {
                    id: 'issue-123',
                    severity: 'high',
                    category: 'security',
                    message: 'Security issue',
                    source: 'static',
                    documentationUrl: 'https://example.com/docs',
                },
            ];
            diagnosticsManager.updateDiagnosticsImmediate(testUri, issues);
            const metadata = diagnosticsManager.getIssueMetadata('issue-123');
            assert.ok(metadata, 'Metadata should exist');
            assert.strictEqual(metadata.id, 'issue-123');
            assert.strictEqual(metadata.documentationUrl, 'https://example.com/docs');
        });
        test('should return undefined for non-existent issue', () => {
            const metadata = diagnosticsManager.getIssueMetadata('nonexistent');
            assert.strictEqual(metadata, undefined);
        });
    });
});
//# sourceMappingURL=diagnostics-manager.test.js.map