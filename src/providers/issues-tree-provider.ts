import * as path from 'path'
import * as vscode from 'vscode'
import {
  FileAnalysisResult,
  Issue,
} from '../interfaces/code-analysis-service.interface'
import { V2AnalysisReport, V2Vulnerability } from '../interfaces/v2-report.interface'

/**
 * View mode for the issues tree
 */
export type IssuesViewMode = 'byFile' | 'bySeverity'

/**
 * Tree item types for the issues tree
 */
export type TreeItemType =
  | 'summary'
  | 'file'
  | 'severity-group'
  | 'issue'
  | 'more-issues'

/**
 * Summary data for folder analysis
 */
export interface AnalysisSummaryData {
  totalFiles: number
  totalIssues: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  overallScore?: number
  folderPath?: string
}

export class IssuesTreeProvider
  implements vscode.TreeDataProvider<IssueTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    IssueTreeItem | undefined | null
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private issues: Issue[] = []
  private fileResults: FileAnalysisResult[] = []
  private viewMode: IssuesViewMode = 'byFile'
  private summaryData: AnalysisSummaryData | null = null
  private isProjectAnalysis: boolean = false
  private v2Report: V2AnalysisReport | null = null
  private hasV2Report: boolean = false

  /**
   * Update issues for single file analysis (legacy mode)
   */
  updateIssues(issues: Issue[], v2Report?: V2AnalysisReport): void {
    this.issues = issues
    this.fileResults = []
    this.summaryData = null
    this.isProjectAnalysis = false
    this.v2Report = v2Report || null
    this.hasV2Report = Boolean(v2Report && v2Report.vulnerabilities?.length > 0)
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Update with file-grouped results for project/folder analysis
   */
  updateFileResults(
    fileResults: FileAnalysisResult[],
    summary?: AnalysisSummaryData
  ): void {
    this.fileResults = fileResults
    this.summaryData = summary || null
    this.isProjectAnalysis = true

    // Also flatten issues for compatibility
    this.issues = fileResults.flatMap(fr =>
      fr.issues.map(issue => ({
        ...issue,
        filePath: fr.filePath,
      }))
    )

    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Toggle between file view and severity view
   */
  setViewMode(mode: IssuesViewMode): void {
    this.viewMode = mode
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Get current view mode
   */
  getViewMode(): IssuesViewMode {
    return this.viewMode
  }

  /**
   * Clear all issues
   */
  clear(): void {
    this.issues = []
    this.fileResults = []
    this.summaryData = null
    this.isProjectAnalysis = false
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: IssueTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: IssueTreeItem): Thenable<IssueTreeItem[]> {
    if (!element) {
      // Root level
      return Promise.resolve(this.getRootChildren())
    }

    // Children based on item type
    switch (element.itemType) {
      case 'summary':
        return Promise.resolve([])
      case 'file':
        return Promise.resolve(this.getFileChildren(element))
      case 'severity-group':
        return Promise.resolve(this.getSeverityGroupChildren(element))
      case 'more-issues':
        return Promise.resolve([])
      default:
        return Promise.resolve([])
    }
  }

  private getRootChildren(): IssueTreeItem[] {
    const items: IssueTreeItem[] = []

    // Add V2 Enhanced header if V2 report is available
    if (this.hasV2Report && this.v2Report) {
      items.push(this.createV2SummaryNode())
      items.push(...this.getV2VulnerabilityNodes())
      return items
    }

    // Add summary node for project analysis
    if (this.isProjectAnalysis && this.summaryData) {
      items.push(this.createSummaryNode())
    }

    if (this.viewMode === 'byFile' && this.isProjectAnalysis) {
      // Group by file
      items.push(...this.getFileNodes())
    } else {
      // Group by severity (default for single file or when viewing by severity)
      items.push(...this.getSeverityNodes())
    }

    return items
  }

  /**
   * Create V2 Enhanced Summary Node
   */
  private createV2SummaryNode(): IssueTreeItem {
    const v2 = this.v2Report!
    const avgConfidence = Math.round(v2.summary.averageConfidence * 100)
    const label = `✨ Enhanced Analysis: ${v2.summary.totalVulnerabilities} unique issues (${avgConfidence}% confidence)`

    const item = new IssueTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      'summary'
    )

    // Build detailed tooltip
    const tooltipLines = [
      `✨ V2 Enhanced Analysis`,
      `🔬 Intelligent Deduplication Active`,
      ``,
      `📝 Unique Vulnerabilities: ${v2.summary.totalVulnerabilities}`,
      `🎯 Average Confidence: ${avgConfidence}%`,
      `💻 Detected Language: ${v2.summary.detectedLanguage}`,
      ``,
      `🔴 Critical: ${v2.summary.criticalCount}`,
      `🟠 High: ${v2.summary.highCount}`,
      `🟡 Medium: ${v2.summary.mediumCount}`,
      `🟢 Low: ${v2.summary.lowCount}`,
    ]

    item.tooltip = tooltipLines.join('\n')
    item.iconPath = new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.green'))
    item.description = `${v2.summary.detectedLanguage} • ${avgConfidence}% avg confidence`

    return item
  }

  /**
   * Create V2 Vulnerability Nodes
   */
  private getV2VulnerabilityNodes(): IssueTreeItem[] {
    if (!this.v2Report) {
      return []
    }

    // Group by severity
    const severityOrder: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = [
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]

    return severityOrder
      .filter(severity => this.v2Report!.vulnerabilities.some(v => v.severity === severity))
      .map(severity => {
        const vulns = this.v2Report!.vulnerabilities.filter(v => v.severity === severity)
        const emoji = this.getV2SeverityEmoji(severity)
        const icon = this.getV2SeverityIcon(severity)

        const item = new IssueTreeItem(
          `${emoji} ${severity} (${vulns.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          'severity-group',
          undefined,
          undefined,
          undefined,
          vulns
        )
        item.iconPath = icon

        return item
      })
  }

  /**
   * Get V2 severity emoji
   */
  private getV2SeverityEmoji(severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): string {
    switch (severity) {
      case 'CRITICAL':
        return '🔴'
      case 'HIGH':
        return '🟠'
      case 'MEDIUM':
        return '🟡'
      case 'LOW':
        return '🟢'
    }
  }

  /**
   * Get V2 severity icon
   */
  private getV2SeverityIcon(severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): vscode.ThemeIcon {
    switch (severity) {
      case 'CRITICAL':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
      case 'HIGH':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
      case 'MEDIUM':
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('list.infoForeground'))
      case 'LOW':
        return new vscode.ThemeIcon('circle-outline')
    }
  }

  private createSummaryNode(): IssueTreeItem {
    const s = this.summaryData!
    const scoreText =
      s.overallScore !== undefined ? ` • Score: ${s.overallScore}/100` : ''
    const label = `📊 Summary: ${s.totalIssues} issues in ${s.totalFiles} files${scoreText}`

    const item = new IssueTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      'summary'
    )

    // Build detailed tooltip
    const tooltipLines = [
      `📁 Files Analyzed: ${s.totalFiles}`,
      `📝 Total Issues: ${s.totalIssues}`,
      '',
      `🔴 Critical: ${s.criticalCount}`,
      `🟠 High: ${s.highCount}`,
      `🟡 Medium: ${s.mediumCount}`,
      `🟢 Low: ${s.lowCount}`,
    ]
    if (s.overallScore !== undefined) {
      tooltipLines.push('', `📈 Overall Score: ${s.overallScore}/100`)
    }
    if (s.folderPath) {
      tooltipLines.push('', `📂 Folder: ${s.folderPath}`)
    }

    item.tooltip = tooltipLines.join('\n')
    item.iconPath = new vscode.ThemeIcon('graph')
    item.description = s.folderPath || ''

    return item
  }

  private getFileNodes(): IssueTreeItem[] {
    // Sort files by issue count (descending) for visibility of problematic files
    const sortedFiles = [...this.fileResults].sort(
      (a, b) => b.issues.length - a.issues.length
    )

    return sortedFiles.map(fileResult => {
      const fileName = path.basename(fileResult.filePath)
      const issueCount = fileResult.issues.length
      const scoreText =
        fileResult.score !== undefined ? `Score: ${fileResult.score}` : ''

      // Count severities for this file
      const criticalCount = fileResult.issues.filter(
        i => i.severity === 'critical'
      ).length
      const highCount = fileResult.issues.filter(
        i => i.severity === 'high'
      ).length

      // Determine icon based on severity
      let icon: vscode.ThemeIcon
      if (criticalCount > 0) {
        icon = new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground')
        )
      } else if (highCount > 0) {
        icon = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('list.warningForeground')
        )
      } else if (issueCount > 0) {
        icon = new vscode.ThemeIcon(
          'info',
          new vscode.ThemeColor('list.infoForeground')
        )
      } else {
        icon = new vscode.ThemeIcon(
          'check',
          new vscode.ThemeColor('testing.iconPassed')
        )
      }

      const item = new IssueTreeItem(
        `📄 ${fileName}`,
        issueCount > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        'file',
        undefined,
        fileResult.issues,
        fileResult.filePath
      )

      item.description = `${scoreText} • ${issueCount} issues`
      item.iconPath = icon
      item.tooltip = this.buildFileTooltip(fileResult)
      item.resourceUri = vscode.Uri.file(fileResult.filePath)

      // Add command to open file when clicked
      item.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(fileResult.filePath)],
      }

      return item
    })
  }

  private buildFileTooltip(fileResult: FileAnalysisResult): string {
    const lines = [
      `📄 ${fileResult.filePath}`,
      `📝 Total Issues: ${fileResult.issues.length}`,
      '',
    ]

    const severityCounts = {
      critical: fileResult.issues.filter(i => i.severity === 'critical').length,
      high: fileResult.issues.filter(i => i.severity === 'high').length,
      medium: fileResult.issues.filter(i => i.severity === 'medium').length,
      low: fileResult.issues.filter(i => i.severity === 'low').length,
    }

    if (severityCounts.critical > 0)
      lines.push(`🔴 Critical: ${severityCounts.critical}`)
    if (severityCounts.high > 0) lines.push(`🟠 High: ${severityCounts.high}`)
    if (severityCounts.medium > 0)
      lines.push(`🟡 Medium: ${severityCounts.medium}`)
    if (severityCounts.low > 0) lines.push(`🟢 Low: ${severityCounts.low}`)

    if (fileResult.score !== undefined) {
      lines.push('', `📈 Score: ${fileResult.score}/100`)
    }

    return lines.join('\n')
  }

  private getFileChildren(fileNode: IssueTreeItem): IssueTreeItem[] {
    const issues = fileNode.childIssues || []
    const filePath = fileNode.filePath

    // Limit displayed issues for performance, show "X more..." link
    const MAX_DISPLAYED_ISSUES = 50
    const displayedIssues = issues.slice(0, MAX_DISPLAYED_ISSUES)
    const remainingCount = issues.length - MAX_DISPLAYED_ISSUES

    const items = displayedIssues.map(issue =>
      this.createIssueNode(issue, filePath)
    )

    if (remainingCount > 0) {
      const moreItem = new IssueTreeItem(
        `... and ${remainingCount} more issues`,
        vscode.TreeItemCollapsibleState.None,
        'more-issues'
      )
      moreItem.iconPath = new vscode.ThemeIcon('ellipsis')
      moreItem.tooltip = `Click on the file to see all ${issues.length} issues in the Problems panel`
      items.push(moreItem)
    }

    return items
  }

  private createIssueNode(issue: Issue, filePath?: string): IssueTreeItem {
    const severityIcon = this.getSeverityIcon(issue.severity)
    const severityEmoji = this.getSeverityEmoji(issue.severity)
    const lineInfo = issue.line ? ` (Line ${issue.line})` : ''

    const item = new IssueTreeItem(
      `${severityEmoji} ${issue.message}`,
      vscode.TreeItemCollapsibleState.None,
      'issue',
      issue
    )

    item.description = `${issue.category}${lineInfo}`
    item.iconPath = severityIcon
    item.tooltip = this.buildIssueTooltip(issue)

    // Add command to navigate to the issue location
    if (filePath && issue.line) {
      const targetUri = vscode.Uri.file(
        path.isAbsolute(filePath)
          ? filePath
          : path.join(
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
              filePath
            )
      )

      item.command = {
        command: 'jokalala-code-analysis.goToIssue',
        title: 'Go to Issue',
        arguments: [targetUri, issue.line, issue.column || 0],
      }
    }

    return item
  }

  private buildIssueTooltip(issue: Issue): string {
    const lines = [
      `**${issue.category}**`,
      '',
      issue.message,
      '',
      `Severity: ${issue.severity.toUpperCase()}`,
    ]

    if (issue.line) {
      lines.push(
        `Location: Line ${issue.line}${issue.column ? `, Column ${issue.column}` : ''}`
      )
    }

    if (issue.suggestion) {
      lines.push('', '💡 Suggestion:', issue.suggestion)
    }

    if (issue.codeSnippet) {
      lines.push('', '📝 Code:', '```', issue.codeSnippet, '```')
    }

    if (issue.impact) {
      lines.push(`Impact: ${issue.impact}`)
    }

    if (issue.effortToFix) {
      lines.push(`Effort to Fix: ${issue.effortToFix}`)
    }

    return lines.join('\n')
  }

  private getSeverityNodes(): IssueTreeItem[] {
    const grouped = this.groupBySeverity()
    const severityOrder: Array<Issue['severity']> = [
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]

    return severityOrder
      .filter(severity => (grouped[severity]?.length ?? 0) > 0)
      .map(severity => {
        const issues = grouped[severity] ?? []
        const emoji = this.getSeverityEmoji(severity)
        const icon = this.getSeverityIcon(severity)

        const item = new IssueTreeItem(
          `${emoji} ${severity.toUpperCase()} (${issues.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          'severity-group',
          undefined,
          issues
        )
        item.iconPath = icon

        return item
      })
  }

  private getSeverityGroupChildren(groupNode: IssueTreeItem): IssueTreeItem[] {
    // Check if this is a V2 severity group
    const v2Vulns = groupNode.v2Vulnerabilities
    if (v2Vulns && v2Vulns.length > 0) {
      return v2Vulns.map(vuln => this.createV2VulnerabilityNode(vuln))
    }

    const issues = groupNode.childIssues || []

    // Group by file if in project analysis mode
    if (this.isProjectAnalysis) {
      const byFile = new Map<string, Issue[]>()
      issues.forEach(issue => {
        const filePath = issue.filePath || 'Unknown File'
        if (!byFile.has(filePath)) {
          byFile.set(filePath, [])
        }
        byFile.get(filePath)!.push(issue)
      })

      const items: IssueTreeItem[] = []
      byFile.forEach((fileIssues, filePath) => {
        fileIssues.forEach(issue => {
          items.push(this.createIssueNode(issue, filePath))
        })
      })

      return items
    }

    // Single file mode - just list issues
    return issues.map(issue => this.createIssueNode(issue))
  }

  /**
   * Create a V2 Vulnerability Node with enhanced details
   */
  private createV2VulnerabilityNode(vuln: V2Vulnerability): IssueTreeItem {
    const confidencePercent = Math.round(vuln.confidence * 100)
    const confidenceBadge = vuln.confidenceLevel === 'HIGH' ? '✅' : vuln.confidenceLevel === 'MEDIUM' ? '⚠️' : '🔍'
    const consolidatedBadge = vuln.metadata.consolidatedFrom > 1 ? ` 🔗${vuln.metadata.consolidatedFrom}` : ''

    // Intelligence indicators
    const intelligenceBadge = this.getIntelligenceBadge(vuln)

    const lineInfo = vuln.affectedCode.lines.length > 0
      ? ` (L${vuln.affectedCode.lines[0]}${vuln.affectedCode.lines.length > 1 ? `-${vuln.affectedCode.lines[vuln.affectedCode.lines.length - 1]}` : ''})`
      : ''

    const item = new IssueTreeItem(
      `${confidenceBadge} ${vuln.primaryIssue.title}${consolidatedBadge}${intelligenceBadge}`,
      vscode.TreeItemCollapsibleState.None,
      'issue'
    )

    item.description = `${confidencePercent}% confidence${lineInfo}${this.getIntelligenceDescription(vuln)}`
    item.iconPath = this.getV2SeverityIcon(vuln.severity)
    item.tooltip = this.buildV2VulnerabilityTooltip(vuln)

    // Add command to navigate to the issue location
    if (vuln.affectedCode.lines.length > 0) {
      const activeEditor = vscode.window.activeTextEditor
      if (activeEditor) {
        item.command = {
          command: 'jokalala-code-analysis.goToIssue',
          title: 'Go to Issue',
          arguments: [activeEditor.document.uri, vuln.affectedCode.lines[0], 0],
        }
      }
    }

    return item
  }

  /**
   * Get intelligence badge for vulnerability
   */
  private getIntelligenceBadge(vuln: V2Vulnerability): string {
    if (!vuln.intelligence) {
      return ''
    }

    const badges: string[] = []

    // CISA KEV badge - most critical
    if (vuln.intelligence.cisaKEV?.knownExploited) {
      badges.push(' 🚨KEV')
    }

    // High EPSS score badge
    if (vuln.intelligence.epssScore && vuln.intelligence.epssScore >= 0.5) {
      badges.push(' ⚡')
    }

    return badges.join('')
  }

  /**
   * Get intelligence description suffix
   */
  private getIntelligenceDescription(vuln: V2Vulnerability): string {
    if (!vuln.intelligence) {
      return ''
    }

    const parts: string[] = []

    // EPSS score
    if (vuln.intelligence.epssScore !== undefined) {
      const epssPercent = Math.round(vuln.intelligence.epssScore * 100)
      parts.push(`EPSS ${epssPercent}%`)
    }

    return parts.length > 0 ? ` • ${parts.join(' • ')}` : ''
  }

  /**
   * Build V2 Vulnerability Tooltip
   */
  private buildV2VulnerabilityTooltip(vuln: V2Vulnerability): string {
    const lines = [
      `**${vuln.primaryIssue.type}**`,
      ``,
      vuln.primaryIssue.description,
      ``,
      `**Confidence**: ${Math.round(vuln.confidence * 100)}% (${vuln.confidenceLevel})`,
      `**Severity**: ${vuln.severity}`,
    ]

    if (vuln.metadata.consolidatedFrom > 1) {
      lines.push(`**Consolidated**: ${vuln.metadata.consolidatedFrom} findings merged`)
    }

    if (vuln.affectedCode.lines.length > 0) {
      lines.push(
        `**Location**: Lines ${vuln.affectedCode.lines[0]}${vuln.affectedCode.lines.length > 1 ? `-${vuln.affectedCode.lines[vuln.affectedCode.lines.length - 1]}` : ''}`
      )
    }

    if (vuln.standards.cwe) {
      lines.push(`**CWE**: ${vuln.standards.cwe}`)
    }

    if (vuln.standards.owasp) {
      lines.push(`**OWASP**: ${vuln.standards.owasp}`)
    }

    if (vuln.fix) {
      lines.push(``, `**Fix (${vuln.fix.language})**:`, vuln.fix.quickSummary)

      if (vuln.fix.alternatives && vuln.fix.alternatives.length > 0) {
        lines.push(``, `**Alternatives**: ${vuln.fix.alternatives.length} approaches available`)
      }
    }

    if (vuln.impact.security) {
      lines.push(``, `**Security Impact**: ${vuln.impact.security}`)
    }

    // Intelligence Data
    if (vuln.intelligence) {
      lines.push(``, `---`, ``, `**🔬 Threat Intelligence**:`)

      // CISA KEV
      if (vuln.intelligence.cisaKEV?.knownExploited) {
        lines.push(``, `🚨 **CISA KEV**: Known Exploited Vulnerability`)
        if (vuln.intelligence.cisaKEV.dateAdded) {
          lines.push(`   Added: ${vuln.intelligence.cisaKEV.dateAdded}`)
        }
        if (vuln.intelligence.cisaKEV.description) {
          lines.push(`   ${vuln.intelligence.cisaKEV.description}`)
        }
      }

      // EPSS Score
      if (vuln.intelligence.epssScore !== undefined) {
        const epssPercent = Math.round(vuln.intelligence.epssScore * 100)
        const epssLevel = epssPercent >= 75 ? 'CRITICAL' : epssPercent >= 50 ? 'HIGH' : epssPercent >= 25 ? 'MEDIUM' : 'LOW'
        const epssEmoji = epssPercent >= 75 ? '🔴' : epssPercent >= 50 ? '🟠' : epssPercent >= 25 ? '🟡' : '🟢'
        lines.push(``, `${epssEmoji} **EPSS Score**: ${epssPercent}% (${epssLevel} exploitation probability)`)
      }

      // CVE/NVD Data
      if (vuln.intelligence.nvdData) {
        lines.push(``, `📋 **CVE Details**:`)
        lines.push(`   CVE ID: ${vuln.intelligence.nvdData.cveId}`)
        lines.push(`   Base Score: ${vuln.intelligence.nvdData.baseScore} (${vuln.intelligence.nvdData.severity})`)
        if (vuln.intelligence.nvdData.description) {
          lines.push(`   ${vuln.intelligence.nvdData.description.substring(0, 150)}...`)
        }
      }
    }

    return lines.join('\n')
  }

  private groupBySeverity(): Record<string, Issue[]> {
    const grouped: Record<string, Issue[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
    }

    this.issues.forEach(issue => {
      const severityGroup = grouped[issue.severity]
      if (severityGroup) {
        severityGroup.push(issue)
      }
    })

    return grouped
  }

  private getSeverityIcon(severity: Issue['severity']): vscode.ThemeIcon {
    switch (severity) {
      case 'critical':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground')
        )
      case 'high':
        return new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('list.warningForeground')
        )
      case 'medium':
        return new vscode.ThemeIcon(
          'info',
          new vscode.ThemeColor('list.infoForeground')
        )
      case 'low':
        return new vscode.ThemeIcon('circle-outline')
      case 'info':
        return new vscode.ThemeIcon('lightbulb')
      default:
        return new vscode.ThemeIcon('circle-outline')
    }
  }

  private getSeverityEmoji(severity: Issue['severity']): string {
    switch (severity) {
      case 'critical':
        return '🔴'
      case 'high':
        return '🟠'
      case 'medium':
        return '🟡'
      case 'low':
        return '🟢'
      case 'info':
        return '💡'
      default:
        return '⚪'
    }
  }
}

/**
 * Tree item for the issues tree view
 */
export class IssueTreeItem extends vscode.TreeItem {
  constructor(
    public override readonly label: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TreeItemType,
    public readonly issue?: Issue,
    public readonly childIssues?: Issue[],
    public readonly filePath?: string,
    public readonly v2Vulnerabilities?: V2Vulnerability[]
  ) {
    super(label, collapsibleState)
  }
}
