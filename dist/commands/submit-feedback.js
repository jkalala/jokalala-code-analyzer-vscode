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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeedbackCommand = registerFeedbackCommand;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
async function registerFeedbackCommand(context) {
    const disposable = vscode.commands.registerCommand('jokalala-code-analysis.submitFeedback', async (options) => {
        try {
            // If no options provided, show input dialogs
            if (!options) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor found');
                    return;
                }
                // Get issue type from user
                const issueType = await vscode.window.showInputBox({
                    prompt: 'Enter the issue type you want to provide feedback on',
                    placeHolder: 'e.g., SQL Injection, Memory Leak',
                });
                if (!issueType) {
                    return;
                }
                options = {
                    language: editor.document.languageId,
                    issueCategory: 'user-reported',
                    issueType,
                    severity: 'medium',
                    source: 'llm',
                    issueDescription: issueType,
                    analysisMode: 'full',
                    location: {
                        file: editor.document.fileName,
                        line: editor.selection.active.line + 1,
                    },
                };
            }
            // Ask for feedback type
            const feedbackType = await vscode.window.showQuickPick([
                { label: 'Helpful', value: 'helpful', description: 'This issue was accurately identified and useful' },
                { label: 'Not Helpful', value: 'not-helpful', description: 'This issue was not useful to me' },
                { label: 'False Positive', value: 'false-positive', description: 'This is not actually an issue' },
                { label: 'Missed Issue', value: 'missed-issue', description: 'Analysis missed an important issue' },
            ], {
                placeHolder: 'How would you rate this analysis result?',
            });
            if (!feedbackType) {
                return;
            }
            // Ask for accuracy rating
            const accuracyChoice = await vscode.window.showQuickPick([
                { label: '⭐ Very Inaccurate', value: '1' },
                { label: '⭐⭐ Somewhat Inaccurate', value: '2' },
                { label: '⭐⭐⭐ Neutral', value: '3' },
                { label: '⭐⭐⭐⭐ Mostly Accurate', value: '4' },
                { label: '⭐⭐⭐⭐⭐ Very Accurate', value: '5' },
            ], {
                placeHolder: 'How accurate was this analysis?',
            });
            if (!accuracyChoice) {
                return;
            }
            // Optional comment
            const userComment = await vscode.window.showInputBox({
                prompt: 'Any additional comments? (Optional)',
                placeHolder: 'Tell us more about your experience...',
            });
            // Get API endpoint from settings
            const config = vscode.workspace.getConfiguration('jokalala');
            const apiEndpoint = config.get('apiEndpoint');
            const apiKey = config.get('apiKey');
            if (!apiEndpoint) {
                vscode.window.showErrorMessage('API endpoint not configured');
                return;
            }
            // Submit feedback
            const response = await axios_1.default.post(`${apiEndpoint}/analysis-feedback`, {
                sessionId: context.globalState.get('sessionId') || 'vscode-session',
                userId: context.globalState.get('userId'),
                language: options.language,
                issueCategory: options.issueCategory,
                issueType: options.issueType,
                severity: options.severity,
                source: options.source,
                feedbackType: feedbackType.value,
                accuracy: parseInt(accuracyChoice.value),
                userComment,
                issueDescription: options.issueDescription,
                codeSnippet: options.codeSnippet,
                location: options.location,
                analysisMode: options.analysisMode,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
                },
            });
            if (response.data.success) {
                vscode.window.showInformationMessage('Thank you for your feedback! Your input helps improve the analysis quality.');
            }
            else {
                throw new Error(response.data.error?.message || 'Failed to submit feedback');
            }
        }
        catch (error) {
            console.error('[Feedback Command] Error:', error);
            vscode.window.showErrorMessage(`Failed to submit feedback: ${error.message}`);
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=submit-feedback.js.map