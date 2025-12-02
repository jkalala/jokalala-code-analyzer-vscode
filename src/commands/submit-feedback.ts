import * as vscode from 'vscode'
import axios from 'axios'

export interface FeedbackOptions {
  language: string
  issueCategory: string
  issueType: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  source: 'static' | 'llm'
  issueDescription: string
  analysisMode: 'quick' | 'deep' | 'full'
  codeSnippet?: string
  location?: {
    file?: string
    line?: number
  }
}

export async function registerFeedbackCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'jokalala-code-analysis.submitFeedback',
    async (options?: FeedbackOptions) => {
      try {
        // If no options provided, show input dialogs
        if (!options) {
          const editor = vscode.window.activeTextEditor
          if (!editor) {
            vscode.window.showErrorMessage('No active editor found')
            return
          }

          // Get issue type from user
          const issueType = await vscode.window.showInputBox({
            prompt: 'Enter the issue type you want to provide feedback on',
            placeHolder: 'e.g., SQL Injection, Memory Leak',
          })

          if (!issueType) {
            return
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
          }
        }

        // Ask for feedback type
        const feedbackType = await vscode.window.showQuickPick(
          [
            { label: 'Helpful', value: 'helpful', description: 'This issue was accurately identified and useful' },
            { label: 'Not Helpful', value: 'not-helpful', description: 'This issue was not useful to me' },
            { label: 'False Positive', value: 'false-positive', description: 'This is not actually an issue' },
            { label: 'Missed Issue', value: 'missed-issue', description: 'Analysis missed an important issue' },
          ],
          {
            placeHolder: 'How would you rate this analysis result?',
          }
        )

        if (!feedbackType) {
          return
        }

        // Ask for accuracy rating
        const accuracyChoice = await vscode.window.showQuickPick(
          [
            { label: '⭐ Very Inaccurate', value: '1' },
            { label: '⭐⭐ Somewhat Inaccurate', value: '2' },
            { label: '⭐⭐⭐ Neutral', value: '3' },
            { label: '⭐⭐⭐⭐ Mostly Accurate', value: '4' },
            { label: '⭐⭐⭐⭐⭐ Very Accurate', value: '5' },
          ],
          {
            placeHolder: 'How accurate was this analysis?',
          }
        )

        if (!accuracyChoice) {
          return
        }

        // Optional comment
        const userComment = await vscode.window.showInputBox({
          prompt: 'Any additional comments? (Optional)',
          placeHolder: 'Tell us more about your experience...',
        })

        // Get API endpoint from settings
        const config = vscode.workspace.getConfiguration('jokalala')
        const apiEndpoint = config.get<string>('apiEndpoint')
        const apiKey = config.get<string>('apiKey')

        if (!apiEndpoint) {
          vscode.window.showErrorMessage('API endpoint not configured')
          return
        }

        // Submit feedback
        const response = await axios.post(
          `${apiEndpoint}/analysis-feedback`,
          {
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
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
          }
        )

        if (response.data.success) {
          vscode.window.showInformationMessage(
            'Thank you for your feedback! Your input helps improve the analysis quality.'
          )
        } else {
          throw new Error(response.data.error?.message || 'Failed to submit feedback')
        }
      } catch (error: any) {
        console.error('[Feedback Command] Error:', error)
        vscode.window.showErrorMessage(`Failed to submit feedback: ${error.message}`)
      }
    }
  )

  context.subscriptions.push(disposable)
}
