import * as vscode from 'vscode'

/**
 * Provides code actions for submitting feedback on analysis results
 */
export class FeedbackCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ]

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    // Only provide feedback actions for Jokalala diagnostics
    const jokalaDiagnostics = context.diagnostics.filter(
      diagnostic => diagnostic.source === 'Jokalala Code Analysis'
    )

    if (jokalaDiagnostics.length === 0) {
      return undefined
    }

    const actions: vscode.CodeAction[] = []

    for (const diagnostic of jokalaDiagnostics) {
      // Add "This was helpful" action
      const helpfulAction = new vscode.CodeAction(
        '👍 Mark as Helpful',
        vscode.CodeActionKind.QuickFix
      )
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
      }
      actions.push(helpfulAction)

      // Add "Report false positive" action
      const falsePositiveAction = new vscode.CodeAction(
        '❌ Report False Positive',
        vscode.CodeActionKind.QuickFix
      )
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
      }
      actions.push(falsePositiveAction)

      // Add general feedback action
      const feedbackAction = new vscode.CodeAction(
        '💬 Provide Detailed Feedback',
        vscode.CodeActionKind.QuickFix
      )
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
      }
      actions.push(feedbackAction)
    }

    return actions
  }

  private mapSeverity(
    severity: vscode.DiagnosticSeverity
  ): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'critical'
      case vscode.DiagnosticSeverity.Warning:
        return 'medium'
      case vscode.DiagnosticSeverity.Information:
        return 'low'
      case vscode.DiagnosticSeverity.Hint:
        return 'low'
      default:
        return 'medium'
    }
  }
}
