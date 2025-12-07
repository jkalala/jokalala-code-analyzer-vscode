/**
 * Refactoring Tree Provider
 *
 * Displays refactoring suggestions in the VS Code sidebar.
 * Groups issues by type (Complexity, Vulnerability, Maintainability).
 */

import * as vscode from 'vscode'
import {
  RefactoringIssue,
  RefactoringAnalysisResult,
  IssueSeverity,
  IssueType,
} from '../services/refactoring-service'

type RefactoringTreeItem = RefactoringGroupItem | RefactoringIssueItem | RefactoringInfoItem

export class RefactoringTreeProvider implements vscode.TreeDataProvider<RefactoringTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RefactoringTreeItem | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private result: RefactoringAnalysisResult | null = null
  private isLoading = false
  private errorMessage: string | null = null

  /**
   * Update with new analysis result
   */
  updateResult(result: RefactoringAnalysisResult): void {
    this.result = result
    this.errorMessage = null
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Set error message
   */
  setError(message: string | null): void {
    this.errorMessage = message
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.result = null
    this.errorMessage = null
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * Get the current result
   */
  getResult(): RefactoringAnalysisResult | null {
    return this.result
  }

  getTreeItem(element: RefactoringTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: RefactoringTreeItem): RefactoringTreeItem[] {
    if (!element) {
      return this.getRootItems()
    }

    if (element instanceof RefactoringGroupItem) {
      return element.children
    }

    return []
  }

  private getRootItems(): RefactoringTreeItem[] {
    const items: RefactoringTreeItem[] = []

    // Loading state
    if (this.isLoading) {
      items.push(new RefactoringInfoItem('$(sync~spin) Analyzing code...', 'loading'))
      return items
    }

    // Error state
    if (this.errorMessage) {
      items.push(new RefactoringInfoItem(`$(error) ${this.errorMessage}`, 'error'))
      return items
    }

    // No result yet
    if (!this.result) {
      items.push(new RefactoringInfoItem('$(lightbulb) Click "Analyze" to scan for issues', 'hint'))
      return items
    }

    // Health score summary
    const score = this.result.analysis.overallHealthScore
    const scoreIcon = score >= 80 ? '$(pass)' : score >= 50 ? '$(warning)' : '$(error)'
    items.push(new RefactoringInfoItem(
      `${scoreIcon} Health Score: ${score}/100`,
      'health',
      `Code health score based on complexity and security issues`
    ))

    // No issues found
    if (this.result.issues.length === 0) {
      items.push(new RefactoringInfoItem('$(check) No issues found!', 'success'))
      return items
    }

    // Auto-fixable count
    const autoFixable = this.result.summary.autoFixableCount
    if (autoFixable > 0) {
      items.push(new RefactoringInfoItem(
        `$(wrench) ${autoFixable} auto-fixable issue(s)`,
        'autofix',
        'Issues that can be automatically fixed'
      ))
    }

    // Group by type
    const complexity = this.result.issues.filter(i => i.type === 'complexity')
    const vulnerability = this.result.issues.filter(i => i.type === 'vulnerability')
    const maintainability = this.result.issues.filter(i => i.type === 'maintainability')

    if (vulnerability.length > 0) {
      items.push(new RefactoringGroupItem(
        `Security (${vulnerability.length})`,
        vulnerability.map(i => new RefactoringIssueItem(i)),
        'vulnerability'
      ))
    }

    if (complexity.length > 0) {
      items.push(new RefactoringGroupItem(
        `Complexity (${complexity.length})`,
        complexity.map(i => new RefactoringIssueItem(i)),
        'complexity'
      ))
    }

    if (maintainability.length > 0) {
      items.push(new RefactoringGroupItem(
        `Maintainability (${maintainability.length})`,
        maintainability.map(i => new RefactoringIssueItem(i)),
        'maintainability'
      ))
    }

    return items
  }
}

/**
 * Group item for categorizing issues by type
 */
class RefactoringGroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly children: RefactoringIssueItem[],
    public readonly groupType: IssueType
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded)

    const iconMap: Record<IssueType, vscode.ThemeIcon> = {
      vulnerability: new vscode.ThemeIcon('shield', new vscode.ThemeColor('errorForeground')),
      complexity: new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('editorWarning.foreground')),
      maintainability: new vscode.ThemeIcon('tools', new vscode.ThemeColor('editorInfo.foreground')),
    }

    this.iconPath = iconMap[groupType]
    this.contextValue = `refactoringGroup-${groupType}`
  }
}

/**
 * Tree item representing a refactoring issue
 */
class RefactoringIssueItem extends vscode.TreeItem {
  constructor(public readonly issue: RefactoringIssue) {
    super(issue.title, vscode.TreeItemCollapsibleState.None)

    this.description = `Line ${issue.location.startLine}`
    this.tooltip = new vscode.MarkdownString(
      `**${issue.title}**\n\n` +
      `${issue.description}\n\n` +
      `- Severity: ${issue.severity}\n` +
      `- Confidence: ${Math.round(issue.confidenceScore * 100)}%\n` +
      `- Auto-fixable: ${issue.autoFixable ? 'Yes' : 'No'}\n` +
      `- Effort: ${issue.estimatedEffort}`
    )

    const severityIcon: Record<IssueSeverity, vscode.ThemeIcon> = {
      critical: new vscode.ThemeIcon('flame', new vscode.ThemeColor('errorForeground')),
      high: new vscode.ThemeIcon('alert', new vscode.ThemeColor('editorWarning.foreground')),
      medium: new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorInfo.foreground')),
      low: new vscode.ThemeIcon('info'),
      info: new vscode.ThemeIcon('lightbulb'),
    }

    this.iconPath = severityIcon[issue.severity]
    this.contextValue = issue.autoFixable ? 'refactoringIssue-fixable' : 'refactoringIssue'

    // Command to show details
    this.command = {
      command: 'jokalala.showRefactoringDetails',
      title: 'Show Details',
      arguments: [issue],
    }
  }
}

/**
 * Generic info item for status messages
 */
class RefactoringInfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly infoType: 'loading' | 'error' | 'hint' | 'success' | 'health' | 'autofix',
    tooltip?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)

    if (tooltip) {
      this.tooltip = tooltip
    }

    this.contextValue = `refactoringInfo-${infoType}`
  }
}

/**
 * Register refactoring tree view
 */
export function registerRefactoringTreeView(
  context: vscode.ExtensionContext,
  provider: RefactoringTreeProvider
): vscode.TreeView<RefactoringTreeItem> {
  const treeView = vscode.window.createTreeView('jokalala-refactoring', {
    treeDataProvider: provider,
    showCollapseAll: true,
  })

  context.subscriptions.push(treeView)

  return treeView
}
