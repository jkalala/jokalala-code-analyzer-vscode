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
exports.FeedbackCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Provides code actions for submitting feedback on analysis results
 */
class FeedbackCodeActionProvider {
    provideCodeActions(document, range, context, _token) {
        // Only provide feedback actions for Jokalala diagnostics
        const jokalaDiagnostics = context.diagnostics.filter(diagnostic => diagnostic.source === 'Jokalala Code Analysis');
        if (jokalaDiagnostics.length === 0) {
            return undefined;
        }
        const actions = [];
        for (const diagnostic of jokalaDiagnostics) {
            // Add "This was helpful" action
            const helpfulAction = new vscode.CodeAction('👍 Mark as Helpful', vscode.CodeActionKind.QuickFix);
            helpfulAction.command = {
                command: 'jokalala-code-analysis.submitFeedback',
                title: 'Submit Helpful Feedback',
                arguments: [
                    {
                        language: document.languageId,
                        issueCategory: diagnostic.code?.toString() || 'unknown',
                        issueType: diagnostic.code?.toString() || 'unknown',
                        severity: this.mapSeverity(diagnostic.severity),
                        source: 'llm',
                        issueDescription: diagnostic.message,
                        analysisMode: 'full',
                        location: {
                            file: document.fileName,
                            line: range.start.line + 1,
                        },
                        feedbackPreset: 'helpful',
                    },
                ],
            };
            actions.push(helpfulAction);
            // Add "Report false positive" action
            const falsePositiveAction = new vscode.CodeAction('❌ Report False Positive', vscode.CodeActionKind.QuickFix);
            falsePositiveAction.command = {
                command: 'jokalala-code-analysis.submitFeedback',
                title: 'Report False Positive',
                arguments: [
                    {
                        language: document.languageId,
                        issueCategory: diagnostic.code?.toString() || 'unknown',
                        issueType: diagnostic.code?.toString() || 'unknown',
                        severity: this.mapSeverity(diagnostic.severity),
                        source: 'llm',
                        issueDescription: diagnostic.message,
                        analysisMode: 'full',
                        location: {
                            file: document.fileName,
                            line: range.start.line + 1,
                        },
                        feedbackPreset: 'false-positive',
                    },
                ],
            };
            actions.push(falsePositiveAction);
            // Add general feedback action
            const feedbackAction = new vscode.CodeAction('💬 Provide Detailed Feedback', vscode.CodeActionKind.QuickFix);
            feedbackAction.command = {
                command: 'jokalala-code-analysis.submitFeedback',
                title: 'Provide Feedback',
                arguments: [
                    {
                        language: document.languageId,
                        issueCategory: diagnostic.code?.toString() || 'unknown',
                        issueType: diagnostic.code?.toString() || 'unknown',
                        severity: this.mapSeverity(diagnostic.severity),
                        source: 'llm',
                        issueDescription: diagnostic.message,
                        analysisMode: 'full',
                        location: {
                            file: document.fileName,
                            line: range.start.line + 1,
                        },
                    },
                ],
            };
            actions.push(feedbackAction);
        }
        return actions;
    }
    mapSeverity(severity) {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'critical';
            case vscode.DiagnosticSeverity.Warning:
                return 'medium';
            case vscode.DiagnosticSeverity.Information:
                return 'low';
            case vscode.DiagnosticSeverity.Hint:
                return 'low';
            default:
                return 'medium';
        }
    }
}
exports.FeedbackCodeActionProvider = FeedbackCodeActionProvider;
Object.defineProperty(FeedbackCodeActionProvider, "providedCodeActionKinds", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [
        vscode.CodeActionKind.QuickFix,
    ]
});
//# sourceMappingURL=feedback-code-action-provider.js.map