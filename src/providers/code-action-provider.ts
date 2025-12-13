/**
 * Code Action Provider for Jokalala Code Analysis
 * Provides quick fixes for issues detected by the analysis service
 */

import * as vscode from 'vscode'

/**
 * Provides code actions (quick fixes) for diagnostics
 */
export class CodeAnalysisCodeActionProvider
  implements vscode.CodeActionProvider
{
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ]

  /**
   * Provide code actions for the given document and range
   */
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    // Get diagnostics from our extension
    const diagnostics = context.diagnostics.filter(
      diagnostic => diagnostic.source === 'Jokalala Code Analysis'
    )

    if (diagnostics.length === 0) {
      return undefined
    }

    const codeActions: vscode.CodeAction[] = []

    for (const diagnostic of diagnostics) {
      // Create quick fix actions based on diagnostic information
      const quickFixes = this.createQuickFixes(document, diagnostic)
      codeActions.push(...quickFixes)
    }

    return codeActions.length > 0 ? codeActions : undefined
  }

  /**
   * Create quick fix actions for a diagnostic
   */
  private createQuickFixes(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

    // If the diagnostic has related information with suggestions, create a quick fix
    if (
      diagnostic.relatedInformation &&
      diagnostic.relatedInformation.length > 0
    ) {
      for (const info of diagnostic.relatedInformation) {
        if (info.message.startsWith('Suggestion: ')) {
          const suggestion = info.message.substring('Suggestion: '.length)
          const action = this.createSuggestionAction(
            document,
            diagnostic,
            suggestion
          )
          if (action) {
            actions.push(action)
          }
        }
      }
    }

    // Add generic actions
    actions.push(this.createIgnoreAction(diagnostic))
    actions.push(this.createShowDocumentationAction(diagnostic))

    return actions
  }

  /**
   * Create a code action to apply a suggestion
   */
  private createSuggestionAction(
    _document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    suggestion: string
  ): vscode.CodeAction | undefined {
    const action = new vscode.CodeAction(
      `Apply suggestion: ${this.truncate(suggestion, 50)}`,
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.isPreferred = true

    // For now, we'll just show the suggestion in a message
    // In a real implementation, you would parse the suggestion and apply the fix
    action.command = {
      command: 'jokalala.showSuggestion',
      title: 'Show Suggestion',
      arguments: [suggestion, diagnostic.range],
    }

    return action
  }

  /**
   * Create a code action to ignore the issue
   */
  private createIgnoreAction(diagnostic: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Ignore this issue',
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.command = {
      command: 'jokalala.ignoreIssue',
      title: 'Ignore Issue',
      arguments: [diagnostic],
    }

    return action
  }

  /**
   * Create a code action to show documentation
   */
  private createShowDocumentationAction(
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Show documentation',
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.command = {
      command: 'jokalala.showDocumentation',
      title: 'Show Documentation',
      arguments: [diagnostic.code],
    }

    return action
  }

  /**
   * Truncate a string to a maximum length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str
    }
    return str.substring(0, maxLength - 3) + '...'
  }
}

/**
 * Register the code action provider
 */
export function registerCodeActionProvider(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const provider = new CodeAnalysisCodeActionProvider()

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
