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

import * as vscode from 'vscode'
import { ConfigurationService } from '../services/configuration-service'

// Context lines on each side of the issue to send to the AI
const FIX_CONTEXT_LINES = 10

export class CodeAnalysisCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  constructor(private readonly configService: ConfigurationService) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const diagnostics = context.diagnostics.filter(
      d => d.source === 'Jokalala Code Analysis'
    )
    if (diagnostics.length === 0) return undefined

    const actions: vscode.CodeAction[] = []
    for (const diagnostic of diagnostics) {
      // 1. AI-powered fix (preferred)
      actions.push(this.createAIFixAction(document, diagnostic))

      // 2. Inline suggestion if already available in relatedInformation
      if (diagnostic.relatedInformation?.length) {
        for (const info of diagnostic.relatedInformation) {
          if (info.message.startsWith('Suggestion: ')) {
            const suggestion = info.message.slice('Suggestion: '.length)
            const a = this.createApplySuggestionAction(document, diagnostic, suggestion)
            if (a) actions.push(a)
          }
        }
      }

      // 3. Ignore
      actions.push(this.createIgnoreAction(diagnostic))
    }
    return actions.length > 0 ? actions : undefined
  }

  /**
   * AI-powered fix: sends surrounding code + issue description to the
   * Jokalala API and applies the returned fix as a workspace edit.
   */
  private createAIFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const category = typeof diagnostic.code === 'string'
      ? diagnostic.code
      : String(diagnostic.code ?? 'issue')
    const action = new vscode.CodeAction(
      `Fix with AI: ${category}`,
      vscode.CodeActionKind.QuickFix
    )
    action.diagnostics = [diagnostic]
    action.isPreferred = true
    action.command = {
      command: 'jokalala.aiFixIssue',
      title: 'Fix with AI',
      arguments: [document.uri, diagnostic],
    }
    return action
  }

  /**
   * Applies a suggestion string that was already returned in the analysis result.
   * Uses a workspace edit to replace the flagged line range.
   */
  private createApplySuggestionAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    suggestion: string
  ): vscode.CodeAction | undefined {
    if (!suggestion.trim()) return undefined
    const action = new vscode.CodeAction(
      `Apply suggestion: ${this.truncate(suggestion, 50)}`,
      vscode.CodeActionKind.QuickFix
    )
    action.diagnostics = [diagnostic]
    const edit = new vscode.WorkspaceEdit()
    edit.replace(document.uri, diagnostic.range, suggestion)
    action.edit = edit
    return action
  }

  private createIgnoreAction(diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction('Ignore this issue', vscode.CodeActionKind.QuickFix)
    action.diagnostics = [diagnostic]
    action.command = {
      command: 'jokalala.ignoreIssue',
      title: 'Ignore Issue',
      arguments: [diagnostic],
    }
    return action
  }

  private truncate(str: string, max: number): string {
    return str.length <= max ? str : str.slice(0, max - 3) + '...'
  }
}

/**
 * Register the jokalala.aiFixIssue command.
 * Grabs surrounding code, calls the Jokalala API for an AI fix, and
 * applies the result as a workspace edit.
 */
export function registerAIFixCommand(
  context: vscode.ExtensionContext,
  getAuthHeaders: () => Record<string, string>,
  apiBaseUrl: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.aiFixIssue',
      async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
        const document = await vscode.workspace.openTextDocument(uri)
        const startLine = Math.max(0, diagnostic.range.start.line - FIX_CONTEXT_LINES)
        const endLine = Math.min(
          document.lineCount - 1,
          diagnostic.range.end.line + FIX_CONTEXT_LINES
        )
        const surroundingCode = document
          .getText(new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER))

        const category = typeof diagnostic.code === 'string'
          ? diagnostic.code
          : String(diagnostic.code ?? 'unknown')

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Generating AI fix for ${category}…`, cancellable: false },
          async () => {
            try {
              const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  message: `Fix the following ${category} issue on line ${diagnostic.range.start.line + 1}:\n\n${diagnostic.message}\n\nHere is the surrounding code:\n\`\`\`\n${surroundingCode}\n\`\`\`\n\nReturn ONLY the corrected code for lines ${startLine + 1}–${endLine + 1}, no explanation.`,
                  agentType: 'development_assistant',
                }),
              })

              if (!response.ok) {
                if (response.status === 401) {
                  vscode.window.showWarningMessage('Sign in to Jokalala to use AI fixes.', 'Sign In').then(choice => {
                    if (choice === 'Sign In') vscode.commands.executeCommand('jokalala.signIn')
                  })
                  return
                }
                throw new Error(`API error ${response.status}`)
              }

              const data = await response.json() as { content?: string }
              const fixedCode = data.content?.trim()
              if (!fixedCode) {
                vscode.window.showErrorMessage('AI did not return a fix. Try again.')
                return
              }

              const edit = new vscode.WorkspaceEdit()
              const replaceRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
              edit.replace(uri, replaceRange, fixedCode)
              await vscode.workspace.applyEdit(edit)
              vscode.window.showInformationMessage(`AI fix applied for ${category}.`)
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to generate AI fix: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        )
      }
    )
  )
}

/**
 * Register the code action provider
 */
export function registerCodeActionProvider(
  context: vscode.ExtensionContext,
  configService: ConfigurationService
): vscode.Disposable {
  const provider = new CodeAnalysisCodeActionProvider(configService)

  const registration = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' }, // Apply to all file schemes
    provider,
    {
      providedCodeActionKinds:
        CodeAnalysisCodeActionProvider.providedCodeActionKinds,
    }
  )

  context.subscriptions.push(registration)

  return registration
}
