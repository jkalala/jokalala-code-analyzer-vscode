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
import { registerEnhancedCodeActionProvider } from './providers/enhanced-code-action-provider'
import { CodeAnalysisService } from './services/code-analysis-service'
import { ConfigurationService } from './services/configuration-service'
import { DiagnosticsManager } from './services/diagnostics-manager'
import { Logger } from './services/logger'
import { userFeedbackService } from './services/user-feedback-service'
import { qualityGate } from './utils/quality-gate'
import { falsePositiveDetector } from './utils/false-positive-detector'
import { intelligencePrioritizer } from './utils/intelligence-prioritizer'

let diagnosticsManager: DiagnosticsManager
let codeAnalysisService: CodeAnalysisService
let configurationService: ConfigurationService
let issuesTreeProvider: IssuesTreeProvider
let recommendationsTreeProvider: RecommendationsTreeProvider
let metricsTreeProvider: MetricsTreeProvider
let logger: Logger
let statusBarItem: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext) {
  logger = new Logger()
  logger.info('Activating Jokalala Code Analysis extension')

  try {
    configurationService = new ConfigurationService()
    diagnosticsManager = new DiagnosticsManager()
    codeAnalysisService = new CodeAnalysisService(configurationService, logger)
    issuesTreeProvider = new IssuesTreeProvider()
    recommendationsTreeProvider = new RecommendationsTreeProvider()
    metricsTreeProvider = new MetricsTreeProvider()

    await ensurePersistentIdentifiers(context)

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

  // Auto-analyze on save if enabled
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const settings = configurationService.getSettings()
      if (settings.autoAnalyze) {
        analyzeDocument(document)
      }
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
        const result = await codeAnalysisService.analyzeCode(code, language)

        handleAnalysisSuccess(result, editor.document, settings)
      } catch (error: any) {
        logger.error('Selection analysis error', error)
        const errorMessage =
          error?.message || error?.toString() || 'Unknown error'
        vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`)
      }
    }
  )

  resetStatusBar()
}

async function analyzeDocument(document: vscode.TextDocument) {
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
        const result = await codeAnalysisService.analyzeCode(code, language)

        logger.info('Analysis result received', {
          issues: result.prioritizedIssues?.length || 0,
          recommendations: result.recommendations?.length || 0,
        })

        handleAnalysisSuccess(result, document, settings)
      } catch (error: any) {
        logger.error('Analysis error', error)
        const errorMessage =
          error?.message || error?.toString() || 'Unknown error'
        vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`)
      }
    }
  )

  resetStatusBar()
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
          '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}'

        progress.report({ message: 'Collecting files...' })
        const candidateUris = await vscode.workspace.findFiles(
          includeGlob,
          excludeGlob,
          settings.maxProjectFiles * 2
        )

        if (candidateUris.length === 0) {
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

        for (const uri of candidateUris) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Project analysis cancelled.')
            return
          }

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

          if (files.length >= settings.maxProjectFiles) {
            break
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
        }

        progress.report({
          message: `Sending ${files.length} files to analysis service...`,
        })
        const result = await codeAnalysisService.analyzeProject(files)
        const normalizedIssues = normalizeIssues(result.prioritizedIssues || [])

        // Create file-grouped results for enhanced UI
        const fileResultsMap = new Map<string, FileAnalysisResult>()

        // Initialize with all analyzed files (even those with no issues)
        files.forEach(file => {
          const absolutePath = path.join(folders[0]!.uri.fsPath, file.path)
          fileResultsMap.set(file.path, {
            filePath: absolutePath,
            issues: [],
            language: file.language,
          })
        })

        // Group normalized issues by file path
        normalizedIssues.forEach(issue => {
          // Try to find which file this issue belongs to
          const issueFilePath = issue.filePath || issue.location?.filePath
          if (issueFilePath) {
            const relativePath = vscode.workspace.asRelativePath(issueFilePath)
            const fileResult = fileResultsMap.get(relativePath)
            if (fileResult) {
              fileResult.issues.push({
                ...issue,
                filePath: fileResult.filePath,
              })
            } else {
              // Create new entry for files not in our original list
              const absolutePath = path.isAbsolute(issueFilePath)
                ? issueFilePath
                : path.join(folders[0]!.uri.fsPath, issueFilePath)
              fileResultsMap.set(relativePath, {
                filePath: absolutePath,
                issues: [
                  {
                    ...issue,
                    filePath: absolutePath,
                  },
                ],
              })
            }
          }
        })

        // Calculate scores for each file
        const fileResults: FileAnalysisResult[] = Array.from(
          fileResultsMap.values()
        ).map(fr => ({
          ...fr,
          score: calculateFileScore(fr.issues),
        }))

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
          ...(result.summary?.overallScore !== undefined && { overallScore: result.summary.overallScore }),
          folderPath: folders[0]!.name,
        }

        // Update tree views with file-grouped results
        issuesTreeProvider.updateFileResults(fileResults, summaryData)
        recommendationsTreeProvider.updateRecommendations(
          result.recommendations || []
        )
        metricsTreeProvider.updateMetrics(result.summary)

        showAnalysisSummary(result.summary)
      } catch (error: any) {
        if (token.isCancellationRequested) {
          logger.warn('Project analysis cancelled after request was sent')
          resetStatusBar()
          return
        }

        logger.error('Project analysis failed', error)
        vscode.window.showErrorMessage(
          `Project analysis failed: ${error?.message || error}`
        )
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
