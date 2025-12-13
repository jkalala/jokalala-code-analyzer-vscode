"use strict";
/**
 * Code Action Provider for Jokalala Code Analysis
 * Provides quick fixes for issues detected by the analysis service
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
exports.CodeAnalysisCodeActionProvider = void 0;
exports.registerCodeActionProvider = registerCodeActionProvider;
const vscode = __importStar(require("vscode"));
/**
 * Provides code actions (quick fixes) for diagnostics
 */
class CodeAnalysisCodeActionProvider {
    /**
     * Provide code actions for the given document and range
     */
    provideCodeActions(document, _range, context, _token) {
        // Get diagnostics from our extension
        const diagnostics = context.diagnostics.filter(diagnostic => diagnostic.source === 'Jokalala Code Analysis');
        if (diagnostics.length === 0) {
            return undefined;
        }
        const codeActions = [];
        for (const diagnostic of diagnostics) {
            // Create quick fix actions based on diagnostic information
            const quickFixes = this.createQuickFixes(document, diagnostic);
            codeActions.push(...quickFixes);
        }
        return codeActions.length > 0 ? codeActions : undefined;
    }
    /**
     * Create quick fix actions for a diagnostic
     */
    createQuickFixes(document, diagnostic) {
        const actions = [];
        // If the diagnostic has related information with suggestions, create a quick fix
        if (diagnostic.relatedInformation &&
            diagnostic.relatedInformation.length > 0) {
            for (const info of diagnostic.relatedInformation) {
                if (info.message.startsWith('Suggestion: ')) {
                    const suggestion = info.message.substring('Suggestion: '.length);
                    const action = this.createSuggestionAction(document, diagnostic, suggestion);
                    if (action) {
                        actions.push(action);
                    }
                }
            }
        }
        // Add generic actions
        actions.push(this.createIgnoreAction(diagnostic));
        actions.push(this.createShowDocumentationAction(diagnostic));
        return actions;
    }
    /**
     * Create a code action to apply a suggestion
     */
    createSuggestionAction(_document, diagnostic, suggestion) {
        const action = new vscode.CodeAction(`Apply suggestion: ${this.truncate(suggestion, 50)}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        // For now, we'll just show the suggestion in a message
        // In a real implementation, you would parse the suggestion and apply the fix
        action.command = {
            command: 'jokalala.showSuggestion',
            title: 'Show Suggestion',
            arguments: [suggestion, diagnostic.range],
        };
        return action;
    }
    /**
     * Create a code action to ignore the issue
     */
    createIgnoreAction(diagnostic) {
        const action = new vscode.CodeAction('Ignore this issue', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
            command: 'jokalala.ignoreIssue',
            title: 'Ignore Issue',
            arguments: [diagnostic],
        };
        return action;
    }
    /**
     * Create a code action to show documentation
     */
    createShowDocumentationAction(diagnostic) {
        const action = new vscode.CodeAction('Show documentation', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
            command: 'jokalala.showDocumentation',
            title: 'Show Documentation',
            arguments: [diagnostic.code],
        };
        return action;
    }
    /**
     * Truncate a string to a maximum length
     */
    truncate(str, maxLength) {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength - 3) + '...';
    }
}
exports.CodeAnalysisCodeActionProvider = CodeAnalysisCodeActionProvider;
Object.defineProperty(CodeAnalysisCodeActionProvider, "providedCodeActionKinds", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [
        vscode.CodeActionKind.QuickFix,
    ]
});
/**
 * Register the code action provider
 */
function registerCodeActionProvider(context) {
    const provider = new CodeAnalysisCodeActionProvider();
    const registration = vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, // Apply to all file schemes
    provider, {
        providedCodeActionKinds: CodeAnalysisCodeActionProvider.providedCodeActionKinds,
    });
    context.subscriptions.push(registration);
    return registration;
}
//# sourceMappingURL=code-action-provider.js.map