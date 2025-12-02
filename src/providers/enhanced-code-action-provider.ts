/**
 * Enhanced Code Action Provider
 *
 * Provides intelligent code actions for V2 vulnerabilities:
 * - One-click fix application with preview
 * - Alternative fix options
 * - Mark as false positive
 * - Ignore rule
 * - Copy fix code
 */

import * as vscode from 'vscode'
import type { V2Vulnerability, V2Fix } from '../interfaces/v2-report.interface'
import { userFeedbackService } from '../services/user-feedback-service'
import { falsePositiveDetector } from '../utils/false-positive-detector'

/**
 * Vulnerability data stored with diagnostics
 */
interface DiagnosticData {
  vulnerability: V2Vulnerability
  documentUri: vscode.Uri
}

/**
 * Mapping of diagnostic codes to vulnerability data
 */
const diagnosticVulnerabilityMap = new Map<string, DiagnosticData>()

/**
 * Enhanced Code Action Provider for V2 vulnerabilities
 */
export class EnhancedCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor
  ]

  private outputChannel: vscode.OutputChannel

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Jokalala Code Actions')
  }

  /**
   * Store vulnerability data for a diagnostic
   */
  static registerVulnerability(
    diagnosticCode: string,
    vulnerability: V2Vulnerability,
    documentUri: vscode.Uri
  ): void {
    diagnosticVulnerabilityMap.set(diagnosticCode, {
      vulnerability,
      documentUri
    })
  }

  /**
   * Clear all registered vulnerabilities
   */
  static clearVulnerabilities(): void {
    diagnosticVulnerabilityMap.clear()
  }

  /**
   * Provide code actions for diagnostics
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

    // Get Jokalala diagnostics
    const diagnostics = context.diagnostics.filter(
      d => d.source === 'Jokalala Code Analysis' || d.source === 'jokalala'
    )

    for (const diagnostic of diagnostics) {
      const diagCode = String(diagnostic.code || '')
      const vulnData = diagnosticVulnerabilityMap.get(diagCode)

      if (vulnData?.vulnerability) {
        const vuln = vulnData.vulnerability
        const vulnActions = this.createVulnerabilityActions(
          document,
          diagnostic,
          vuln
        )
        actions.push(...vulnActions)
      } else {
        // Fallback for diagnostics without V2 data
        actions.push(...this.createBasicActions(document, diagnostic))
      }
    }

    return actions
  }

  /**
   * Create code actions for a V2 vulnerability
   */
  private createVulnerabilityActions(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    vuln: V2Vulnerability
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

    // 1. Primary fix action (if available)
    if (vuln.fix?.secureCode) {
      const primaryFix = this.createApplyFixAction(
        document,
        diagnostic,
        vuln,
        vuln.fix,
        true
      )
      if (primaryFix) {
        actions.push(primaryFix)
      }
    }

    // 2. Alternative fix actions
    if (vuln.fix?.alternatives && vuln.fix.alternatives.length > 0) {
      for (const alt of vuln.fix.alternatives) {
        const altFix = this.createAlternativeFixAction(
          document,
          diagnostic,
          vuln,
          alt
        )
        if (altFix) {
          actions.push(altFix)
        }
      }
    }

    // 3. Copy fix to clipboard
    if (vuln.fix?.secureCode) {
      actions.push(this.createCopyFixAction(vuln))
    }

    // 4. Mark as false positive
    actions.push(this.createMarkFalsePositiveAction(vuln, diagnostic))

    // 5. Accept vulnerability (confirm it's real)
    actions.push(this.createAcceptVulnerabilityAction(vuln, diagnostic))

    // 6. Show details
    actions.push(this.createShowDetailsAction(vuln))

    // 7. Ignore this rule
    actions.push(this.createIgnoreRuleAction(vuln))

    return actions
  }

  /**
   * Create action to apply primary fix
   */
  private createApplyFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    vuln: V2Vulnerability,
    fix: V2Fix,
    isPrimary: boolean
  ): vscode.CodeAction | undefined {
    const confidence = Math.round(vuln.confidence * 100)
    const title = isPrimary
      ? `Fix: ${fix.quickSummary} (${confidence}% confidence)`
      : `Alternative Fix: ${fix.quickSummary}`

    const action = new vscode.CodeAction(
      title,
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.isPreferred = isPrimary

    // Try to create workspace edit for the fix
    const edit = this.createFixEdit(document, diagnostic, vuln, fix)
    if (edit) {
      action.edit = edit
    } else {
      // Fallback to showing preview
      action.command = {
        command: 'jokalala.previewFix',
        title: 'Preview Fix',
        arguments: [vuln.id, fix]
      }
    }

    return action
  }

  /**
   * Create workspace edit for a fix
   */
  private createFixEdit(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    vuln: V2Vulnerability,
    fix: V2Fix
  ): vscode.WorkspaceEdit | undefined {
    if (!fix.vulnerableCode || !fix.secureCode) {
      return undefined
    }

    try {
      const vulnerableCode = fix.vulnerableCode.trim()
      const secureCode = fix.secureCode.trim()

      // Try to find the vulnerable code in the document
      const documentText = document.getText()
      const vulnerableIndex = documentText.indexOf(vulnerableCode)

      if (vulnerableIndex !== -1) {
        const startPos = document.positionAt(vulnerableIndex)
        const endPos = document.positionAt(vulnerableIndex + vulnerableCode.length)
        const range = new vscode.Range(startPos, endPos)

        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, range, secureCode)
        return edit
      }

      // If exact match not found, use the diagnostic range
      // and provide the secure code as replacement
      const edit = new vscode.WorkspaceEdit()
      edit.replace(document.uri, diagnostic.range, secureCode)
      return edit

    } catch (error) {
      this.outputChannel.appendLine(`[Fix] Error creating edit: ${error}`)
      return undefined
    }
  }

  /**
   * Create action for alternative fix
   */
  private createAlternativeFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    vuln: V2Vulnerability,
    alternative: NonNullable<V2Fix['alternatives']>[number]
  ): vscode.CodeAction | undefined {
    const title = `Alternative: ${alternative.approach}`
    const action = new vscode.CodeAction(
      title,
      vscode.CodeActionKind.Refactor
    )

    action.diagnostics = [diagnostic]

    // Create alternative fix
    const altFix: V2Fix = {
      language: vuln.fix?.language || 'unknown',
      languageConfidence: vuln.fix?.languageConfidence || 0.5,
      quickSummary: alternative.approach,
      detailedExplanation: alternative.pros,
      vulnerableCode: vuln.fix?.vulnerableCode || '',
      secureCode: alternative.code
    }

    const edit = this.createFixEdit(document, diagnostic, vuln, altFix)
    if (edit) {
      action.edit = edit
    } else {
      action.command = {
        command: 'jokalala.showAlternative',
        title: 'Show Alternative',
        arguments: [vuln.id, alternative]
      }
    }

    return action
  }

  /**
   * Create action to copy fix to clipboard
   */
  private createCopyFixAction(vuln: V2Vulnerability): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Copy fix code to clipboard',
      vscode.CodeActionKind.QuickFix
    )

    action.command = {
      command: 'jokalala.copyFix',
      title: 'Copy Fix',
      arguments: [vuln.id, vuln.fix?.secureCode || '', vuln.fix?.quickSummary || '']
    }

    return action
  }

  /**
   * Create action to mark as false positive
   */
  private createMarkFalsePositiveAction(
    vuln: V2Vulnerability,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Mark as false positive',
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.command = {
      command: 'jokalala.markFalsePositive',
      title: 'Mark False Positive',
      arguments: [vuln]
    }

    return action
  }

  /**
   * Create action to accept vulnerability
   */
  private createAcceptVulnerabilityAction(
    vuln: V2Vulnerability,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Confirm as real vulnerability',
      vscode.CodeActionKind.QuickFix
    )

    action.diagnostics = [diagnostic]
    action.command = {
      command: 'jokalala.acceptVulnerability',
      title: 'Accept Vulnerability',
      arguments: [vuln]
    }

    return action
  }

  /**
   * Create action to show vulnerability details
   */
  private createShowDetailsAction(vuln: V2Vulnerability): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Show vulnerability details',
      vscode.CodeActionKind.QuickFix
    )

    action.command = {
      command: 'jokalala.showVulnerabilityDetails',
      title: 'Show Details',
      arguments: [vuln]
    }

    return action
  }

  /**
   * Create action to ignore rule
   */
  private createIgnoreRuleAction(vuln: V2Vulnerability): vscode.CodeAction {
    const ruleType = vuln.primaryIssue?.type || 'unknown'
    const action = new vscode.CodeAction(
      `Ignore all "${ruleType}" findings`,
      vscode.CodeActionKind.QuickFix
    )

    action.command = {
      command: 'jokalala.ignoreRule',
      title: 'Ignore Rule',
      arguments: [ruleType]
    }

    return action
  }

  /**
   * Create basic actions for diagnostics without V2 data
   */
  private createBasicActions(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

    // Show documentation
    const docAction = new vscode.CodeAction(
      'Show documentation',
      vscode.CodeActionKind.QuickFix
    )
    docAction.diagnostics = [diagnostic]
    docAction.command = {
      command: 'jokalala.showDocumentation',
      title: 'Show Documentation',
      arguments: [diagnostic.code]
    }
    actions.push(docAction)

    // Ignore issue
    const ignoreAction = new vscode.CodeAction(
      'Ignore this issue',
      vscode.CodeActionKind.QuickFix
    )
    ignoreAction.diagnostics = [diagnostic]
    ignoreAction.command = {
      command: 'jokalala.ignoreIssue',
      title: 'Ignore Issue',
      arguments: [diagnostic]
    }
    actions.push(ignoreAction)

    return actions
  }
}

/**
 * Register code action commands
 */
export function registerCodeActionCommands(
  context: vscode.ExtensionContext
): void {
  // Copy fix to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.copyFix',
      async (vulnId: string, fixCode: string, fixSummary: string) => {
        await vscode.env.clipboard.writeText(fixCode)
        vscode.window.showInformationMessage(
          `Fix code copied: ${fixSummary}`
        )

        // Record feedback
        userFeedbackService.recordCopiedFix(
          vulnId,
          'unknown', // Would need vuln type
          'unknown', // Would need severity
          0.5,       // Would need confidence
          fixSummary
        )
      }
    )
  )

  // Mark as false positive
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.markFalsePositive',
      async (vuln: V2Vulnerability) => {
        // Add to false positive list
        falsePositiveDetector.suppressVulnerability(vuln.id)

        // Record feedback
        userFeedbackService.recordRejected(
          vuln.id,
          vuln.primaryIssue?.type || 'unknown',
          vuln.severity,
          vuln.confidence,
          vuln.fix?.language,
          'User marked as false positive'
        )

        vscode.window.showInformationMessage(
          `Marked "${vuln.primaryIssue?.title}" as false positive`
        )

        // Trigger re-analysis to update view
        vscode.commands.executeCommand('jokalala-code-analysis.analyzeFile')
      }
    )
  )

  // Accept vulnerability
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.acceptVulnerability',
      (vuln: V2Vulnerability) => {
        // Record feedback
        userFeedbackService.recordAccepted(
          vuln.id,
          vuln.primaryIssue?.type || 'unknown',
          vuln.severity,
          vuln.confidence,
          vuln.fix?.language
        )

        vscode.window.showInformationMessage(
          `Confirmed "${vuln.primaryIssue?.title}" as real vulnerability`
        )
      }
    )
  )

  // Show vulnerability details
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showVulnerabilityDetails',
      (vuln: V2Vulnerability) => {
        const panel = vscode.window.createWebviewPanel(
          'vulnDetails',
          `Vulnerability: ${vuln.primaryIssue?.title}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        )

        panel.webview.html = generateVulnerabilityDetailsHtml(vuln)
      }
    )
  )

  // Preview fix
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.previewFix',
      async (vulnId: string, fix: V2Fix) => {
        const panel = vscode.window.createWebviewPanel(
          'fixPreview',
          `Fix Preview: ${fix.quickSummary}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        )

        panel.webview.html = generateFixPreviewHtml(fix)
      }
    )
  )

  // Show alternative
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showAlternative',
      async (vulnId: string, alternative: NonNullable<V2Fix['alternatives']>[number]) => {
        const result = await vscode.window.showInformationMessage(
          `Alternative: ${alternative.approach}`,
          { modal: true, detail: `Pros: ${alternative.pros.join(', ')}\nCons: ${alternative.cons.join(', ')}` },
          'Copy Code',
          'Cancel'
        )

        if (result === 'Copy Code') {
          await vscode.env.clipboard.writeText(alternative.code)
          vscode.window.showInformationMessage('Alternative code copied to clipboard')
        }
      }
    )
  )

  // Ignore rule
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.ignoreRule',
      async (ruleType: string) => {
        const config = vscode.workspace.getConfiguration('jokalala')
        const ignoredRules = config.get<string[]>('ignoredRules', [])

        if (!ignoredRules.includes(ruleType)) {
          ignoredRules.push(ruleType)
          await config.update('ignoredRules', ignoredRules, vscode.ConfigurationTarget.Workspace)
        }

        vscode.window.showInformationMessage(
          `Rule "${ruleType}" will be ignored in future analyses`
        )

        // Trigger re-analysis
        vscode.commands.executeCommand('jokalala-code-analysis.analyzeFile')
      }
    )
  )
}

/**
 * Generate HTML for vulnerability details webview
 */
function generateVulnerabilityDetailsHtml(vuln: V2Vulnerability): string {
  const confidence = Math.round(vuln.confidence * 100)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    h1 { color: var(--vscode-editor-foreground); }
    .severity-critical { color: #f44336; font-weight: bold; }
    .severity-high { color: #ff9800; font-weight: bold; }
    .severity-medium { color: #ffc107; }
    .severity-low { color: #4caf50; }
    .section { margin: 20px 0; padding: 15px; background: var(--vscode-editor-background); border-radius: 5px; }
    .section h2 { margin-top: 0; font-size: 16px; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 10px; overflow-x: auto; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; margin-right: 5px; }
    .confidence { background: #2196f3; color: white; }
    .cwe { background: #9c27b0; color: white; }
    .owasp { background: #ff5722; color: white; }
  </style>
</head>
<body>
  <h1>${vuln.primaryIssue?.title || 'Unknown Vulnerability'}</h1>

  <div>
    <span class="badge severity-${vuln.severity.toLowerCase()}">${vuln.severity}</span>
    <span class="badge confidence">${confidence}% confidence</span>
    ${vuln.standards?.cwe ? `<span class="badge cwe">${vuln.standards.cwe}</span>` : ''}
    ${vuln.standards?.owasp ? `<span class="badge owasp">${vuln.standards.owasp}</span>` : ''}
  </div>

  <div class="section">
    <h2>Description</h2>
    <p>${vuln.primaryIssue?.description || 'No description available'}</p>
  </div>

  ${vuln.impact?.security ? `
  <div class="section">
    <h2>Security Impact</h2>
    <p>${vuln.impact.security}</p>
  </div>
  ` : ''}

  ${vuln.affectedCode?.snippet ? `
  <div class="section">
    <h2>Vulnerable Code</h2>
    <pre><code>${escapeHtml(vuln.affectedCode.snippet)}</code></pre>
  </div>
  ` : ''}

  ${vuln.fix?.secureCode ? `
  <div class="section">
    <h2>Recommended Fix (${vuln.fix.language})</h2>
    <p>${vuln.fix.quickSummary}</p>
    <pre><code>${escapeHtml(vuln.fix.secureCode)}</code></pre>
  </div>
  ` : ''}

  ${vuln.fix?.alternatives && vuln.fix.alternatives.length > 0 ? `
  <div class="section">
    <h2>Alternative Approaches</h2>
    ${vuln.fix.alternatives.map(alt => `
      <h3>${alt.approach}</h3>
      <p><strong>Pros:</strong> ${alt.pros.join(', ')}</p>
      <p><strong>Cons:</strong> ${alt.cons.join(', ')}</p>
      <pre><code>${escapeHtml(alt.code)}</code></pre>
    `).join('')}
  </div>
  ` : ''}

  ${vuln.intelligence?.cisaKEV?.knownExploited ? `
  <div class="section" style="background: #ffebee;">
    <h2>⚠️ Known Exploited Vulnerability</h2>
    <p>This vulnerability is in the CISA Known Exploited Vulnerabilities catalog.</p>
    ${vuln.intelligence.cisaKEV.dateAdded ? `<p>Added: ${vuln.intelligence.cisaKEV.dateAdded}</p>` : ''}
  </div>
  ` : ''}

  ${vuln.intelligence?.epssScore !== undefined ? `
  <div class="section">
    <h2>EPSS Score</h2>
    <p>${Math.round(vuln.intelligence.epssScore * 100)}% probability of exploitation</p>
  </div>
  ` : ''}
</body>
</html>`
}

/**
 * Generate HTML for fix preview webview
 */
function generateFixPreviewHtml(fix: V2Fix): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    h1 { color: var(--vscode-editor-foreground); }
    .section { margin: 20px 0; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 10px; overflow-x: auto; }
    .vulnerable { border-left: 4px solid #f44336; }
    .secure { border-left: 4px solid #4caf50; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Fix: ${fix.quickSummary}</h1>
  <p>Language: ${fix.language} (${Math.round(fix.languageConfidence * 100)}% confidence)</p>

  <div class="section">
    <h2>🔴 Vulnerable Code</h2>
    <pre class="vulnerable"><code>${escapeHtml(fix.vulnerableCode || 'N/A')}</code></pre>
  </div>

  <div class="section">
    <h2>✅ Secure Code</h2>
    <pre class="secure"><code>${escapeHtml(fix.secureCode || 'N/A')}</code></pre>
  </div>

  ${fix.detailedExplanation && fix.detailedExplanation.length > 0 ? `
  <div class="section">
    <h2>Explanation</h2>
    <ul>
      ${fix.detailedExplanation.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
    </ul>
  </div>
  ` : ''}
</body>
</html>`
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Register the enhanced code action provider
 */
export function registerEnhancedCodeActionProvider(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const provider = new EnhancedCodeActionProvider()

  const registration = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    provider,
    {
      providedCodeActionKinds: EnhancedCodeActionProvider.providedCodeActionKinds
    }
  )

  context.subscriptions.push(registration)

  // Register commands
  registerCodeActionCommands(context)

  return registration
}
