/**
 * Container and IaC Security Tree Provider
 *
 * Displays container and infrastructure-as-code security scan results
 * in a tree view organized by file type and severity.
 */

import * as vscode from 'vscode'
import type { ContainerIaCScanResult, ContainerIaCIssue, ScanType } from '../services/container-iac-service'

// =============================================================================
// Types
// =============================================================================

type TreeItemType = 'category' | 'file' | 'issue' | 'summary' | 'loading' | 'error' | 'empty'

interface ContainerIaCTreeItem extends vscode.TreeItem {
  type: TreeItemType
  scanType?: ScanType
  issue?: ContainerIaCIssue
  filePath?: string
  children?: ContainerIaCTreeItem[]
}

// =============================================================================
// Icons and Labels
// =============================================================================

const SCAN_TYPE_ICONS: Record<ScanType, string> = {
  'dockerfile': '$(file-code)',
  'docker-compose': '$(layers)',
  'kubernetes': '$(server)',
  'terraform': '$(cloud)',
  'cloudformation': '$(cloud-upload)',
  'helm': '$(package)'
}

const SCAN_TYPE_LABELS: Record<ScanType, string> = {
  'dockerfile': 'Dockerfiles',
  'docker-compose': 'Docker Compose',
  'kubernetes': 'Kubernetes',
  'terraform': 'Terraform',
  'cloudformation': 'CloudFormation',
  'helm': 'Helm Charts'
}

const SEVERITY_ICONS: Record<string, string> = {
  'critical': '$(error)',
  'high': '$(warning)',
  'medium': '$(info)',
  'low': '$(question)',
  'info': '$(lightbulb)'
}

// =============================================================================
// Tree Data Provider
// =============================================================================

export class ContainerIaCTreeProvider implements vscode.TreeDataProvider<ContainerIaCTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ContainerIaCTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ContainerIaCTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<ContainerIaCTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event

  private scanResult: ContainerIaCScanResult | null = null
  private isLoading: boolean = false
  private errorMessage: string | null = null
  private viewMode: 'byType' | 'bySeverity' = 'byType'

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Update the tree view with new scan results
   */
  updateResult(result: ContainerIaCScanResult): void {
    this.scanResult = result
    this.isLoading = false
    this.errorMessage = result.success ? null : result.error || 'Scan failed'
    this._onDidChangeTreeData.fire()
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading
    if (loading) {
      this.scanResult = null
      this.errorMessage = null
    }
    this._onDidChangeTreeData.fire()
  }

  /**
   * Set error state
   */
  setError(message: string): void {
    this.isLoading = false
    this.errorMessage = message
    this._onDidChangeTreeData.fire()
  }

  /**
   * Clear all results
   */
  clear(): void {
    this.scanResult = null
    this.isLoading = false
    this.errorMessage = null
    this._onDidChangeTreeData.fire()
  }

  /**
   * Toggle view mode between by type and by severity
   */
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'byType' ? 'bySeverity' : 'byType'
    this._onDidChangeTreeData.fire()
  }

  /**
   * Get the current view mode
   */
  getViewMode(): 'byType' | 'bySeverity' {
    return this.viewMode
  }

  /**
   * Get current scan result
   */
  getResult(): ContainerIaCScanResult | null {
    return this.scanResult
  }

  // ===========================================================================
  // Tree Data Provider Implementation
  // ===========================================================================

  getTreeItem(element: ContainerIaCTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: ContainerIaCTreeItem): Thenable<ContainerIaCTreeItem[]> {
    if (this.isLoading) {
      return Promise.resolve([this.createLoadingItem()])
    }

    if (this.errorMessage) {
      return Promise.resolve([this.createErrorItem(this.errorMessage)])
    }

    if (!this.scanResult) {
      return Promise.resolve([this.createEmptyItem()])
    }

    if (!element) {
      // Root level - show summary and categories
      return Promise.resolve(this.getRootItems())
    }

    // Get children based on element type
    if (element.type === 'category' && element.children) {
      return Promise.resolve(element.children)
    }

    if (element.type === 'file' && element.children) {
      return Promise.resolve(element.children)
    }

    return Promise.resolve([])
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getRootItems(): ContainerIaCTreeItem[] {
    if (!this.scanResult) return []

    const items: ContainerIaCTreeItem[] = []

    // Add summary item
    items.push(this.createSummaryItem())

    // Group by view mode
    if (this.viewMode === 'byType') {
      items.push(...this.groupByType())
    } else {
      items.push(...this.groupBySeverity())
    }

    return items
  }

  private groupByType(): ContainerIaCTreeItem[] {
    if (!this.scanResult) return []

    const groups = new Map<ScanType, ContainerIaCIssue[]>()

    for (const issue of this.scanResult.issues) {
      const existing = groups.get(issue.type) || []
      existing.push(issue)
      groups.set(issue.type, existing)
    }

    const items: ContainerIaCTreeItem[] = []

    for (const [type, issues] of groups) {
      const category = this.createCategoryItem(type, issues)
      items.push(category)
    }

    // Sort by issue count (descending)
    items.sort((a, b) => {
      const countA = (a.children?.length || 0)
      const countB = (b.children?.length || 0)
      return countB - countA
    })

    return items
  }

  private groupBySeverity(): ContainerIaCTreeItem[] {
    if (!this.scanResult) return []

    const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
    const groups = new Map<string, ContainerIaCIssue[]>()

    for (const issue of this.scanResult.issues) {
      const existing = groups.get(issue.severity) || []
      existing.push(issue)
      groups.set(issue.severity, existing)
    }

    const items: ContainerIaCTreeItem[] = []

    for (const severity of severityOrder) {
      const issues = groups.get(severity)
      if (issues && issues.length > 0) {
        items.push(this.createSeverityCategoryItem(severity, issues))
      }
    }

    return items
  }

  private createSummaryItem(): ContainerIaCTreeItem {
    if (!this.scanResult) {
      return this.createEmptyItem()
    }

    const { summary, scannedFiles, duration } = this.scanResult
    const label = `${summary.total} issues in ${scannedFiles} files (${duration}ms)`

    const item: ContainerIaCTreeItem = {
      type: 'summary',
      label,
      iconPath: new vscode.ThemeIcon('shield'),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      tooltip: new vscode.MarkdownString(
        `**Container/IaC Security Scan**\n\n` +
        `- Critical: ${summary.critical}\n` +
        `- High: ${summary.high}\n` +
        `- Medium: ${summary.medium}\n` +
        `- Low: ${summary.low}\n` +
        `- Info: ${summary.info}\n\n` +
        `*Scanned ${scannedFiles} files in ${duration}ms*`
      ),
      description: `C:${summary.critical} H:${summary.high} M:${summary.medium} L:${summary.low}`
    }

    return item
  }

  private createCategoryItem(type: ScanType, issues: ContainerIaCIssue[]): ContainerIaCTreeItem {
    const critical = issues.filter(i => i.severity === 'critical').length
    const high = issues.filter(i => i.severity === 'high').length

    // Group issues by file
    const fileGroups = new Map<string, ContainerIaCIssue[]>()
    for (const issue of issues) {
      const existing = fileGroups.get(issue.filePath) || []
      existing.push(issue)
      fileGroups.set(issue.filePath, existing)
    }

    const children: ContainerIaCTreeItem[] = []
    for (const [filePath, fileIssues] of fileGroups) {
      children.push(this.createFileItem(filePath, fileIssues))
    }

    const item: ContainerIaCTreeItem = {
      type: 'category',
      scanType: type,
      label: SCAN_TYPE_LABELS[type] || type,
      iconPath: new vscode.ThemeIcon(SCAN_TYPE_ICONS[type]?.replace('$(', '').replace(')', '') || 'file'),
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      description: `${issues.length} issues`,
      tooltip: `${issues.length} issues found in ${SCAN_TYPE_LABELS[type]}`,
      children
    }

    // Highlight if critical or high issues
    if (critical > 0) {
      item.description = `${issues.length} issues (${critical} critical)`
    } else if (high > 0) {
      item.description = `${issues.length} issues (${high} high)`
    }

    return item
  }

  private createSeverityCategoryItem(severity: string, issues: ContainerIaCIssue[]): ContainerIaCTreeItem {
    const children = issues.map(issue => this.createIssueItem(issue))

    const item: ContainerIaCTreeItem = {
      type: 'category',
      label: severity.charAt(0).toUpperCase() + severity.slice(1),
      iconPath: new vscode.ThemeIcon(
        SEVERITY_ICONS[severity]?.replace('$(', '').replace(')', '') || 'circle-outline'
      ),
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      description: `${issues.length} issues`,
      children
    }

    return item
  }

  private createFileItem(filePath: string, issues: ContainerIaCIssue[]): ContainerIaCTreeItem {
    const children = issues.map(issue => this.createIssueItem(issue))

    const item: ContainerIaCTreeItem = {
      type: 'file',
      filePath,
      label: filePath.split('/').pop() || filePath,
      iconPath: new vscode.ThemeIcon('file'),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      description: `${issues.length} issues`,
      tooltip: filePath,
      resourceUri: vscode.Uri.file(filePath),
      children
    }

    return item
  }

  private createIssueItem(issue: ContainerIaCIssue): ContainerIaCTreeItem {
    const item: ContainerIaCTreeItem = {
      type: 'issue',
      issue,
      label: issue.title,
      iconPath: new vscode.ThemeIcon(
        SEVERITY_ICONS[issue.severity]?.replace('$(', '').replace(')', '') || 'circle-outline'
      ),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      description: `Line ${issue.line}`,
      tooltip: new vscode.MarkdownString(
        `**${issue.title}** (${issue.severity.toUpperCase()})\n\n` +
        `${issue.description}\n\n` +
        `**Location:** ${issue.filePath}:${issue.line}\n\n` +
        (issue.fix ? `**Fix:** ${issue.fix}\n\n` : '') +
        (issue.cwe ? `**CWE:** ${issue.cwe}` : '')
      ),
      command: {
        command: 'jokalala.goToContainerIaCIssue',
        title: 'Go to Issue',
        arguments: [issue]
      }
    }

    return item
  }

  private createLoadingItem(): ContainerIaCTreeItem {
    return {
      type: 'loading',
      label: 'Scanning container and IaC files...',
      iconPath: new vscode.ThemeIcon('sync~spin'),
      collapsibleState: vscode.TreeItemCollapsibleState.None
    }
  }

  private createErrorItem(message: string): ContainerIaCTreeItem {
    return {
      type: 'error',
      label: 'Scan failed',
      description: message,
      iconPath: new vscode.ThemeIcon('error'),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      tooltip: message
    }
  }

  private createEmptyItem(): ContainerIaCTreeItem {
    return {
      type: 'empty',
      label: 'No container/IaC scan results',
      description: 'Run "Scan Container/IaC" to analyze',
      iconPath: new vscode.ThemeIcon('shield'),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        command: 'jokalala.scanContainerIaC',
        title: 'Scan Container/IaC'
      }
    }
  }
}

// =============================================================================
// Registration Helper
// =============================================================================

export function registerContainerIaCTreeView(
  context: vscode.ExtensionContext,
  treeProvider: ContainerIaCTreeProvider
): vscode.TreeView<ContainerIaCTreeItem> {
  const treeView = vscode.window.createTreeView('jokalala-container-iac', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  })

  context.subscriptions.push(treeView)

  return treeView
}
