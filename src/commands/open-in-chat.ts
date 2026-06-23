/**
 * Open in Dev Chat Command
 *
 * Sends a finding from the VS Code extension to the Jokalala web Dev Chat.
 * Uses a base64-encoded context param so the chat page can pre-populate
 * the input with the finding details.
 *
 * Deep-link: https://jokalala.com/ai/chat?context=<base64>
 */

import * as vscode from 'vscode'
import type { Issue } from '../interfaces/code-analysis-service.interface'

const WEB_APP_BASE = 'https://jokalala.com'

export function registerOpenInChatCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.openInDevChat',
      async (issue: Issue, filePath?: string) => {
        const ctx = {
          type: 'vscode-finding',
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion,
          file: filePath ? vscode.workspace.asRelativePath(filePath, false) : undefined,
          line: issue.line ?? issue.location?.startLine,
        }

        const encoded = Buffer.from(JSON.stringify(ctx)).toString('base64')
        const url = vscode.Uri.parse(
          `${WEB_APP_BASE}/ai/chat?context=${encodeURIComponent(encoded)}`
        )

        await vscode.env.openExternal(url)
      }
    )
  )
}
