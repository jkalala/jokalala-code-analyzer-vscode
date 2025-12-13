/**
 * Plugins Tree Provider
 *
 * Tree view for managing plugins and custom rules in the VS Code extension.
 * Provides a visual interface for:
 * - Viewing installed plugins
 * - Enabling/disabling plugins
 * - Managing custom rules
 * - Creating new plugins
 * - Importing/exporting rules
 *
 * @module providers/plugins-tree-provider
 */

import * as vscode from 'vscode'
import * as path from 'path'
import {
  PluginManager,
  LoadedPlugin,
  PluginStatus,
  PluginType,
  getPluginManager,
  initializePluginManager,
} from '../services/plugin-manager'
import {
  CustomRule,
  RuleCategory,
  RuleSeverity,
  getCustomRuleEngine,
} from '../core/custom-rules'

/**
 * Tree item types
 */
enum TreeItemType {
  PLUGINS_HEADER = 'plugins-header',
  PLUGIN = 'plugin',
  RULES_HEADER = 'rules-header',
  RULE_CATEGORY = 'rule-category',
  RULE = 'rule',
  ACTIONS = 'actions',
  ACTION = 'action',
  STATISTICS = 'statistics',
  STAT_ITEM = 'stat-item',
}

/**
 * Plugin tree item
 */
class PluginTreeItem extends vscode.TreeItem {
  constructor(
    public readonly type: TreeItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: LoadedPlugin | CustomRule | { category: RuleCategory; rules: CustomRule[] } | { key: string; value: string | number }
  ) {
    super(label, collapsibleState)
    this.contextValue = type
    this.setupTreeItem()
  }

  private setupTreeItem(): void {
    switch (this.type) {
      case TreeItemType.PLUGINS_HEADER:
        this.iconPath = new vscode.ThemeIcon('extensions')
        this.contextValue = 'pluginsHeader'
        break

      case TreeItemType.PLUGIN:
        const plugin = this.data as LoadedPlugin
        this.description = `v${plugin.manifest.version}`
        this.tooltip = this.createPluginTooltip(plugin)
        this.iconPath = this.getPluginIcon(plugin)
        this.contextValue = `plugin-${plugin.status}`
        break

      case TreeItemType.RULES_HEADER:
        this.iconPath = new vscode.ThemeIcon('checklist')
        this.contextValue = 'rulesHeader'
        break

      case TreeItemType.RULE_CATEGORY:
        const categoryData = this.data as { category: RuleCategory; rules: CustomRule[] }
        this.description = `${categoryData.rules.length} rules`
        this.iconPath = this.getCategoryIcon(categoryData.category)
        this.contextValue = 'ruleCategory'
        break

      case TreeItemType.RULE:
        const rule = this.data as CustomRule
        this.description = rule.enabled ? rule.severity : '(disabled)'
        this.tooltip = this.createRuleTooltip(rule)
        this.iconPath = this.getSeverityIcon(rule.severity, rule.enabled)
        this.contextValue = `rule-${rule.enabled ? 'enabled' : 'disabled'}`
        break

      case TreeItemType.ACTIONS:
        this.iconPath = new vscode.ThemeIcon('tools')
        this.contextValue = 'actionsHeader'
        break

      case TreeItemType.ACTION:
        this.iconPath = new vscode.ThemeIcon('play')
        this.contextValue = 'action'
        break

      case TreeItemType.STATISTICS:
        this.iconPath = new vscode.ThemeIcon('graph')
        this.contextValue = 'statisticsHeader'
        break

      case TreeItemType.STAT_ITEM:
        const stat = this.data as { key: string; value: string | number }
        this.description = String(stat.value)
        this.iconPath = new vscode.ThemeIcon('symbol-numeric')
        this.contextValue = 'statItem'
        break
    }
  }

  private createPluginTooltip(plugin: LoadedPlugin): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.appendMarkdown(`## ${plugin.manifest.displayName || plugin.manifest.name}\n\n`)
    md.appendMarkdown(`**Version:** ${plugin.manifest.version}\n\n`)
    md.appendMarkdown(`**Type:** ${plugin.manifest.type}\n\n`)
    md.appendMarkdown(`**Status:** ${plugin.status}\n\n`)

    if (plugin.manifest.description) {
      md.appendMarkdown(`${plugin.manifest.description}\n\n`)
    }

    if (plugin.manifest.author) {
      md.appendMarkdown(`**Author:** ${plugin.manifest.author}\n\n`)
    }

    const rulesCount = plugin.manifest.contributes?.rules?.length || 0
    if (rulesCount > 0) {
      md.appendMarkdown(`**Rules:** ${rulesCount}\n\n`)
    }

    if (plugin.error) {
      md.appendMarkdown(`\n**Error:** ${plugin.error}`)
    }

    return md
  }

  private createRuleTooltip(rule: CustomRule): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.appendMarkdown(`## ${rule.name}\n\n`)
    md.appendMarkdown(`**ID:** \`${rule.id}\`\n\n`)
    md.appendMarkdown(`**Severity:** ${rule.severity}\n\n`)
    md.appendMarkdown(`**Category:** ${rule.category}\n\n`)
    md.appendMarkdown(`${rule.description}\n\n`)

    if (rule.metadata?.cwe?.length) {
      md.appendMarkdown(`**CWE:** ${rule.metadata.cwe.join(', ')}\n\n`)
    }

    if (rule.metadata?.owasp?.length) {
      md.appendMarkdown(`**OWASP:** ${rule.metadata.owasp.join(', ')}\n\n`)
    }

    md.appendMarkdown(`**Languages:** ${rule.languages.join(', ')}\n\n`)
    md.appendMarkdown(`**Patterns:** ${rule.patterns.length}`)

    return md
  }

  private getPluginIcon(plugin: LoadedPlugin): vscode.ThemeIcon {
    switch (plugin.status) {
      case PluginStatus.ENABLED:
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
      case PluginStatus.DISABLED:
        return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'))
      case PluginStatus.ERROR:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
      default:
        return new vscode.ThemeIcon('package')
    }
  }

  private getCategoryIcon(category: RuleCategory): vscode.ThemeIcon {
    switch (category) {
      case RuleCategory.SECURITY:
        return new vscode.ThemeIcon('shield')
      case RuleCategory.QUALITY:
        return new vscode.ThemeIcon('sparkle')
      case RuleCategory.PERFORMANCE:
        return new vscode.ThemeIcon('dashboard')
      case RuleCategory.STYLE:
        return new vscode.ThemeIcon('paintcan')
      case RuleCategory.BEST_PRACTICE:
        return new vscode.ThemeIcon('lightbulb')
      case RuleCategory.COMPLIANCE:
        return new vscode.ThemeIcon('verified')
      default:
        return new vscode.ThemeIcon('symbol-misc')
    }
  }

  private getSeverityIcon(severity: RuleSeverity, enabled: boolean): vscode.ThemeIcon {
    if (!enabled) {
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'))
    }

    switch (severity) {
      case RuleSeverity.CRITICAL:
        return new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red'))
      case RuleSeverity.HIGH:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'))
      case RuleSeverity.MEDIUM:
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.yellow'))
      case RuleSeverity.LOW:
        return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'))
      case RuleSeverity.INFO:
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.gray'))
      default:
        return new vscode.ThemeIcon('circle')
    }
  }
}

/**
 * Plugins Tree Data Provider
 */
export class PluginsTreeProvider implements vscode.TreeDataProvider<PluginTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PluginTreeItem | undefined | null | void> =
    new vscode.EventEmitter<PluginTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<PluginTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event

  private pluginManager: PluginManager | null = null
  private ruleEngine = getCustomRuleEngine()

  constructor() {
    // Listen for rule engine events
    this.ruleEngine.on('rule-added', () => this.refresh())
    this.ruleEngine.on('rule-removed', () => this.refresh())
    this.ruleEngine.on('rule-toggled', () => this.refresh())
    this.ruleEngine.on('pack-added', () => this.refresh())
    this.ruleEngine.on('pack-removed', () => this.refresh())
  }

  /**
   * Initialize with extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.pluginManager = await initializePluginManager(context)

    // Listen for plugin manager events
    this.pluginManager.on('plugin-loaded', () => this.refresh())
    this.pluginManager.on('plugin-unloaded', () => this.refresh())
    this.pluginManager.on('plugin-enabled', () => this.refresh())
    this.pluginManager.on('plugin-disabled', () => this.refresh())
    this.pluginManager.on('rules-updated', () => this.refresh())
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: PluginTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: PluginTreeItem): Promise<PluginTreeItem[]> {
    if (!element) {
      // Root level - show sections
      return [
        new PluginTreeItem(
          TreeItemType.PLUGINS_HEADER,
          'Plugins',
          vscode.TreeItemCollapsibleState.Expanded
        ),
        new PluginTreeItem(
          TreeItemType.RULES_HEADER,
          'Custom Rules',
          vscode.TreeItemCollapsibleState.Expanded
        ),
        new PluginTreeItem(
          TreeItemType.STATISTICS,
          'Statistics',
          vscode.TreeItemCollapsibleState.Collapsed
        ),
        new PluginTreeItem(
          TreeItemType.ACTIONS,
          'Actions',
          vscode.TreeItemCollapsibleState.Collapsed
        ),
      ]
    }

    switch (element.type) {
      case TreeItemType.PLUGINS_HEADER:
        return this.getPluginItems()

      case TreeItemType.RULES_HEADER:
        return this.getRuleCategoryItems()

      case TreeItemType.RULE_CATEGORY:
        return this.getRuleItems(element.data as { category: RuleCategory; rules: CustomRule[] })

      case TreeItemType.STATISTICS:
        return this.getStatisticsItems()

      case TreeItemType.ACTIONS:
        return this.getActionItems()

      default:
        return []
    }
  }

  private getPluginItems(): PluginTreeItem[] {
    if (!this.pluginManager) {
      return [
        new PluginTreeItem(
          TreeItemType.ACTION,
          'No plugins loaded',
          vscode.TreeItemCollapsibleState.None
        ),
      ]
    }

    const plugins = this.pluginManager.getPlugins()

    if (plugins.length === 0) {
      return [
        new PluginTreeItem(
          TreeItemType.ACTION,
          'No plugins installed',
          vscode.TreeItemCollapsibleState.None
        ),
      ]
    }

    return plugins.map(
      plugin =>
        new PluginTreeItem(
          TreeItemType.PLUGIN,
          plugin.manifest.displayName || plugin.manifest.name,
          vscode.TreeItemCollapsibleState.None,
          plugin
        )
    )
  }

  private getRuleCategoryItems(): PluginTreeItem[] {
    const rules = this.ruleEngine.getRules()

    if (rules.length === 0) {
      return [
        new PluginTreeItem(
          TreeItemType.ACTION,
          'No custom rules defined',
          vscode.TreeItemCollapsibleState.None
        ),
      ]
    }

    // Group rules by category
    const byCategory = new Map<RuleCategory, CustomRule[]>()
    for (const rule of rules) {
      const category = rule.category
      if (!byCategory.has(category)) {
        byCategory.set(category, [])
      }
      byCategory.get(category)!.push(rule)
    }

    return Array.from(byCategory.entries()).map(
      ([category, categoryRules]) =>
        new PluginTreeItem(
          TreeItemType.RULE_CATEGORY,
          this.formatCategoryName(category),
          vscode.TreeItemCollapsibleState.Collapsed,
          { category, rules: categoryRules }
        )
    )
  }

  private getRuleItems(categoryData: { category: RuleCategory; rules: CustomRule[] }): PluginTreeItem[] {
    return categoryData.rules.map(
      rule =>
        new PluginTreeItem(
          TreeItemType.RULE,
          rule.name,
          vscode.TreeItemCollapsibleState.None,
          rule
        )
    )
  }

  private getStatisticsItems(): PluginTreeItem[] {
    const pluginStats = this.pluginManager?.getStatistics() || {
      total: 0,
      enabled: 0,
      disabled: 0,
      errors: 0,
      byType: {},
      totalRules: 0,
    }
    const ruleStats = this.ruleEngine.getStatistics()

    const items: PluginTreeItem[] = [
      new PluginTreeItem(
        TreeItemType.STAT_ITEM,
        'Total Plugins',
        vscode.TreeItemCollapsibleState.None,
        { key: 'totalPlugins', value: pluginStats.total }
      ),
      new PluginTreeItem(
        TreeItemType.STAT_ITEM,
        'Enabled Plugins',
        vscode.TreeItemCollapsibleState.None,
        { key: 'enabledPlugins', value: pluginStats.enabled }
      ),
      new PluginTreeItem(
        TreeItemType.STAT_ITEM,
        'Total Rules',
        vscode.TreeItemCollapsibleState.None,
        { key: 'totalRules', value: ruleStats.totalRules }
      ),
      new PluginTreeItem(
        TreeItemType.STAT_ITEM,
        'Enabled Rules',
        vscode.TreeItemCollapsibleState.None,
        { key: 'enabledRules', value: ruleStats.enabledRules }
      ),
      new PluginTreeItem(
        TreeItemType.STAT_ITEM,
        'Rule Packs',
        vscode.TreeItemCollapsibleState.None,
        { key: 'rulePacks', value: ruleStats.packsLoaded }
      ),
    ]

    return items
  }

  private getActionItems(): PluginTreeItem[] {
    return [
      this.createActionItem('Create Plugin', 'jokalala.createPlugin', 'add'),
      this.createActionItem('Import Rules', 'jokalala.importRules', 'cloud-download'),
      this.createActionItem('Export Rules', 'jokalala.exportRules', 'cloud-upload'),
      this.createActionItem('Reload Plugins', 'jokalala.reloadPlugins', 'refresh'),
      this.createActionItem('Open Plugins Folder', 'jokalala.openPluginsFolder', 'folder-opened'),
    ]
  }

  private createActionItem(label: string, command: string, icon: string): PluginTreeItem {
    const item = new PluginTreeItem(
      TreeItemType.ACTION,
      label,
      vscode.TreeItemCollapsibleState.None
    )
    item.command = {
      command,
      title: label,
    }
    item.iconPath = new vscode.ThemeIcon(icon)
    return item
  }

  private formatCategoryName(category: RuleCategory): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Get plugin manager instance
   */
  getPluginManager(): PluginManager | null {
    return this.pluginManager
  }
}

/**
 * Register the plugins tree view
 */
export function registerPluginsTreeView(
  context: vscode.ExtensionContext,
  provider: PluginsTreeProvider
): vscode.TreeView<PluginTreeItem> {
  const treeView = vscode.window.createTreeView('jokalala-plugins', {
    treeDataProvider: provider,
    showCollapseAll: true,
  })

  return treeView
}

/**
 * Register plugin-related commands
 */
export function registerPluginCommands(
  context: vscode.ExtensionContext,
  provider: PluginsTreeProvider
): void {
  // Create new plugin
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.createPlugin', async () => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager) {
        vscode.window.showErrorMessage('Plugin manager not initialized')
        return
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter plugin name',
        placeHolder: 'My Custom Plugin',
        validateInput: value => {
          if (!value || value.length < 3) {
            return 'Name must be at least 3 characters'
          }
          return null
        },
      })

      if (!name) return

      const type = await vscode.window.showQuickPick(
        [
          { label: 'Pattern Plugin', description: 'Add custom security rules', value: PluginType.PATTERN },
          { label: 'Language Plugin', description: 'Add language support', value: PluginType.LANGUAGE },
          { label: 'Enricher Plugin', description: 'Enrich analysis results', value: PluginType.ENRICHER },
          { label: 'Hook Plugin', description: 'Add lifecycle hooks', value: PluginType.HOOK },
        ],
        { placeHolder: 'Select plugin type' }
      )

      if (!type) return

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open')
        return
      }

      const targetPath = path.join(workspaceFolder.uri.fsPath, '.jokalala', 'plugins')

      try {
        const pluginPath = await pluginManager.createPluginScaffold(name, type.value, targetPath)
        const manifestUri = vscode.Uri.file(path.join(pluginPath, 'jokalala-plugin.json'))
        const doc = await vscode.workspace.openTextDocument(manifestUri)
        await vscode.window.showTextDocument(doc)
        vscode.window.showInformationMessage(`Plugin "${name}" created successfully!`)
        provider.refresh()
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create plugin: ${error.message}`)
      }
    })
  )

  // Import rules
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.importRules', async () => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager) return

      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON files': ['json'] },
        title: 'Import Rules',
      })

      if (!uri || uri.length === 0) return

      const result = await pluginManager.importRulesFromFile(uri[0])

      if (result.errors.length > 0) {
        vscode.window.showWarningMessage(
          `Imported ${result.imported} rules with ${result.errors.length} errors`
        )
      } else {
        vscode.window.showInformationMessage(`Successfully imported ${result.imported} rules`)
      }

      provider.refresh()
    })
  )

  // Export rules
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.exportRules', async () => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager) return

      const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON files': ['json'] },
        defaultUri: vscode.Uri.file('jokalala-rules.json'),
        title: 'Export Rules',
      })

      if (!uri) return

      await pluginManager.exportRulesToFile(uri)
      vscode.window.showInformationMessage(`Rules exported to ${path.basename(uri.fsPath)}`)
    })
  )

  // Reload plugins
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.reloadPlugins', async () => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager) return

      await pluginManager.discoverPlugins()
      provider.refresh()
      vscode.window.showInformationMessage('Plugins reloaded')
    })
  )

  // Open plugins folder
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.openPluginsFolder', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open')
        return
      }

      const pluginsPath = path.join(workspaceFolder.uri.fsPath, '.jokalala', 'plugins')

      // Create directory if it doesn't exist
      const fs = await import('fs')
      if (!fs.existsSync(pluginsPath)) {
        fs.mkdirSync(pluginsPath, { recursive: true })
      }

      const uri = vscode.Uri.file(pluginsPath)
      vscode.commands.executeCommand('revealFileInOS', uri)
    })
  )

  // Enable plugin
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.enablePlugin', async (item: PluginTreeItem) => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager || item.type !== TreeItemType.PLUGIN) return

      const plugin = item.data as LoadedPlugin
      await pluginManager.enablePlugin(plugin.manifest.id)
      provider.refresh()
      vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" enabled`)
    })
  )

  // Disable plugin
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.disablePlugin', async (item: PluginTreeItem) => {
      const pluginManager = provider.getPluginManager()
      if (!pluginManager || item.type !== TreeItemType.PLUGIN) return

      const plugin = item.data as LoadedPlugin
      await pluginManager.disablePlugin(plugin.manifest.id)
      provider.refresh()
      vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" disabled`)
    })
  )

  // Enable rule
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.enableRule', (item: PluginTreeItem) => {
      if (item.type !== TreeItemType.RULE) return

      const rule = item.data as CustomRule
      const ruleEngine = getCustomRuleEngine()
      ruleEngine.setRuleEnabled(rule.id, true)
      provider.refresh()
      vscode.window.showInformationMessage(`Rule "${rule.name}" enabled`)
    })
  )

  // Disable rule
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.disableRule', (item: PluginTreeItem) => {
      if (item.type !== TreeItemType.RULE) return

      const rule = item.data as CustomRule
      const ruleEngine = getCustomRuleEngine()
      ruleEngine.setRuleEnabled(rule.id, false)
      provider.refresh()
      vscode.window.showInformationMessage(`Rule "${rule.name}" disabled`)
    })
  )

  // Show rule details
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.showRuleDetails', (item: PluginTreeItem) => {
      if (item.type !== TreeItemType.RULE) return

      const rule = item.data as CustomRule
      const panel = vscode.window.createWebviewPanel(
        'ruleDetails',
        `Rule: ${rule.name}`,
        vscode.ViewColumn.Beside,
        {}
      )

      panel.webview.html = getRuleDetailsHtml(rule)
    })
  )

  // Test rule
  context.subscriptions.push(
    vscode.commands.registerCommand('jokalala.testRule', async (item: PluginTreeItem) => {
      if (item.type !== TreeItemType.RULE) return

      const rule = item.data as CustomRule
      const ruleEngine = getCustomRuleEngine()

      try {
        const results = ruleEngine.testRule(rule.id)

        if (results.length === 0) {
          vscode.window.showInformationMessage('No test cases defined for this rule')
          return
        }

        const passed = results.filter(r => r.passed).length
        const failed = results.filter(r => !r.passed).length

        if (failed === 0) {
          vscode.window.showInformationMessage(
            `All ${passed} test(s) passed for "${rule.name}"`
          )
        } else {
          vscode.window.showWarningMessage(
            `${passed} passed, ${failed} failed for "${rule.name}"`
          )
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Test failed: ${error.message}`)
      }
    })
  )
}

/**
 * Generate HTML for rule details panel
 */
function getRuleDetailsHtml(rule: CustomRule): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Rule: ${rule.name}</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
        }
        h1 { color: var(--vscode-titleBar-activeForeground); }
        h2 { color: var(--vscode-titleBar-activeForeground); margin-top: 20px; }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-right: 8px;
        }
        .severity-critical { background-color: #dc3545; color: white; }
        .severity-high { background-color: #fd7e14; color: white; }
        .severity-medium { background-color: #ffc107; color: black; }
        .severity-low { background-color: #0dcaf0; color: black; }
        .severity-info { background-color: #6c757d; color: white; }
        .category { background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
        .tag { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        pre {
          background-color: var(--vscode-textCodeBlock-background);
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
        }
        code { font-family: var(--vscode-editor-font-family); }
        .section { margin-bottom: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
        th { font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>${rule.name}</h1>
      <p><code>${rule.id}</code></p>

      <div class="section">
        <span class="badge severity-${rule.severity}">${rule.severity.toUpperCase()}</span>
        <span class="badge category">${rule.category}</span>
        ${rule.tags.map(tag => `<span class="badge tag">${tag}</span>`).join('')}
      </div>

      <div class="section">
        <h2>Description</h2>
        <p>${rule.description}</p>
      </div>

      <div class="section">
        <h2>Message</h2>
        <p>${rule.message.default}</p>
        ${rule.message.fix ? `<p><strong>Fix:</strong> ${rule.message.fix}</p>` : ''}
      </div>

      <div class="section">
        <h2>Languages</h2>
        <p>${rule.languages.join(', ')}</p>
      </div>

      ${rule.metadata?.cwe?.length ? `
      <div class="section">
        <h2>CWE References</h2>
        <p>${rule.metadata.cwe.join(', ')}</p>
      </div>
      ` : ''}

      ${rule.metadata?.owasp?.length ? `
      <div class="section">
        <h2>OWASP References</h2>
        <p>${rule.metadata.owasp.join(', ')}</p>
      </div>
      ` : ''}

      <div class="section">
        <h2>Patterns</h2>
        ${rule.patterns.map((p, i) => `
          <h3>Pattern ${i + 1} (${p.type})</h3>
          <pre><code>${escapeHtml(p.value)}</code></pre>
        `).join('')}
      </div>

      ${rule.testCases?.length ? `
      <div class="section">
        <h2>Test Cases</h2>
        <table>
          <tr>
            <th>Name</th>
            <th>Should Match</th>
            <th>Language</th>
          </tr>
          ${rule.testCases.map(tc => `
            <tr>
              <td>${tc.name}</td>
              <td>${tc.shouldMatch ? 'Yes' : 'No'}</td>
              <td>${tc.language}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}
    </body>
    </html>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
