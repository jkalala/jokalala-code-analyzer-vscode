/**
 * SCA Tree Provider
 *
 * Displays Software Composition Analysis results in the VS Code sidebar,
 * including dependencies, vulnerabilities, and license information.
 */

import * as vscode from 'vscode'
import {
  SCAScanResult,
  SCADependency,
  SCAVulnerability,
  LicenseRisk,
} from '../services/sca-service'

type SCATreeItem =
  | SummaryItem
  | VulnerabilityItem
  | DependencyItem
  | LicenseItem
  | CategoryItem

// =============================================================================
// Tree Item Classes
// =============================================================================

class CategoryItem extends vscode.TreeItem {
  public readonly itemCount: number
  public readonly category: 'vulnerabilities' | 'dependencies' | 'licenses' | 'summary'

  constructor(
    label: string,
    itemCount: number,
    category: 'vulnerabilities' | 'dependencies' | 'licenses' | 'summary'
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed)
    this.itemCount = itemCount
    this.category = category
    this.description = `(${itemCount})`
    this.contextValue = `sca-category-${category}`

    switch (category) {
      case 'vulnerabilities':
        this.iconPath = new vscode.ThemeIcon('shield')
        break
      case 'dependencies':
        this.iconPath = new vscode.ThemeIcon('package')
        break
      case 'licenses':
        this.iconPath = new vscode.ThemeIcon('law')
        break
      case 'summary':
        this.iconPath = new vscode.ThemeIcon('graph')
        break
    }
  }
}

class SummaryItem extends vscode.TreeItem {
  public readonly value: string

  constructor(
    label: string,
    value: string,
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.value = value
    this.description = value
    this.contextValue = 'sca-summary'

    if (severity) {
      const colors = {
        critical: 'errorForeground',
        high: 'errorForeground',
        medium: 'warningForeground',
        low: 'foreground',
        info: 'foreground',
      } as const
      const iconName = severity === 'critical' || severity === 'high' ? 'error' : 'info'
      const colorName = colors[severity]
      this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(colorName))
    }
  }
}

class VulnerabilityItem extends vscode.TreeItem {
  constructor(public readonly vulnerability: SCAVulnerability) {
    super(vulnerability.id, vscode.TreeItemCollapsibleState.None)

    this.description = `${vulnerability.packageName}@${vulnerability.packageVersion}`
    this.tooltip = new vscode.MarkdownString(
      `**${vulnerability.title}**\n\n` +
        `**Severity:** ${vulnerability.severity.toUpperCase()}\n\n` +
        `**Package:** ${vulnerability.packageName}@${vulnerability.packageVersion}\n\n` +
        `${vulnerability.description.substring(0, 200)}...`
    )

    this.contextValue = vulnerability.fixAvailable
      ? 'sca-vulnerability-fixable'
      : 'sca-vulnerability'

    // Set icon based on severity
    const icons: Record<string, [string, string]> = {
      critical: ['error', 'errorForeground'],
      high: ['warning', 'errorForeground'],
      medium: ['warning', 'warningForeground'],
      low: ['info', 'foreground'],
      info: ['info', 'foreground'],
    }
    const [icon, color] = icons[vulnerability.severity] || ['info', 'foreground']
    this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color))

    // Add CISA KEV badge
    if (vulnerability.cisaKev) {
      this.description += ' 🚨 KEV'
    }

    // Command to show details
    this.command = {
      command: 'jokalala.showSCAVulnerabilityDetails',
      title: 'Show Details',
      arguments: [vulnerability],
    }
  }
}

class DependencyItem extends vscode.TreeItem {
  constructor(public readonly dependency: SCADependency) {
    super(dependency.name, vscode.TreeItemCollapsibleState.None)

    this.description = dependency.version
    this.tooltip = new vscode.MarkdownString(
      `**${dependency.name}@${dependency.version}**\n\n` +
        `**Type:** ${dependency.type}\n` +
        `**Ecosystem:** ${dependency.ecosystem}\n` +
        (dependency.license ? `**License:** ${dependency.license}\n` : '') +
        (dependency.deprecated ? '\n⚠️ **Deprecated**' : '')
    )

    this.contextValue = dependency.deprecated
      ? 'sca-dependency-deprecated'
      : 'sca-dependency'

    // Icon based on type
    const icons: Record<string, string> = {
      direct: 'package',
      dev: 'beaker',
      transitive: 'references',
      optional: 'question',
      peer: 'link',
    }
    this.iconPath = new vscode.ThemeIcon(icons[dependency.type] || 'package')

    // Mark deprecated packages
    if (dependency.deprecated) {
      this.description += ' ⚠️ deprecated'
    }
  }
}

class LicenseItem extends vscode.TreeItem {
  constructor(public readonly license: LicenseRisk) {
    super(license.license, vscode.TreeItemCollapsibleState.None)

    this.description = `${license.risk} risk`
    this.tooltip = new vscode.MarkdownString(
      `**${license.license}**\n\n` +
        `**Risk Level:** ${license.risk.toUpperCase()}\n\n` +
        (license.issue ? `**Issue:** ${license.issue}` : '')
    )

    this.contextValue = `sca-license-${license.risk}`

    // Icon based on risk
    const icons: Record<string, [string, string]> = {
      high: ['warning', 'errorForeground'],
      medium: ['info', 'warningForeground'],
      low: ['check', 'foreground'],
      unknown: ['question', 'foreground'],
    }
    const [icon, color] = icons[license.risk] || ['question', 'foreground']
    this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color))
  }
}

// =============================================================================
// Tree Data Provider
// =============================================================================

export class SCATreeProvider implements vscode.TreeDataProvider<SCATreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SCATreeItem | undefined | null | void
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private result: SCAScanResult | null = null
  private isLoading = false
  private error: string | null = null

  setLoading(loading: boolean): void {
    this.isLoading = loading
    this.error = null
    this._onDidChangeTreeData.fire()
  }

  setError(error: string): void {
    this.error = error
    this.isLoading = false
    this._onDidChangeTreeData.fire()
  }

  updateResult(result: SCAScanResult): void {
    this.result = result
    this.isLoading = false
    this.error = null
    this._onDidChangeTreeData.fire()
  }

  clear(): void {
    this.result = null
    this.error = null
    this.isLoading = false
    this._onDidChangeTreeData.fire()
  }

  getResult(): SCAScanResult | null {
    return this.result
  }

  getTreeItem(element: SCATreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: SCATreeItem): SCATreeItem[] {
    if (this.isLoading) {
      return [new SummaryItem('Scanning dependencies...', '', undefined)]
    }

    if (this.error) {
      return [new SummaryItem('Error', this.error, 'high')]
    }

    if (!this.result) {
      return [
        new SummaryItem(
          'No scan results',
          'Run "Jokalala: Scan Dependencies" to start',
          undefined
        ),
      ]
    }

    // Root level - show categories
    if (!element) {
      return [
        new CategoryItem('Summary', 5, 'summary'),
        new CategoryItem(
          'Vulnerabilities',
          this.result.vulnerabilitySummary.total,
          'vulnerabilities'
        ),
        new CategoryItem('Dependencies', this.result.totalPackages, 'dependencies'),
        new CategoryItem(
          'Licenses',
          this.result.licenses.unique.length,
          'licenses'
        ),
      ]
    }

    // Category children
    if (element instanceof CategoryItem) {
      switch (element.category) {
        case 'summary':
          return this.getSummaryItems()
        case 'vulnerabilities':
          return this.getVulnerabilityItems()
        case 'dependencies':
          return this.getDependencyItems()
        case 'licenses':
          return this.getLicenseItems()
      }
    }

    return []
  }

  private getSummaryItems(): SummaryItem[] {
    if (!this.result) return []

    const items: SummaryItem[] = [
      new SummaryItem('Risk Score', `${this.result.riskScore}/100`, undefined),
      new SummaryItem('Ecosystem', this.result.ecosystem, undefined),
      new SummaryItem(
        'Total Packages',
        `${this.result.totalPackages} (${this.result.directPackages} direct)`,
        undefined
      ),
    ]

    const { critical, high, medium, low } = this.result.vulnerabilitySummary
    if (critical > 0) {
      items.push(
        new SummaryItem('Critical Vulnerabilities', critical.toString(), 'critical')
      )
    }
    if (high > 0) {
      items.push(new SummaryItem('High Vulnerabilities', high.toString(), 'high'))
    }
    if (medium > 0) {
      items.push(new SummaryItem('Medium Vulnerabilities', medium.toString(), 'medium'))
    }
    if (low > 0) {
      items.push(new SummaryItem('Low Vulnerabilities', low.toString(), 'low'))
    }

    if (this.result.licenses.copyleftCount > 0) {
      items.push(
        new SummaryItem(
          'Copyleft Licenses',
          this.result.licenses.copyleftCount.toString(),
          'medium'
        )
      )
    }

    return items
  }

  private getVulnerabilityItems(): VulnerabilityItem[] {
    if (!this.result) return []

    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

    return this.result.vulnerabilities
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .map((v) => new VulnerabilityItem(v))
  }

  private getDependencyItems(): DependencyItem[] {
    if (!this.result) return []

    // Sort: direct first, then by name
    const typeOrder = { direct: 0, dev: 1, peer: 2, optional: 3, transitive: 4 }

    return this.result.dependencies
      .sort((a, b) => {
        const typeDiff = typeOrder[a.type] - typeOrder[b.type]
        if (typeDiff !== 0) return typeDiff
        return a.name.localeCompare(b.name)
      })
      .slice(0, 100) // Limit to 100 dependencies for performance
      .map((d) => new DependencyItem(d))
  }

  private getLicenseItems(): LicenseItem[] {
    if (!this.result) return []

    // Create license items from unique licenses and risks
    const riskLicenses = this.result.licenses.risks

    // Add unknown risk items for other licenses
    const knownLicenses = new Set(riskLicenses.map((r) => r.license))
    const unknownLicenses = this.result.licenses.unique
      .filter((l) => !knownLicenses.has(l))
      .map((l) => ({ license: l, risk: 'unknown' as const, packages: [] }))

    return [...riskLicenses, ...unknownLicenses]
      .sort((a, b) => {
        const riskOrder = { high: 0, medium: 1, low: 2, unknown: 3 }
        return riskOrder[a.risk] - riskOrder[b.risk]
      })
      .map((l) => new LicenseItem(l))
  }
}

// =============================================================================
// Registration Helper
// =============================================================================

export function registerSCATreeView(
  context: vscode.ExtensionContext,
  provider: SCATreeProvider
): vscode.TreeView<SCATreeItem> {
  const treeView = vscode.window.createTreeView('jokalala-sca', {
    treeDataProvider: provider,
    showCollapseAll: true,
  })

  context.subscriptions.push(treeView)
  return treeView
}
