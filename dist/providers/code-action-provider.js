"use strict";
/**
 * Code Action Provider for Jokalala Code Analysis
 *
 * Provides quick fixes for issues detected by the analysis service:
 * - AI-powered fix: calls the Jokalala API with surrounding code context
 *   and applies the suggested fix as a workspace edit
 * - Inline suggestion: applies the suggestion string already attached to
 *   the diagnostic's relatedInformation
 * - Ignore: suppresses the issue for the session
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
exports.registerAIFixCommand = registerAIFixCommand;
exports.registerCodeActionProvider = registerCodeActionProvider;
const vscode = __importStar(require("vscode"));
// Context lines on each side of the issue to send to the AI
const FIX_CONTEXT_LINES = 10;
class CodeAnalysisCodeActionProvider {
    constructor(configService) {
        Object.defineProperty(this, "configService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: configService
        });
    }
    provideCodeActions(document, _range, context, _token) {
        const diagnostics = context.diagnostics.filter(d => d.source === 'Jokalala Code Analysis');
        if (diagnostics.length === 0)
            return undefined;
        const actions = [];
        for (const diagnostic of diagnostics) {
            // 1. AI-powered fix (preferred)
            actions.push(this.createAIFixAction(document, diagnostic));
            // 2. Inline suggestion if already available in relatedInformation
            if (diagnostic.relatedInformation?.length) {
                for (const info of diagnostic.relatedInformation) {
                    if (info.message.startsWith('Suggestion: ')) {
                        const suggestion = info.message.slice('Suggestion: '.length);
                        const a = this.createApplySuggestionAction(document, diagnostic, suggestion);
                        if (a)
                            actions.push(a);
                    }
                }
            }
            // 3. Ignore
            actions.push(this.createIgnoreAction(diagnostic));
        }
        return actions.length > 0 ? actions : undefined;
    }
    /**
     * AI-powered fix: sends surrounding code + issue description to the
     * Jokalala API and applies the returned fix as a workspace edit.
     */
    createAIFixAction(document, diagnostic) {
        const category = typeof diagnostic.code === 'string'
            ? diagnostic.code
            : String(diagnostic.code ?? 'issue');
        const action = new vscode.CodeAction(`Fix with AI: ${category}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        action.command = {
            command: 'jokalala.aiFixIssue',
            title: 'Fix with AI',
            arguments: [document.uri, diagnostic],
        };
        return action;
    }
    /**
     * Applies a suggestion string that was already returned in the analysis result.
     * Uses a workspace edit to replace the flagged line range.
     */
    createApplySuggestionAction(document, diagnostic, suggestion) {
        if (!suggestion.trim())
            return undefined;
        const action = new vscode.CodeAction(`Apply suggestion: ${this.truncate(suggestion, 50)}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, diagnostic.range, suggestion);
        action.edit = edit;
        return action;
    }
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
    truncate(str, max) {
        return str.length <= max ? str : str.slice(0, max - 3) + '...';
    }
}
exports.CodeAnalysisCodeActionProvider = CodeAnalysisCodeActionProvider;
Object.defineProperty(CodeAnalysisCodeActionProvider, "providedCodeActionKinds", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: [vscode.CodeActionKind.QuickFix]
});
/**
 * Register the jokalala.aiFixIssue command.
 * Grabs surrounding code, calls the Jokalala API for an AI fix, and
 * applies the result as a workspace edit.
 */
function registerAIFixCommand(context, getAuthHeaders, apiBaseUrl) {
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.aiFixIssue', async (uri, diagnostic) => {
        const document = await vscode.workspace.openTextDocument(uri);
        const startLine = Math.max(0, diagnostic.range.start.line - FIX_CONTEXT_LINES);
        const endLine = Math.min(document.lineCount - 1, diagnostic.range.end.line + FIX_CONTEXT_LINES);
        const surroundingCode = document
            .getText(new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER));
        const category = typeof diagnostic.code === 'string'
            ? diagnostic.code
            : String(diagnostic.code ?? 'unknown');
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Generating AI fix for ${category}…`, cancellable: false }, async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        message: `Fix the following ${category} issue on line ${diagnostic.range.start.line + 1}:\n\n${diagnostic.message}\n\nHere is the surrounding code:\n\`\`\`\n${surroundingCode}\n\`\`\`\n\nReturn ONLY the corrected code for lines ${startLine + 1}–${endLine + 1}, no explanation.`,
                        agentType: 'development_assistant',
                    }),
                });
                if (!response.ok) {
                    if (response.status === 401) {
                        vscode.window.showWarningMessage('Sign in to Jokalala to use AI fixes.', 'Sign In').then(choice => {
                            if (choice === 'Sign In')
                                vscode.commands.executeCommand('jokalala.signIn');
                        });
                        return;
                    }
                    throw new Error(`API error ${response.status}`);
                }
                const data = await response.json();
                const fixedCode = data.content?.trim();
                if (!fixedCode) {
                    vscode.window.showErrorMessage('AI did not return a fix. Try again.');
                    return;
                }
                const edit = new vscode.WorkspaceEdit();
                const replaceRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
                edit.replace(uri, replaceRange, fixedCode);
                await vscode.workspace.applyEdit(edit);
                vscode.window.showInformationMessage(`AI fix applied for ${category}.`);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to generate AI fix: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
    }));
}
/**
 * Register the code action provider
 */
function registerCodeActionProvider(context, configService) {
    const provider = new CodeAnalysisCodeActionProvider(configService);
    const registration = vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, // Apply to all file schemes
    provider, {
        providedCodeActionKinds: CodeAnalysisCodeActionProvider.providedCodeActionKinds,
    });
    context.subscriptions.push(registration);
    return registration;
}
//# sourceMappingURL=code-action-provider.js.map