/**
 * SARIF Exporter
 *
 * Exports analysis results in SARIF 2.1.0 format.
 * SARIF files can be uploaded to GitHub's Security tab via actions/upload-sarif,
 * enabling inline annotations on pull requests.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type { Issue } from '../interfaces/code-analysis-service.interface'

interface SarifResult {
  ruleId: string
  level: 'error' | 'warning' | 'note' | 'none'
  message: { text: string }
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId?: string }
      region: { startLine: number; startColumn?: number; endLine?: number }
    }
  }>
  properties?: { confidence?: number; source?: string }
}

interface SarifLog {
  version: '2.1.0'
  $schema: string
  runs: Array<{
    tool: {
      driver: {
        name: string
        version: string
        informationUri: string
        rules: Array<{ id: string; name: string; shortDescription: { text: string } }>
      }
    }
    results: SarifResult[]
    artifacts: Array<{ location: { uri: string; uriBaseId: string } }>
  }>
}

const SEVERITY_TO_SARIF: Record<string, SarifResult['level']> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'none',
}

export class SarifExporter {
  /**
   * Exports all current issues across open workspace files to a SARIF file.
   * Returns the path of the written file.
   */
  static async export(
    issuesByFile: Map<string, Issue[]>,
    outputDir: string
  ): Promise<string> {
    const rules = new Map<string, string>()
    const results: SarifResult[] = []
    const artifactUris = new Set<string>()

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''

    for (const [filePath, issues] of issuesByFile.entries()) {
      const relativeUri = vscode.workspace.asRelativePath(filePath, false)
      artifactUris.add(relativeUri)

      for (const issue of issues) {
        const ruleId = issue.category ?? 'UNKNOWN'
        if (!rules.has(ruleId)) {
          rules.set(ruleId, issue.message)
        }

        const startLine = issue.line ?? issue.location?.startLine ?? 1
        results.push({
          ruleId,
          level: SEVERITY_TO_SARIF[issue.severity] ?? 'warning',
          message: { text: issue.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: relativeUri, uriBaseId: '%SRCROOT%' },
                region: {
                  startLine,
                  startColumn: issue.location?.startColumn ?? 1,
                  endLine: issue.location?.endLine ?? startLine,
                },
              },
            },
          ],
          properties: {
            confidence: issue.priorityScore,
            source: issue.source,
          },
        })
      }
    }

    const sarif: SarifLog = {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'Jokalala Code Analyzer',
              version: '2.0.0',
              informationUri: 'https://jokalala.com/ai/code-analysis',
              rules: Array.from(rules.entries()).map(([id, desc]) => ({
                id,
                name: id,
                shortDescription: { text: desc },
              })),
            },
          },
          results,
          artifacts: Array.from(artifactUris).map(uri => ({
            location: { uri, uriBaseId: '%SRCROOT%' },
          })),
        },
      ],
    }

    const outputPath = path.join(outputDir, `jokalala-analysis-${Date.now()}.sarif`)
    fs.writeFileSync(outputPath, JSON.stringify(sarif, null, 2), 'utf8')
    return outputPath
  }
}

/**
 * Register the SARIF export command.
 * Usage: Jokalala: Export Analysis Report (SARIF)
 */
export function registerSarifExportCommand(
  context: vscode.ExtensionContext,
  getIssuesByFile: () => Map<string, Issue[]>
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.exportSarif', async () => {
      const issuesByFile = getIssuesByFile()
      if (issuesByFile.size === 0) {
        vscode.window.showWarningMessage('No analysis results to export. Run an analysis first.')
        return
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder open.')
        return
      }

      try {
        const outputPath = await SarifExporter.export(issuesByFile, workspaceRoot)
        const rel = vscode.workspace.asRelativePath(outputPath)

        const choice = await vscode.window.showInformationMessage(
          `SARIF report saved to ${rel}`,
          'Open File',
          'Copy Path'
        )
        if (choice === 'Open File') {
          vscode.window.showTextDocument(vscode.Uri.file(outputPath))
        } else if (choice === 'Copy Path') {
          vscode.env.clipboard.writeText(outputPath)
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to export SARIF: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  )
}
