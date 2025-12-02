import * as vscode from 'vscode'

export class MetricsTreeProvider
  implements vscode.TreeDataProvider<MetricTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    MetricTreeItem | undefined | null
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private metrics: any = {}

  updateMetrics(metrics: any): void {
    console.log(
      'MetricsTreeProvider: updateMetrics called with:',
      JSON.stringify(metrics, null, 2)
    )
    this.metrics = metrics
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: MetricTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(): Thenable<MetricTreeItem[]> {
    console.log('MetricsTreeProvider: getChildren called')

    if (!this.metrics || Object.keys(this.metrics).length === 0) {
      console.log('MetricsTreeProvider: No metrics available')
      return Promise.resolve([])
    }

    const items = [
      new MetricTreeItem(
        `Overall Score: ${this.metrics.overallScore ?? 0}/100`,
        'overall'
      ),
      new MetricTreeItem(
        `Total Issues: ${this.metrics.totalIssues ?? 0}`,
        'issues'
      ),
      new MetricTreeItem(
        `Critical Issues: ${this.metrics.criticalIssues ?? 0}`,
        'critical'
      ),
    ]

    // Only add these if they exist and are numbers
    if (typeof this.metrics.securityScore === 'number') {
      items.push(
        new MetricTreeItem(
          `Security Score: ${this.metrics.securityScore}/100`,
          'security'
        )
      )
    }
    if (typeof this.metrics.qualityScore === 'number') {
      items.push(
        new MetricTreeItem(
          `Quality Score: ${this.metrics.qualityScore}/100`,
          'quality'
        )
      )
    }
    if (typeof this.metrics.performanceScore === 'number') {
      items.push(
        new MetricTreeItem(
          `Performance Score: ${this.metrics.performanceScore}/100`,
          'performance'
        )
      )
    }

    // Add severity breakdown
    if (this.metrics.highSeverityIssues !== undefined) {
      items.push(
        new MetricTreeItem(
          `High Severity: ${this.metrics.highSeverityIssues}`,
          'issues'
        )
      )
    }
    if (this.metrics.mediumSeverityIssues !== undefined) {
      items.push(
        new MetricTreeItem(
          `Medium Severity: ${this.metrics.mediumSeverityIssues}`,
          'issues'
        )
      )
    }
    if (this.metrics.lowSeverityIssues !== undefined) {
      items.push(
        new MetricTreeItem(
          `Low Severity: ${this.metrics.lowSeverityIssues}`,
          'issues'
        )
      )
    }

    // Add code quality if available
    if (this.metrics.codeQuality) {
      items.push(
        new MetricTreeItem(
          `Code Quality: ${this.metrics.codeQuality}`,
          'quality'
        )
      )
    }
    if (this.metrics.securityRisk) {
      items.push(
        new MetricTreeItem(
          `Security Risk: ${this.metrics.securityRisk}`,
          'security'
        )
      )
    }

    console.log('MetricsTreeProvider: Returning', items.length, 'metric items')
    return Promise.resolve(items)
  }
}

class MetricTreeItem extends vscode.TreeItem {
  public override readonly label: string
  public override readonly collapsibleState: vscode.TreeItemCollapsibleState

  constructor(
    label: string,
    public readonly type: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.label = label
    this.collapsibleState = vscode.TreeItemCollapsibleState.None
    this.iconPath = new vscode.ThemeIcon(this.getIcon(type))
  }

  private getIcon(type: string): string {
    switch (type) {
      case 'overall':
        return 'dashboard'
      case 'issues':
        return 'bug'
      case 'critical':
        return 'error'
      case 'security':
        return 'shield'
      case 'quality':
        return 'check'
      case 'performance':
        return 'zap'
      default:
        return 'circle-outline'
    }
  }
}
