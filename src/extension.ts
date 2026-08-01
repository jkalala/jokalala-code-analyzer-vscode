import { randomUUID } from 'crypto'
import * as path from 'path'
import * as vscode from 'vscode'
import { registerFeedbackCommand } from './commands/submit-feedback'
import {
  AnalysisResult,
  FileAnalysisResult,
  Issue,
} from './interfaces/code-analysis-service.interface'
import { ExtensionSettings } from './interfaces/configuration-service.interface'
import type { V2AnalysisReport } from './interfaces/v2-report.interface'
import {
  AnalysisSummaryData,
  IssuesTreeProvider,
} from './providers/issues-tree-provider'
import { MetricsTreeProvider } from './providers/metrics-tree-provider'
import { RecommendationsTreeProvider } from './providers/recommendations-tree-provider'
import { CVETreeProvider, registerCVETreeView } from './providers/cve-tree-provider'
import { RefactoringTreeProvider, registerRefactoringTreeView } from './providers/refactoring-tree-provider'
import { SCATreeProvider, registerSCATreeView } from './providers/sca-tree-provider'
import { ContainerIaCTreeProvider, registerContainerIaCTreeView } from './providers/container-iac-tree-provider'
import { PluginsTreeProvider, registerPluginsTreeView, registerPluginCommands } from './providers/plugins-tree-provider'
import { registerEnhancedCodeActionProvider } from './providers/enhanced-code-action-provider'
import { debounce } from './utils/debounce'
import { AuthService } from './services/auth-service'
import { CodeAnalysisService } from './services/code-analysis-service'
import { ConfigurationService } from './services/configuration-service'
import { SecurityService } from './services/security-service'
import { DiagnosticsManager } from './services/diagnostics-manager'
import { Logger } from './services/logger'
import { CVEService, CVEMatch, CVEFix } from './services/cve-service'
import { RefactoringService, RefactoringIssue } from './services/refactoring-service'
import { SCAService, SCAVulnerability } from './services/sca-service'
import { ContainerIaCService, ContainerIaCIssue, ScanType } from './services/container-iac-service'
import { userFeedbackService } from './services/user-feedback-service'
import { qualityGate } from './utils/quality-gate'
import { falsePositiveDetector } from './utils/false-positive-detector'
import { intelligencePrioritizer } from './utils/intelligence-prioritizer'

let authService: AuthService
let securityService: SecurityService
let diagnosticsManager: DiagnosticsManager
let codeAnalysisService: CodeAnalysisService
let configurationService: ConfigurationService
let issuesTreeProvider: IssuesTreeProvider
let recommendationsTreeProvider: RecommendationsTreeProvider
let metricsTreeProvider: MetricsTreeProvider
let cveTreeProvider: CVETreeProvider
let cveService: CVEService
let refactoringTreeProvider: RefactoringTreeProvider
let refactoringService: RefactoringService
let scaTreeProvider: SCATreeProvider
let scaService: SCAService
let containerIaCTreeProvider: ContainerIaCTreeProvider
let containerIaCService: ContainerIaCService
let pluginsTreeProvider: PluginsTreeProvider
let logger: Logger
let statusBarItem: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext) {
  logger = new Logger()
  logger.info('Activating Jokalala Code Analysis extension')

  try {
    // Auth — initialize first so token is available for all API calls
    authService = new AuthService(context)
    await authService.initialize()

    // Register URI handler for VS Code deep-link callback
    // vscode://jokalala.code-analyzer/auth?token=<jwt>
    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri(uri: vscode.Uri) {
          if (uri.path === '/auth') {
            authService.handleAuthCallback(uri)
          }
        },
      })
    )

    // Register sign-in / sign-out commands
    context.subscriptions.push(
      vscode.commands.registerCommand('jokalala.signIn', () => authService.signIn()),
      vscode.commands.registerCommand('jokalala.signOut', () => authService.signOut()),
    )

    securityService = new SecurityService(context)

    // Register API key commands (SecretStorage-backed; supersedes the
    // deprecated plaintext jokalala.apiKey setting)
    context.subscriptions.push(
      vscode.commands.registerCommand('jokalala.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
          prompt: 'Enter your Jokalala API key',
          placeHolder: 'jkl_...',
          password: true,
          ignoreFocusOut: true,
          validateInput: value =>
            value && value.trim().length > 0
              ? undefined
              : 'API key cannot be empty',
        })
        if (!key) return

        try {
          await securityService.storeApiKey(key)
          vscode.window.showInformationMessage(
            'Jokalala API key saved securely.'
          )
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to save API key: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }),
      vscode.commands.registerCommand('jokalala.clearApiKey', async () => {
        await securityService.deleteApiKey()
        vscode.window.showInformationMessage('Jokalala API key cleared.')
      })
    )

    configurationService = new ConfigurationService()
    diagnosticsManager = new DiagnosticsManager()
    codeAnalysisService = new CodeAnalysisService(
      configurationService,
      logger,
      authService,
      securityService
    )
    issuesTreeProvider = new IssuesTreeProvider()
    recommendationsTreeProvider = new RecommendationsTreeProvider()
    metricsTreeProvider = new MetricsTreeProvider()
    cveTreeProvider = new CVETreeProvider()
    cveService = new CVEService(configurationService, logger, authService, securityService)
    refactoringTreeProvider = new RefactoringTreeProvider()
    refactoringService = new RefactoringService(
      configurationService,
      logger,
      authService,
      securityService
    )
    scaTreeProvider = new SCATreeProvider()
    scaService = new SCAService(configurationService, logger, authService, securityService)
    containerIaCTreeProvider = new ContainerIaCTreeProvider()
    containerIaCService = new ContainerIaCService(configurationService, logger)
    pluginsTreeProvider = new PluginsTreeProvider()

    await ensurePersistentIdentifiers(context)

    // Offer to migrate a legacy plaintext jokalala.apiKey setting to SecretStorage
    await securityService.migrateApiKeyFromSettings()

    // Initialize user feedback service
    userFeedbackService.initialize(context)

    // Load any saved false positive suppressions
    const savedSuppressions = context.globalState.get<string[]>('jokalala.suppressedVulnerabilities', [])
    falsePositiveDetector.loadSuppressions(savedSuppressions)

    const configWatcher = configurationService.watch(changes => {
      logger.info('Configuration updated', changes)
    })
    context.subscriptions.push(configWatcher)

    await validateConfiguration()

    logger.info('All services initialized successfully')
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    logger.error('Error initializing services', errorObj)
    vscode.window.showErrorMessage(
      `Jokalala initialization error: ${errorObj.message}`
    )
    return
  }

  // Create and register tree views
  const issuesTreeView = vscode.window.createTreeView('jokalala-issues', {
    treeDataProvider: issuesTreeProvider,
    showCollapseAll: true,
  })
  context.subscriptions.push(issuesTreeView)

  const recommendationsTreeView = vscode.window.createTreeView(
    'jokalala-recommendations',
    {
      treeDataProvider: recommendationsTreeProvider,
    }
  )
  context.subscriptions.push(recommendationsTreeView)

  const metricsTreeView = vscode.window.createTreeView('jokalala-metrics', {
    treeDataProvider: metricsTreeProvider,
  })
  context.subscriptions.push(metricsTreeView)

  // Register CVE tree view
  const cveTreeView = registerCVETreeView(context, cveTreeProvider)
  context.subscriptions.push(cveTreeView)

  // Register Refactoring tree view
  const refactoringTreeView = registerRefactoringTreeView(context, refactoringTreeProvider)
  context.subscriptions.push(refactoringTreeView)

  // Register SCA tree view
  const scaTreeView = registerSCATreeView(context, scaTreeProvider)
  context.subscriptions.push(scaTreeView)

  // Register Container/IaC tree view
  const containerIaCTreeView = registerContainerIaCTreeView(context, containerIaCTreeProvider)
  context.subscriptions.push(containerIaCTreeView)

  // Register Plugins & Custom Rules tree view
  await pluginsTreeProvider.initialize(context)
  const pluginsTreeView = registerPluginsTreeView(context, pluginsTreeProvider)
  context.subscriptions.push(pluginsTreeView)
  registerPluginCommands(context, pluginsTreeProvider)

  console.log('Jokalala: Tree views created and registered')

  // Register enhanced code action provider for one-click fixes
  registerEnhancedCodeActionProvider(context)
  console.log('Jokalala: Enhanced code action provider registered')

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.analyzeFile',
      analyzeCurrentFile
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.analyzeSelection',
      analyzeSelection
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.analyzeProject',
      analyzeProject
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.clearCache',
      clearCache
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.showSettings',
      showSettings
    )
  )

  registerFeedbackCommand(context)

  // Register command to navigate to an issue in the code
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.goToIssue',
      async (uri: vscode.Uri, line: number, column: number) => {
        try {
          const document = await vscode.workspace.openTextDocument(uri)
          const editor = await vscode.window.showTextDocument(document)

          // Navigate to the line and column (0-indexed for VS Code)
          const position = new vscode.Position(
            Math.max(0, line - 1),
            Math.max(0, column)
          )
          editor.selection = new vscode.Selection(position, position)
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          )
        } catch (error) {
          logger.error('Failed to navigate to issue', error as Error)
          vscode.window.showErrorMessage(
            'Failed to open file at issue location'
          )
        }
      }
    )
  )

  // Register command to toggle view mode (by file / by severity)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala-code-analysis.toggleViewMode',
      () => {
        const currentMode = issuesTreeProvider.getViewMode()
        const newMode = currentMode === 'byFile' ? 'bySeverity' : 'byFile'
        issuesTreeProvider.setViewMode(newMode)
        vscode.window.showInformationMessage(
          `Issues view mode: ${newMode === 'byFile' ? 'Group by File' : 'Group by Severity'}`
        )
      }
    )
  )

  // Register CVE-related commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.searchCVE',
      async () => {
        if (!(await ensureCloudAuthOrPrompt('CVE search'))) {
          return
        }

        const query = await vscode.window.showInputBox({
          prompt: 'Search for CVE/CWE vulnerabilities',
          placeHolder: 'e.g., SQL injection, XSS, CWE-89'
        })

        if (!query) return

        const editor = vscode.window.activeTextEditor
        const language = editor?.document.languageId || 'javascript'

        cveTreeProvider.setLoading(true)

        try {
          const response = await cveService.searchCVEs(query, language)

          if (response.success && response.data) {
            cveTreeProvider.updateMatches(
              response.data.matches,
              response.data.recommendations
            )

            if (response.data.matches.length === 0) {
              vscode.window.showInformationMessage('No CVE matches found for your query')
            } else {
              vscode.window.showInformationMessage(
                `Found ${response.data.matches.length} CVE match(es)`
              )
            }
          } else {
            cveTreeProvider.setError(response.error || 'CVE lookup failed')
            vscode.window.showErrorMessage(`CVE lookup failed: ${response.error || 'unknown error'}`)
          }
        } catch (error: any) {
          cveTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`CVE lookup failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanForCVEs',
      async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        if (!(await ensureCloudAuthOrPrompt('CVE scan'))) {
          return
        }

        const code = editor.document.getText()
        const language = editor.document.languageId

        cveTreeProvider.setLoading(true)

        try {
          const response = await cveService.analyzeCodeForCVEs(code, language)

          if (response.success && response.data) {
            cveTreeProvider.updateMatches(
              response.data.matches,
              response.data.recommendations
            )

            if (response.data.matches.length === 0) {
              vscode.window.showInformationMessage('No CVE vulnerabilities detected in current file')
            } else {
              const critical = response.data.matches.filter(m => m.severity === 'CRITICAL').length
              const high = response.data.matches.filter(m => m.severity === 'HIGH').length

              let message = `Found ${response.data.matches.length} potential CVE match(es)`
              if (critical > 0) message += ` (${critical} CRITICAL)`
              if (high > 0) message += ` (${high} HIGH)`

              vscode.window.showWarningMessage(message)
            }
          } else {
            cveTreeProvider.setError(response.error || 'CVE scan failed')
            vscode.window.showErrorMessage(`CVE scan failed: ${response.error || 'unknown error'}`)
          }
        } catch (error: any) {
          cveTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`CVE scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showCVEDetails',
      (match: CVEMatch) => {
        cveService.showCVEDetails(match)
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.applyCVEFix',
      async (fix: CVEFix, match: CVEMatch) => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        // Show confirmation
        const result = await vscode.window.showInformationMessage(
          `Apply fix for ${match.title}?`,
          { modal: true, detail: fix.description },
          'Apply Fix',
          'Preview Only'
        )

        if (result === 'Apply Fix') {
          const success = await cveService.applyFix(
            editor.document,
            editor.selection,
            fix
          )

          if (success) {
            // Re-scan after fix
            vscode.commands.executeCommand('jokalala.scanForCVEs')
          }
        } else if (result === 'Preview Only') {
          cveService.showCVEDetails(match)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.clearCVEResults',
      () => {
        cveTreeProvider.clear()
        vscode.window.showInformationMessage('CVE results cleared')
      }
    )
  )

  // Register Refactoring commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.analyzeRefactoring',
      async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        // Refactoring is cloud-only with no local fallback — warn up front
        // instead of silently sending an unauthenticated request.
        if (!(await ensureCloudAuthOrPrompt('Refactoring analysis'))) {
          return
        }

        const document = editor.document
        refactoringTreeProvider.setLoading(true)

        try {
          const response = await refactoringService.fullAnalysis(document, {
            projectType: 'unknown',
          })

          if (!response.success || !response.data) {
            refactoringTreeProvider.setError(response.error || 'Analysis failed')
            vscode.window.showErrorMessage(`Refactoring analysis failed: ${response.error}`)
            return
          }

          const result = response.data
          refactoringTreeProvider.updateResult(result)

          if (result.issues.length === 0) {
            vscode.window.showInformationMessage('No refactoring issues found!')
          } else {
            const autoFixable = result.summary.autoFixableCount
            let message = `Found ${result.issues.length} refactoring issue(s)`
            if (autoFixable > 0) {
              message += ` (${autoFixable} auto-fixable)`
            }
            message += ` - Health Score: ${result.analysis.overallHealthScore}/100`
            vscode.window.showInformationMessage(message)
          }
        } catch (error: any) {
          refactoringTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Refactoring analysis failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.quickFix',
      async (issue?: RefactoringIssue) => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        // If no issue provided, get the issue at current cursor position
        if (!issue) {
          const result = refactoringTreeProvider.getResult()
          if (!result || result.issues.length === 0) {
            vscode.window.showInformationMessage('Run "Analyze for Refactoring" first')
            return
          }

          const cursorLine = editor.selection.active.line + 1
          issue = result.issues.find(
            i => i.location.startLine <= cursorLine && i.location.endLine >= cursorLine
          )

          if (!issue) {
            vscode.window.showInformationMessage('No issue at cursor position')
            return
          }
        }

        if (!issue.autoFixable) {
          vscode.window.showWarningMessage('This issue cannot be auto-fixed')
          return
        }

        try {
          const response = await refactoringService.quickFix(editor.document, issue.id)

          if (response.success && response.data && response.data.issues.length > 0) {
            const fixedIssue = response.data.issues[0]
            if (fixedIssue?.refactoredCode) {
              const success = await refactoringService.applyFix(
                editor.document,
                fixedIssue
              )

              if (success) {
                vscode.window.showInformationMessage(`Fixed: ${issue.title}`)
                // Re-analyze after fix
                vscode.commands.executeCommand('jokalala.analyzeRefactoring')
              }
            } else {
              vscode.window.showWarningMessage('No fix available for this issue')
            }
          } else {
            vscode.window.showWarningMessage(response.error || 'No fix available for this issue')
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`Quick fix failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.batchRefactor',
      async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        const result = refactoringTreeProvider.getResult()
        if (!result || result.issues.length === 0) {
          vscode.window.showInformationMessage('No issues to fix. Run "Analyze for Refactoring" first.')
          return
        }

        const autoFixableIssues = result.issues.filter(i => i.autoFixable)
        if (autoFixableIssues.length === 0) {
          vscode.window.showInformationMessage('No auto-fixable issues found')
          return
        }

        const confirmation = await vscode.window.showInformationMessage(
          `Apply ${autoFixableIssues.length} auto-fixable refactoring(s)?`,
          { modal: true },
          'Apply All',
          'Preview First'
        )

        if (confirmation === 'Apply All') {
          try {
            const fixedCount = await refactoringService.applyAllAutoFixes(
              editor.document,
              autoFixableIssues
            )

            vscode.window.showInformationMessage(`Applied ${fixedCount} fix(es)`)
            // Re-analyze after fixes
            vscode.commands.executeCommand('jokalala.analyzeRefactoring')
          } catch (error: any) {
            vscode.window.showErrorMessage(`Batch refactor failed: ${error.message}`)
          }
        } else if (confirmation === 'Preview First') {
          // Show diff preview
          if (result.refactoringPreview) {
            await refactoringService.showDiffPreview(editor.document, result.refactoringPreview)
          } else {
            vscode.window.showInformationMessage('No preview available')
          }
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showRefactoringDetails',
      (issue: RefactoringIssue) => {
        refactoringService.showIssueDetails(issue)
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.applyRefactoringFix',
      async (issue: RefactoringIssue) => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        if (!issue.autoFixable || !issue.refactoredCode) {
          vscode.window.showWarningMessage('This issue cannot be auto-fixed')
          return
        }

        const success = await refactoringService.applyFix(editor.document, issue)
        if (success) {
          vscode.window.showInformationMessage(`Fixed: ${issue.title}`)
          // Re-analyze after fix
          vscode.commands.executeCommand('jokalala.analyzeRefactoring')
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.previewRefactoringDiff',
      async (issue: RefactoringIssue) => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showErrorMessage('No active editor')
          return
        }

        if (!issue.refactoredCode) {
          vscode.window.showWarningMessage('No refactored code available for this issue')
          return
        }

        // Create a preview for just this issue
        const preview = {
          fullFileBefore: editor.document.getText(),
          fullFileAfter: issue.refactoredCode,
          diff: `--- Original\n+++ Refactored\n@@ -${issue.location.startLine},1 +${issue.location.startLine},1 @@\n-${issue.originalCode}\n+${issue.refactoredCode}`,
        }

        await refactoringService.showDiffPreview(editor.document, preview)
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.clearRefactoringResults',
      () => {
        refactoringTreeProvider.clear()
        vscode.window.showInformationMessage('Refactoring results cleared')
      }
    )
  )

  // Register SCA (Software Composition Analysis) commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanDependencies',
      async () => {
        if (!(await ensureCloudAuthOrPrompt('Dependency (SCA) scan'))) {
          return
        }

        scaTreeProvider.setLoading(true)

        try {
          const result = await scaService.scanDependencies()

          if (result.success) {
            scaTreeProvider.updateResult(result)

            const { critical, high, medium, total } = result.vulnerabilitySummary
            let message = `SCA scan complete: ${result.totalPackages} packages, ${total} vulnerabilities`

            if (critical > 0 || high > 0) {
              message += ` (${critical} critical, ${high} high)`
              vscode.window.showWarningMessage(message)
            } else if (medium > 0) {
              message += ` (${medium} medium)`
              vscode.window.showInformationMessage(message)
            } else {
              vscode.window.showInformationMessage(message)
            }
          } else {
            scaTreeProvider.setError(result.error || 'Scan failed')
            vscode.window.showErrorMessage(`SCA scan failed: ${result.error}`)
          }
        } catch (error: any) {
          scaTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`SCA scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.generateSBOM',
      async () => {
        const format = await vscode.window.showQuickPick(
          [
            { label: 'CycloneDX', description: 'CycloneDX 1.5 JSON format', value: 'cyclonedx' as const },
            { label: 'SPDX', description: 'SPDX 2.3 JSON format', value: 'spdx' as const },
          ],
          { placeHolder: 'Select SBOM format' }
        )

        if (!format) return

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${format.label} SBOM...`,
            cancellable: false,
          },
          async () => {
            try {
              const result = await scaService.generateSBOM(format.value)

              if (result.success) {
                // Save SBOM file
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (workspaceFolder) {
                  const sbomUri = vscode.Uri.joinPath(workspaceFolder.uri, result.filename)

                  await vscode.workspace.fs.writeFile(
                    sbomUri,
                    Buffer.from(result.content, 'utf8')
                  )

                  const openAction = await vscode.window.showInformationMessage(
                    `SBOM saved to ${result.filename}`,
                    'Open File'
                  )

                  if (openAction === 'Open File') {
                    const doc = await vscode.workspace.openTextDocument(sbomUri)
                    await vscode.window.showTextDocument(doc)
                  }
                } else {
                  // No workspace, show in new document
                  const doc = await vscode.workspace.openTextDocument({
                    content: result.content,
                    language: 'json',
                  })
                  await vscode.window.showTextDocument(doc)
                }
              } else {
                vscode.window.showErrorMessage(`SBOM generation failed: ${result.error}`)
              }
            } catch (error: any) {
              vscode.window.showErrorMessage(`SBOM generation failed: ${error.message}`)
            }
          }
        )
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.checkLicenses',
      async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Checking license compliance...',
            cancellable: false,
          },
          async () => {
            try {
              const result = await scaService.checkLicenses()

              if (result.success) {
                const highRisk = result.licenses.filter(l => l.risk === 'high')
                const mediumRisk = result.licenses.filter(l => l.risk === 'medium')

                if (highRisk.length > 0) {
                  vscode.window.showWarningMessage(
                    `License compliance: ${highRisk.length} high-risk license(s) found (${highRisk.map(l => l.license).join(', ')})`
                  )
                } else if (mediumRisk.length > 0) {
                  vscode.window.showInformationMessage(
                    `License compliance: ${mediumRisk.length} medium-risk license(s). No high-risk licenses.`
                  )
                } else {
                  vscode.window.showInformationMessage(
                    'License compliance: All licenses are low-risk or permissive'
                  )
                }
              } else {
                vscode.window.showErrorMessage(`License check failed: ${result.error}`)
              }
            } catch (error: any) {
              vscode.window.showErrorMessage(`License check failed: ${error.message}`)
            }
          }
        )
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showSCAVulnerabilityDetails',
      (vulnerability: SCAVulnerability) => {
        scaService.showVulnerabilityDetails(vulnerability)
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.clearSCAResults',
      () => {
        scaTreeProvider.clear()
        scaService.clearCache()
        vscode.window.showInformationMessage('SCA results cleared')
      }
    )
  )

  // Register Container/IaC Security commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanContainerIaC',
      async () => {
        containerIaCTreeProvider.setLoading(true)

        try {
          const result = await containerIaCService.scanAll()

          if (result.success) {
            containerIaCTreeProvider.updateResult(result)

            const { critical, high, medium, total } = result.summary
            let message = `Container/IaC scan complete: ${result.scannedFiles} files, ${total} issues`

            if (critical > 0 || high > 0) {
              message += ` (${critical} critical, ${high} high)`
              vscode.window.showWarningMessage(message)
            } else if (medium > 0) {
              message += ` (${medium} medium)`
              vscode.window.showInformationMessage(message)
            } else if (total === 0) {
              vscode.window.showInformationMessage('No security issues found in container/IaC files')
            } else {
              vscode.window.showInformationMessage(message)
            }
          } else {
            containerIaCTreeProvider.setError(result.error || 'Scan failed')
            vscode.window.showErrorMessage(`Container/IaC scan failed: ${result.error}`)
          }
        } catch (error: any) {
          containerIaCTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Container/IaC scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanDockerfiles',
      async () => {
        containerIaCTreeProvider.setLoading(true)

        try {
          const result = await containerIaCService.scanByType('dockerfile')
          containerIaCTreeProvider.updateResult(result)

          if (result.success) {
            vscode.window.showInformationMessage(
              `Dockerfile scan: ${result.scannedFiles} files, ${result.summary.total} issues`
            )
          } else {
            vscode.window.showErrorMessage(`Dockerfile scan failed: ${result.error}`)
          }
        } catch (error: any) {
          containerIaCTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Dockerfile scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanKubernetes',
      async () => {
        containerIaCTreeProvider.setLoading(true)

        try {
          const result = await containerIaCService.scanByType('kubernetes')
          containerIaCTreeProvider.updateResult(result)

          if (result.success) {
            vscode.window.showInformationMessage(
              `Kubernetes scan: ${result.scannedFiles} files, ${result.summary.total} issues`
            )
          } else {
            vscode.window.showErrorMessage(`Kubernetes scan failed: ${result.error}`)
          }
        } catch (error: any) {
          containerIaCTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Kubernetes scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanTerraform',
      async () => {
        containerIaCTreeProvider.setLoading(true)

        try {
          const result = await containerIaCService.scanByType('terraform')
          containerIaCTreeProvider.updateResult(result)

          if (result.success) {
            vscode.window.showInformationMessage(
              `Terraform scan: ${result.scannedFiles} files, ${result.summary.total} issues`
            )
          } else {
            vscode.window.showErrorMessage(`Terraform scan failed: ${result.error}`)
          }
        } catch (error: any) {
          containerIaCTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Terraform scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.scanCurrentContainerFile',
      async () => {
        containerIaCTreeProvider.setLoading(true)

        try {
          const result = await containerIaCService.scanCurrentFile()

          if (result.success) {
            containerIaCTreeProvider.updateResult(result)

            if (result.summary.total === 0) {
              vscode.window.showInformationMessage('No security issues found in current file')
            } else {
              vscode.window.showInformationMessage(
                `Found ${result.summary.total} issues in current file`
              )
            }
          } else {
            containerIaCTreeProvider.setError(result.error || 'Scan failed')
            vscode.window.showWarningMessage(result.error || 'Current file is not a container/IaC file')
          }
        } catch (error: any) {
          containerIaCTreeProvider.setError(error.message)
          vscode.window.showErrorMessage(`Scan failed: ${error.message}`)
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.goToContainerIaCIssue',
      async (issue: ContainerIaCIssue) => {
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
          if (!workspaceFolder) return

          const uri = vscode.Uri.joinPath(workspaceFolder.uri, issue.filePath)
          const document = await vscode.workspace.openTextDocument(uri)
          const editor = await vscode.window.showTextDocument(document)

          const position = new vscode.Position(
            Math.max(0, issue.line - 1),
            issue.column || 0
          )
          editor.selection = new vscode.Selection(position, position)
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          )
        } catch (error) {
          logger.error('Failed to navigate to issue', error as Error)
          vscode.window.showErrorMessage('Failed to open file at issue location')
        }
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.showContainerIaCIssueDetails',
      (issue: ContainerIaCIssue) => {
        containerIaCService.showIssueDetails(issue)
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.toggleContainerIaCViewMode',
      () => {
        containerIaCTreeProvider.toggleViewMode()
        const mode = containerIaCTreeProvider.getViewMode()
        vscode.window.showInformationMessage(
          `Container/IaC view: ${mode === 'byType' ? 'By File Type' : 'By Severity'}`
        )
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jokalala.clearContainerIaCResults',
      () => {
        containerIaCTreeProvider.clear()
        containerIaCService.clearCache()
        vscode.window.showInformationMessage('Container/IaC results cleared')
      }
    )
  )

  // Auto-analyze on save: local Tier-1 only (quick → $0 infra)
  const debouncedAnalyzeDocument = debounce((document: vscode.TextDocument) => {
    const settings = configurationService.getSettings()
    if (settings.autoAnalyze) {
      analyzeDocument(document, { mode: 'quick' }).catch(error => {
        logger.error('Error in auto-analyze on save', error as Error)
      })
    }
  }, 1000)

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      debouncedAnalyzeDocument(document)
    })
  )

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  )
  statusBarItem.text = '$(bug) Jokalala Analysis'
  statusBarItem.tooltip = 'Run code analysis on the active file'
  statusBarItem.command = 'jokalala-code-analysis.analyzeFile'
  statusBarItem.show()
  context.subscriptions.push(statusBarItem)

  vscode.window.showInformationMessage('Jokalala Code Analysis is ready!')
}

function showAnalysisFailure(prefix: string, error: unknown): void {
  const message =
    (error as { message?: string })?.message ||
    (error as { toString?: () => string })?.toString?.() ||
    'Unknown error'
  if (message.includes('Authentication failed (401)')) {
    vscode.window
      .showErrorMessage(`${prefix}: ${message}`, 'Sign In')
      .then(choice => {
        if (choice === 'Sign In') {
          vscode.commands.executeCommand('jokalala.signIn')
        }
      })
  } else {
    vscode.window.showErrorMessage(`${prefix}: ${message}`)
  }
}

async function analyzeCurrentFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('No active editor')
    return
  }

  await analyzeDocument(editor.document)
}

async function analyzeSelection() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('No active editor')
    return
  }

  const selection = editor.selection
  const code = editor.document.getText(selection)

  if (!code) {
    vscode.window.showErrorMessage('No code selected')
    return
  }

  const settings = configurationService.getSettings()
  const resetStatusBar = enterAnalyzingState('Analyzing selected code...')

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing selection...',
      cancellable: false,
    },
    async () => {
      try {
        const language = editor.document.languageId
        const result = await codeAnalysisService.analyzeCode(code, language, {
          filePath: editor.document.fileName,
        })

        handleAnalysisSuccess(result, editor.document, settings)
      } catch (error: any) {
        logger.error('Selection analysis error', error)
        showAnalysisFailure('Analysis failed', error)
      }
    }
  )

  resetStatusBar()
}

async function analyzeDocument(
  document: vscode.TextDocument,
  options?: { mode?: 'quick' | 'deep' | 'full' }
) {
  const settings = configurationService.getSettings()
  const maxFileSize = settings.maxFileSize
  const resetStatusBar = enterAnalyzingState(
    `Analyzing ${vscode.workspace.asRelativePath(document.uri)}`
  )

  // Check file size
  if (document.getText().length > maxFileSize) {
    vscode.window.showWarningMessage(
      `File too large for analysis (max ${maxFileSize} characters)`
    )
    resetStatusBar()
    return
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing code...',
      cancellable: false,
    },
    async () => {
      try {
        const code = document.getText()
        const language = document.languageId
        const result = await codeAnalysisService.analyzeCode(code, language, {
          mode: options?.mode || settings.analysisMode,
          filePath: document.fileName,
        })

        logger.info('Analysis result received', {
          issues: result.prioritizedIssues?.length || 0,
          recommendations: result.recommendations?.length || 0,
        })

        handleAnalysisSuccess(result, document, settings)
      } catch (error: any) {
        logger.error('Analysis error', error)
        showAnalysisFailure('Analysis failed', error)
      }
    }
  )

  resetStatusBar()
}

/**
 * Checks sign-in/API-key auth before a cloud-only command that has no
 * local fallback (Refactoring, CVE lookup, SCA). Shows an actionable
 * warning with a "Sign In" button and returns false if not authenticated,
 * instead of letting the command silently send an unauthenticated request.
 */
async function ensureCloudAuthOrPrompt(featureName: string): Promise<boolean> {
  const hasApiKey = Boolean((await securityService.getApiKeyWithFallback())?.trim())
  if (authService.isAuthenticated || hasApiKey) {
    return true
  }
  const choice = await vscode.window.showWarningMessage(
    `${featureName} requires signing in to Jokalala (or setting an API key).`,
    'Sign In'
  )
  if (choice === 'Sign In') {
    await authService.signIn()
  }
  return false
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

/**
 * Pick the highest-value files (by worst local severity, then issue count)
 * up to `maxFiles` — used to bound cloud enrichment to a worthwhile subset
 * instead of either sending everything or an arbitrary prefix.
 */
function selectFilesForCloudEnrichment(
  files: { path: string; content: string; language: string }[],
  localFileResults: FileAnalysisResult[],
  maxFiles: number
): { path: string; content: string; language: string }[] {
  const scored = localFileResults
    .map(fr => ({
      path: fr.filePath,
      score:
        fr.issues.reduce((max, i) => Math.max(max, SEVERITY_RANK[i.severity] ?? 0), 0) *
          1000 +
        fr.issues.length,
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)

  const topPaths = new Set(scored.map(s => s.path))
  return files.filter(f => topPaths.has(f.path))
}

async function analyzeProject() {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage(
      'No workspace folder found for project analysis.'
    )
    return
  }

  const settings = configurationService.getSettings()

  // Local scanning never requires cloud/auth — only the optional cloud
  // enrichment pass below does, and that's checked just before it's used.

  const resetStatusBar = enterAnalyzingState('Analyzing project files...')

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Jokalala: Analyzing project...',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        const includeGlob = '**/*.{ts,tsx,js,jsx,py,go,java,rb,cs,php}'
        const excludeGlob =
          '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/vendor/**,**/target/**,**/.next/**,**/coverage/**}'

        progress.report({ message: 'Collecting files...' })
        const ceiling = settings.maxProjectFiles
        // Fetch one more than the ceiling so a truncation can be detected
        // and reported — VS Code's findFiles maxResults silently caps
        // results otherwise, with no signal that more files exist.
        const candidateUris = await vscode.workspace.findFiles(
          includeGlob,
          excludeGlob,
          ceiling + 1
        )
        const hitCeiling = candidateUris.length > ceiling
        const uris = hitCeiling ? candidateUris.slice(0, ceiling) : candidateUris

        if (uris.length === 0) {
          vscode.window.showWarningMessage(
            'No analyzable project files were found.'
          )
          resetStatusBar()
          return
        }

        const files: { path: string; content: string; language: string }[] = []
        const skipped: string[] = []

        token.onCancellationRequested(() => {
          logger.warn('Project analysis cancelled by user')
        })

        for (let i = 0; i < uris.length; i++) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Project analysis cancelled.')
            return
          }

          const uri = uris[i]!
          const document = await vscode.workspace.openTextDocument(uri)
          const content = document.getText()

          if (content.length > settings.maxProjectFileSize) {
            skipped.push(vscode.workspace.asRelativePath(uri))
            continue
          }

          files.push({
            path: vscode.workspace.asRelativePath(uri),
            content,
            language: document.languageId,
          })

          if ((i + 1) % 200 === 0) {
            progress.report({ message: `Reading files... (${i + 1}/${uris.length})` })
            await new Promise<void>(resolve => setImmediate(resolve))
          }
        }

        if (files.length === 0) {
          vscode.window.showWarningMessage(
            'No project files met the analysis requirements.'
          )
          resetStatusBar()
          return
        }

        if (skipped.length > 0) {
          logger.warn('Skipped large files during project analysis', skipped)
          vscode.window.showWarningMessage(
            `Project analysis skipped ${skipped.length} file(s) exceeding the ${settings.maxProjectFileSize}-character size limit.`
          )
        }

        if (hitCeiling) {
          vscode.window.showWarningMessage(
            `Project analysis stopped at the ${ceiling}-file safety ceiling (jokalala.maxProjectFiles) — more matching files exist. Raise the setting to scan everything.`
          )
        }

        // Local Tier-1 scan — no cloud, no auth, no cap beyond the ceiling
        // already applied above. This is the default, always-on pass.
        progress.report({ message: `Analyzing ${files.length} files locally...` })
        const localResult = await codeAnalysisService.analyzeProjectLocally(
          files,
          token,
          (done, total) => {
            if (done % 200 === 0 || done === total) {
              progress.report({ message: `Local analysis: ${done}/${total} files` })
            }
          }
        )

        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage('Project analysis cancelled.')
          resetStatusBar()
          return
        }

        let finalResult = localResult

        // Optional, bounded cloud enrichment on top of the local pass.
        if (settings.cloudEnrichmentEnabled) {
          const hasApiKey = Boolean(
            (await securityService.getApiKeyWithFallback())?.trim()
          )
          if (!authService.isAuthenticated && !hasApiKey) {
            vscode.window.showWarningMessage(
              'Cloud enrichment is enabled but you are not signed in — showing local-only results. Run "Jokalala: Sign In" to enable it.'
            )
          } else {
            const cloudFiles = selectFilesForCloudEnrichment(
              files,
              localResult.fileResults ?? [],
              settings.cloudEnrichmentMaxFiles ?? 200
            )

            if (cloudFiles.length > 0) {
              progress.report({
                message: `Enriching ${cloudFiles.length} highest-risk file(s) via cloud...`,
              })
              try {
                const cloudResult = await codeAnalysisService.analyzeProject(
                  cloudFiles,
                  undefined,
                  token
                )
                finalResult = codeAnalysisService.mergeProjectResults(
                  localResult,
                  cloudResult,
                  localResult.requestId ?? ''
                )
              } catch (cloudError: any) {
                logger.warn('Cloud enrichment failed; showing local-only results', cloudError)
                vscode.window.showWarningMessage(
                  `Cloud enrichment failed (${cloudError?.message ?? 'unknown error'}) — showing local-only results.`
                )
              }
            }
          }
        }

        const normalizedIssues = normalizeIssues(finalResult.prioritizedIssues || [])

        // Build UI-facing file results (absolute paths) directly from the
        // already file-grouped result — analyzeProjectLocally/mergeProjectResults
        // both return fileResults, unlike the old cloud-only response shape
        // that required re-grouping a flat issue list here.
        const fileResults: FileAnalysisResult[] = (finalResult.fileResults ?? []).map(
          fr => {
            const absolutePath = path.isAbsolute(fr.filePath)
              ? fr.filePath
              : path.join(folders[0]!.uri.fsPath, fr.filePath)
            const issues = fr.issues.map(issue => ({ ...issue, filePath: absolutePath }))
            return {
              filePath: absolutePath,
              issues,
              language: fr.language,
              score: calculateFileScore(issues),
            }
          }
        )

        // Mirror findings into the editor/Problems panel, not just the
        // Jokalala sidebar — one batched call instead of one per file, so
        // this doesn't jank the extension host on large scans.
        diagnosticsManager.updateDiagnosticsBatch(
          fileResults.map(fr => ({ uri: vscode.Uri.file(fr.filePath), issues: fr.issues }))
        )

        // Create summary data
        const summaryData: AnalysisSummaryData = {
          totalFiles: files.length,
          totalIssues: normalizedIssues.length,
          criticalCount: normalizedIssues.filter(i => i.severity === 'critical')
            .length,
          highCount: normalizedIssues.filter(i => i.severity === 'high').length,
          mediumCount: normalizedIssues.filter(i => i.severity === 'medium')
            .length,
          lowCount: normalizedIssues.filter(i => i.severity === 'low').length,
          ...(finalResult.summary?.overallScore !== undefined && {
            overallScore: finalResult.summary.overallScore,
          }),
          folderPath: folders[0]!.name,
        }

        // Update tree views with file-grouped results
        issuesTreeProvider.updateFileResults(fileResults, summaryData)
        recommendationsTreeProvider.updateRecommendations(
          finalResult.recommendations || []
        )
        metricsTreeProvider.updateMetrics(finalResult.summary)

        vscode.window.showInformationMessage(
          `Jokalala: analyzed ${files.length} of ${files.length} matching file(s) — ${normalizedIssues.length} issue(s) found` +
            (finalResult.metadata?.analysisTier === 'hybrid' ? ' (local + cloud).' : ' (local).')
        )
      } catch (error: any) {
        if (token.isCancellationRequested) {
          logger.warn('Project analysis cancelled after request was sent')
          resetStatusBar()
          return
        }

        logger.error('Project analysis failed', error)
        showAnalysisFailure('Project analysis failed', error)
      }
    }
  )

  resetStatusBar()
}

async function clearCache() {
  try {
    await codeAnalysisService.clearCache()
    vscode.window.showInformationMessage('Analysis cache cleared')
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clear cache: ${error}`)
  }
}

function showSettings() {
  vscode.commands.executeCommand('workbench.action.openSettings', 'jokalala')
}

export function deactivate() {
  diagnosticsManager?.dispose()
  logger?.dispose()
}

async function ensurePersistentIdentifiers(context: vscode.ExtensionContext) {
  if (!context.globalState.get('sessionId')) {
    await context.globalState.update('sessionId', randomUUID())
  }

  if (!context.globalState.get('userId')) {
    await context.globalState.update(
      'userId',
      vscode.env.machineId || randomUUID()
    )
  }
}

async function validateConfiguration() {
  const validationResult = configurationService.validateConfiguration()
  if (!validationResult.valid) {
    validationResult.errors.forEach(error =>
      vscode.window.showErrorMessage(`${error.setting}: ${error.message}`)
    )
    const errorMessages = validationResult.errors.map(
      e => `${e.setting}: ${e.message}`
    )
    throw new Error(errorMessages.join('\n'))
  }

  // Show warnings if any
  validationResult.warnings.forEach(warning =>
    vscode.window.showWarningMessage(`${warning.setting}: ${warning.message}`)
  )

  try {
    await codeAnalysisService.testConnection()
    vscode.window.showInformationMessage(
      'Jokalala service connection verified.'
    )
  } catch (error: any) {
    vscode.window.showWarningMessage(
      `Jokalala service health check failed. You can still attempt analysis. (${error.message})`
    )
  }
}

function showAnalysisSummary(summary: any) {
  if (!summary) {
    vscode.window.showInformationMessage('Analysis completed successfully.')
    return
  }

  const message = `Analysis complete: ${summary.totalIssues ?? 0} issues (Score: ${summary.overallScore ?? 'N/A'}/100)`
  if (statusBarItem) {
    statusBarItem.text = '$(bug) Analysis Complete'
    setTimeout(() => {
      if (statusBarItem?.text === '$(bug) Analysis Complete') {
        statusBarItem.text = '$(bug) Jokalala Analysis'
        statusBarItem.tooltip = 'Run code analysis on the active file'
      }
    }, 4000)
  }

  vscode.window.showInformationMessage(message)
}

function showV2AnalysisSummary(v2Report: any, _summary: any) {
  const avgConfidence = Math.round((v2Report.summary?.averageConfidence ?? 0) * 100)
  const totalVulns = v2Report.summary?.totalVulnerabilities ?? 0
  const detectedLanguage = v2Report.summary?.detectedLanguage ?? 'unknown'

  const message = `✨ Enhanced Analysis: ${totalVulns} unique issues found (${avgConfidence}% avg confidence, ${detectedLanguage})`

  if (statusBarItem) {
    statusBarItem.text = '$(sparkle) V2 Analysis Complete'
    setTimeout(() => {
      if (statusBarItem?.text === '$(sparkle) V2 Analysis Complete') {
        statusBarItem.text = '$(bug) Jokalala Analysis'
        statusBarItem.tooltip = 'Run code analysis on the active file'
      }
    }, 4000)
  }

  vscode.window.showInformationMessage(message)
}

function handleAnalysisSuccess(
  result: AnalysisResult,
  document: vscode.TextDocument,
  settings: ExtensionSettings
) {
  const issues = normalizeIssues(result.prioritizedIssues || [])
  const recommendations = result.recommendations || []

  if (settings.enableDiagnostics) {
    logger.info('Updating diagnostics', { count: issues.length })
    diagnosticsManager.updateDiagnostics(document.uri, issues)
  }

  // Check if V2 report is available and passes quality gate
  const hasV2Report = Boolean(result.metadata?.hasV2Report && result.v2Report)
  const v2QualityPassed = hasV2Report && result.v2Report
    ? qualityGate.shouldDisplayV2(result.v2Report)
    : false

  // Process V2 report if available and quality gate passed
  let processedV2Report: V2AnalysisReport | undefined = result.v2Report

  if (v2QualityPassed && processedV2Report) {
    // Filter out false positives
    const fullCode = document.getText()
    const { filtered, removed, warned } = falsePositiveDetector.filterVulnerabilities(
      processedV2Report.vulnerabilities,
      fullCode
    )

    if (removed.length > 0) {
      logger.info(`Filtered ${removed.length} false positives`)
    }
    if (warned.length > 0) {
      logger.info(`${warned.length} potential false positives flagged`)
    }

    // Update the report with filtered vulnerabilities
    processedV2Report = {
      ...processedV2Report,
      vulnerabilities: filtered,
      summary: {
        ...processedV2Report.summary,
        totalVulnerabilities: filtered.length
      }
    }

    // Apply intelligence prioritization
    const prioritized = intelligencePrioritizer.prioritizeReport(processedV2Report)
    const summary = intelligencePrioritizer.getIntelligenceSummary(prioritized)

    if (summary.cisaKevCount > 0) {
      logger.info(`Found ${summary.cisaKevCount} CISA KEV vulnerabilities - prioritizing`)
    }
    if (summary.highEpssCount > 0) {
      logger.info(`Found ${summary.highEpssCount} high EPSS vulnerabilities`)
    }

    // Sort vulnerabilities by priority
    processedV2Report = {
      ...processedV2Report,
      vulnerabilities: prioritized
    }
  }

  logger.info('Updating tree views', {
    issues: issues.length,
    recommendations: recommendations.length,
    hasV2Report,
    v2QualityPassed,
  })

  // Pass V2 report to issues tree provider (only if quality gate passed)
  issuesTreeProvider.updateIssues(
    issues,
    v2QualityPassed ? processedV2Report : undefined
  )
  recommendationsTreeProvider.updateRecommendations(recommendations)
  metricsTreeProvider.updateMetrics(result.summary)

  // Show different summary based on V2 availability and quality
  if (v2QualityPassed && processedV2Report) {
    showV2AnalysisSummary(processedV2Report, result.summary)
  } else {
    if (hasV2Report && !v2QualityPassed) {
      logger.warn('V2 report available but quality gate not passed, falling back to V1')
    }
    showAnalysisSummary(result.summary)
  }
}

function normalizeIssues(rawIssues: any[]): Issue[] {
  return rawIssues.map(issue => {
    let message = issue.message || issue.title || issue.description

    if (!message && issue.category) {
      message = issue.category.replace(/_/g, ' ').replace(/-/g, ' ')
    }

    if (!message) {
      message = 'Code issue detected'
    }

    const severity = (issue.severity || 'medium') as Issue['severity']

    return {
      severity,
      category: issue.category || 'unknown',
      message,
      line: issue.line,
      column: issue.column,
      suggestion: issue.suggestion || issue.recommendation,
      source: (issue.source || 'static') as Issue['source'],
      location: issue.location,
      filePath: issue.filePath || issue.location?.filePath,
      priorityScore: issue.priorityScore,
      impact: issue.impact,
      exploitability: issue.exploitability,
      effortToFix: issue.effortToFix,
      correlatedWith: issue.correlatedWith,
      codeSnippet: issue.codeSnippet,
    }
  })
}

/**
 * Calculate a quality score for a file based on its issues
 * Score is 0-100, with 100 being perfect (no issues)
 */
function calculateFileScore(issues: Issue[]): number {
  if (issues.length === 0) {
    return 100
  }

  // Weighted severity penalties
  const severityPenalties: Record<Issue['severity'], number> = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
    info: 1,
  }

  let totalPenalty = 0
  issues.forEach(issue => {
    totalPenalty += severityPenalties[issue.severity] || 5
  })

  // Cap the penalty at 100 (minimum score of 0)
  const score = Math.max(0, 100 - totalPenalty)
  return Math.round(score)
}

function enterAnalyzingState(tooltip: string): () => void {
  if (!statusBarItem) {
    return () => {}
  }

  const previousText = statusBarItem.text
  const previousTooltip = statusBarItem.tooltip
  statusBarItem.text = '$(sync~spin) Jokalala Analyzing...'
  statusBarItem.tooltip = tooltip

  return () => {
    if (statusBarItem?.text?.startsWith('$(sync~spin)')) {
      statusBarItem.text = previousText || '$(bug) Jokalala Analysis'
      statusBarItem.tooltip =
        previousTooltip || 'Run code analysis on the active file'
    }
  }
}
