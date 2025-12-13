"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginsTreeProvider = void 0;
exports.registerPluginsTreeView = registerPluginsTreeView;
exports.registerPluginCommands = registerPluginCommands;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const plugin_manager_1 = require("../services/plugin-manager");
const custom_rules_1 = require("../core/custom-rules");
/**
 * Tree item types
 */
var TreeItemType;
(function (TreeItemType) {
    TreeItemType["PLUGINS_HEADER"] = "plugins-header";
    TreeItemType["PLUGIN"] = "plugin";
    TreeItemType["RULES_HEADER"] = "rules-header";
    TreeItemType["RULE_CATEGORY"] = "rule-category";
    TreeItemType["RULE"] = "rule";
    TreeItemType["ACTIONS"] = "actions";
    TreeItemType["ACTION"] = "action";
    TreeItemType["STATISTICS"] = "statistics";
    TreeItemType["STAT_ITEM"] = "stat-item";
})(TreeItemType || (TreeItemType = {}));
/**
 * Plugin tree item
 */
class PluginTreeItem extends vscode.TreeItem {
    constructor(type, label, collapsibleState, data) {
        super(label, collapsibleState);
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: type
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: data
        });
        this.contextValue = type;
        this.setupTreeItem();
    }
    setupTreeItem() {
        switch (this.type) {
            case TreeItemType.PLUGINS_HEADER:
                this.iconPath = new vscode.ThemeIcon('extensions');
                this.contextValue = 'pluginsHeader';
                break;
            case TreeItemType.PLUGIN:
                const plugin = this.data;
                this.description = `v${plugin.manifest.version}`;
                this.tooltip = this.createPluginTooltip(plugin);
                this.iconPath = this.getPluginIcon(plugin);
                this.contextValue = `plugin-${plugin.status}`;
                break;
            case TreeItemType.RULES_HEADER:
                this.iconPath = new vscode.ThemeIcon('checklist');
                this.contextValue = 'rulesHeader';
                break;
            case TreeItemType.RULE_CATEGORY:
                const categoryData = this.data;
                this.description = `${categoryData.rules.length} rules`;
                this.iconPath = this.getCategoryIcon(categoryData.category);
                this.contextValue = 'ruleCategory';
                break;
            case TreeItemType.RULE:
                const rule = this.data;
                this.description = rule.enabled ? rule.severity : '(disabled)';
                this.tooltip = this.createRuleTooltip(rule);
                this.iconPath = this.getSeverityIcon(rule.severity, rule.enabled);
                this.contextValue = `rule-${rule.enabled ? 'enabled' : 'disabled'}`;
                break;
            case TreeItemType.ACTIONS:
                this.iconPath = new vscode.ThemeIcon('tools');
                this.contextValue = 'actionsHeader';
                break;
            case TreeItemType.ACTION:
                this.iconPath = new vscode.ThemeIcon('play');
                this.contextValue = 'action';
                break;
            case TreeItemType.STATISTICS:
                this.iconPath = new vscode.ThemeIcon('graph');
                this.contextValue = 'statisticsHeader';
                break;
            case TreeItemType.STAT_ITEM:
                const stat = this.data;
                this.description = String(stat.value);
                this.iconPath = new vscode.ThemeIcon('symbol-numeric');
                this.contextValue = 'statItem';
                break;
        }
    }
    createPluginTooltip(plugin) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`## ${plugin.manifest.displayName || plugin.manifest.name}\n\n`);
        md.appendMarkdown(`**Version:** ${plugin.manifest.version}\n\n`);
        md.appendMarkdown(`**Type:** ${plugin.manifest.type}\n\n`);
        md.appendMarkdown(`**Status:** ${plugin.status}\n\n`);
        if (plugin.manifest.description) {
            md.appendMarkdown(`${plugin.manifest.description}\n\n`);
        }
        if (plugin.manifest.author) {
            md.appendMarkdown(`**Author:** ${plugin.manifest.author}\n\n`);
        }
        const rulesCount = plugin.manifest.contributes?.rules?.length || 0;
        if (rulesCount > 0) {
            md.appendMarkdown(`**Rules:** ${rulesCount}\n\n`);
        }
        if (plugin.error) {
            md.appendMarkdown(`\n**Error:** ${plugin.error}`);
        }
        return md;
    }
    createRuleTooltip(rule) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`## ${rule.name}\n\n`);
        md.appendMarkdown(`**ID:** \`${rule.id}\`\n\n`);
        md.appendMarkdown(`**Severity:** ${rule.severity}\n\n`);
        md.appendMarkdown(`**Category:** ${rule.category}\n\n`);
        md.appendMarkdown(`${rule.description}\n\n`);
        if (rule.metadata?.cwe?.length) {
            md.appendMarkdown(`**CWE:** ${rule.metadata.cwe.join(', ')}\n\n`);
        }
        if (rule.metadata?.owasp?.length) {
            md.appendMarkdown(`**OWASP:** ${rule.metadata.owasp.join(', ')}\n\n`);
        }
        md.appendMarkdown(`**Languages:** ${rule.languages.join(', ')}\n\n`);
        md.appendMarkdown(`**Patterns:** ${rule.patterns.length}`);
        return md;
    }
    getPluginIcon(plugin) {
        switch (plugin.status) {
            case plugin_manager_1.PluginStatus.ENABLED:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case plugin_manager_1.PluginStatus.DISABLED:
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
            case plugin_manager_1.PluginStatus.ERROR:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('package');
        }
    }
    getCategoryIcon(category) {
        switch (category) {
            case custom_rules_1.RuleCategory.SECURITY:
                return new vscode.ThemeIcon('shield');
            case custom_rules_1.RuleCategory.QUALITY:
                return new vscode.ThemeIcon('sparkle');
            case custom_rules_1.RuleCategory.PERFORMANCE:
                return new vscode.ThemeIcon('dashboard');
            case custom_rules_1.RuleCategory.STYLE:
                return new vscode.ThemeIcon('paintcan');
            case custom_rules_1.RuleCategory.BEST_PRACTICE:
                return new vscode.ThemeIcon('lightbulb');
            case custom_rules_1.RuleCategory.COMPLIANCE:
                return new vscode.ThemeIcon('verified');
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }
    getSeverityIcon(severity, enabled) {
        if (!enabled) {
            return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
        }
        switch (severity) {
            case custom_rules_1.RuleSeverity.CRITICAL:
                return new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red'));
            case custom_rules_1.RuleSeverity.HIGH:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
            case custom_rules_1.RuleSeverity.MEDIUM:
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.yellow'));
            case custom_rules_1.RuleSeverity.LOW:
                return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
            case custom_rules_1.RuleSeverity.INFO:
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.gray'));
            default:
                return new vscode.ThemeIcon('circle');
        }
    }
}
/**
 * Plugins Tree Data Provider
 */
class PluginsTreeProvider {
    constructor() {
        Object.defineProperty(this, "_onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new vscode.EventEmitter()
        });
        Object.defineProperty(this, "onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this._onDidChangeTreeData.event
        });
        Object.defineProperty(this, "pluginManager", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "ruleEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, custom_rules_1.getCustomRuleEngine)()
        });
        // Listen for rule engine events
        this.ruleEngine.on('rule-added', () => this.refresh());
        this.ruleEngine.on('rule-removed', () => this.refresh());
        this.ruleEngine.on('rule-toggled', () => this.refresh());
        this.ruleEngine.on('pack-added', () => this.refresh());
        this.ruleEngine.on('pack-removed', () => this.refresh());
    }
    /**
     * Initialize with extension context
     */
    async initialize(context) {
        this.pluginManager = await (0, plugin_manager_1.initializePluginManager)(context);
        // Listen for plugin manager events
        this.pluginManager.on('plugin-loaded', () => this.refresh());
        this.pluginManager.on('plugin-unloaded', () => this.refresh());
        this.pluginManager.on('plugin-enabled', () => this.refresh());
        this.pluginManager.on('plugin-disabled', () => this.refresh());
        this.pluginManager.on('rules-updated', () => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // Root level - show sections
            return [
                new PluginTreeItem(TreeItemType.PLUGINS_HEADER, 'Plugins', vscode.TreeItemCollapsibleState.Expanded),
                new PluginTreeItem(TreeItemType.RULES_HEADER, 'Custom Rules', vscode.TreeItemCollapsibleState.Expanded),
                new PluginTreeItem(TreeItemType.STATISTICS, 'Statistics', vscode.TreeItemCollapsibleState.Collapsed),
                new PluginTreeItem(TreeItemType.ACTIONS, 'Actions', vscode.TreeItemCollapsibleState.Collapsed),
            ];
        }
        switch (element.type) {
            case TreeItemType.PLUGINS_HEADER:
                return this.getPluginItems();
            case TreeItemType.RULES_HEADER:
                return this.getRuleCategoryItems();
            case TreeItemType.RULE_CATEGORY:
                return this.getRuleItems(element.data);
            case TreeItemType.STATISTICS:
                return this.getStatisticsItems();
            case TreeItemType.ACTIONS:
                return this.getActionItems();
            default:
                return [];
        }
    }
    getPluginItems() {
        if (!this.pluginManager) {
            return [
                new PluginTreeItem(TreeItemType.ACTION, 'No plugins loaded', vscode.TreeItemCollapsibleState.None),
            ];
        }
        const plugins = this.pluginManager.getPlugins();
        if (plugins.length === 0) {
            return [
                new PluginTreeItem(TreeItemType.ACTION, 'No plugins installed', vscode.TreeItemCollapsibleState.None),
            ];
        }
        return plugins.map(plugin => new PluginTreeItem(TreeItemType.PLUGIN, plugin.manifest.displayName || plugin.manifest.name, vscode.TreeItemCollapsibleState.None, plugin));
    }
    getRuleCategoryItems() {
        const rules = this.ruleEngine.getRules();
        if (rules.length === 0) {
            return [
                new PluginTreeItem(TreeItemType.ACTION, 'No custom rules defined', vscode.TreeItemCollapsibleState.None),
            ];
        }
        // Group rules by category
        const byCategory = new Map();
        for (const rule of rules) {
            const category = rule.category;
            if (!byCategory.has(category)) {
                byCategory.set(category, []);
            }
            byCategory.get(category).push(rule);
        }
        return Array.from(byCategory.entries()).map(([category, categoryRules]) => new PluginTreeItem(TreeItemType.RULE_CATEGORY, this.formatCategoryName(category), vscode.TreeItemCollapsibleState.Collapsed, { category, rules: categoryRules }));
    }
    getRuleItems(categoryData) {
        return categoryData.rules.map(rule => new PluginTreeItem(TreeItemType.RULE, rule.name, vscode.TreeItemCollapsibleState.None, rule));
    }
    getStatisticsItems() {
        const pluginStats = this.pluginManager?.getStatistics() || {
            total: 0,
            enabled: 0,
            disabled: 0,
            errors: 0,
            byType: {},
            totalRules: 0,
        };
        const ruleStats = this.ruleEngine.getStatistics();
        const items = [
            new PluginTreeItem(TreeItemType.STAT_ITEM, 'Total Plugins', vscode.TreeItemCollapsibleState.None, { key: 'totalPlugins', value: pluginStats.total }),
            new PluginTreeItem(TreeItemType.STAT_ITEM, 'Enabled Plugins', vscode.TreeItemCollapsibleState.None, { key: 'enabledPlugins', value: pluginStats.enabled }),
            new PluginTreeItem(TreeItemType.STAT_ITEM, 'Total Rules', vscode.TreeItemCollapsibleState.None, { key: 'totalRules', value: ruleStats.totalRules }),
            new PluginTreeItem(TreeItemType.STAT_ITEM, 'Enabled Rules', vscode.TreeItemCollapsibleState.None, { key: 'enabledRules', value: ruleStats.enabledRules }),
            new PluginTreeItem(TreeItemType.STAT_ITEM, 'Rule Packs', vscode.TreeItemCollapsibleState.None, { key: 'rulePacks', value: ruleStats.packsLoaded }),
        ];
        return items;
    }
    getActionItems() {
        return [
            this.createActionItem('Create Plugin', 'jokalala.createPlugin', 'add'),
            this.createActionItem('Import Rules', 'jokalala.importRules', 'cloud-download'),
            this.createActionItem('Export Rules', 'jokalala.exportRules', 'cloud-upload'),
            this.createActionItem('Reload Plugins', 'jokalala.reloadPlugins', 'refresh'),
            this.createActionItem('Open Plugins Folder', 'jokalala.openPluginsFolder', 'folder-opened'),
        ];
    }
    createActionItem(label, command, icon) {
        const item = new PluginTreeItem(TreeItemType.ACTION, label, vscode.TreeItemCollapsibleState.None);
        item.command = {
            command,
            title: label,
        };
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
    formatCategoryName(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    /**
     * Get plugin manager instance
     */
    getPluginManager() {
        return this.pluginManager;
    }
}
exports.PluginsTreeProvider = PluginsTreeProvider;
/**
 * Register the plugins tree view
 */
function registerPluginsTreeView(context, provider) {
    const treeView = vscode.window.createTreeView('jokalala-plugins', {
        treeDataProvider: provider,
        showCollapseAll: true,
    });
    return treeView;
}
/**
 * Register plugin-related commands
 */
function registerPluginCommands(context, provider) {
    // Create new plugin
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.createPlugin', async () => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager) {
            vscode.window.showErrorMessage('Plugin manager not initialized');
            return;
        }
        const name = await vscode.window.showInputBox({
            prompt: 'Enter plugin name',
            placeHolder: 'My Custom Plugin',
            validateInput: value => {
                if (!value || value.length < 3) {
                    return 'Name must be at least 3 characters';
                }
                return null;
            },
        });
        if (!name)
            return;
        const type = await vscode.window.showQuickPick([
            { label: 'Pattern Plugin', description: 'Add custom security rules', value: plugin_manager_1.PluginType.PATTERN },
            { label: 'Language Plugin', description: 'Add language support', value: plugin_manager_1.PluginType.LANGUAGE },
            { label: 'Enricher Plugin', description: 'Enrich analysis results', value: plugin_manager_1.PluginType.ENRICHER },
            { label: 'Hook Plugin', description: 'Add lifecycle hooks', value: plugin_manager_1.PluginType.HOOK },
        ], { placeHolder: 'Select plugin type' });
        if (!type)
            return;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const targetPath = path.join(workspaceFolder.uri.fsPath, '.jokalala', 'plugins');
        try {
            const pluginPath = await pluginManager.createPluginScaffold(name, type.value, targetPath);
            const manifestUri = vscode.Uri.file(path.join(pluginPath, 'jokalala-plugin.json'));
            const doc = await vscode.workspace.openTextDocument(manifestUri);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`Plugin "${name}" created successfully!`);
            provider.refresh();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create plugin: ${error.message}`);
        }
    }));
    // Import rules
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.importRules', async () => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager)
            return;
        const uri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON files': ['json'] },
            title: 'Import Rules',
        });
        if (!uri || uri.length === 0)
            return;
        const result = await pluginManager.importRulesFromFile(uri[0]);
        if (result.errors.length > 0) {
            vscode.window.showWarningMessage(`Imported ${result.imported} rules with ${result.errors.length} errors`);
        }
        else {
            vscode.window.showInformationMessage(`Successfully imported ${result.imported} rules`);
        }
        provider.refresh();
    }));
    // Export rules
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.exportRules', async () => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager)
            return;
        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON files': ['json'] },
            defaultUri: vscode.Uri.file('jokalala-rules.json'),
            title: 'Export Rules',
        });
        if (!uri)
            return;
        await pluginManager.exportRulesToFile(uri);
        vscode.window.showInformationMessage(`Rules exported to ${path.basename(uri.fsPath)}`);
    }));
    // Reload plugins
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.reloadPlugins', async () => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager)
            return;
        await pluginManager.discoverPlugins();
        provider.refresh();
        vscode.window.showInformationMessage('Plugins reloaded');
    }));
    // Open plugins folder
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.openPluginsFolder', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const pluginsPath = path.join(workspaceFolder.uri.fsPath, '.jokalala', 'plugins');
        // Create directory if it doesn't exist
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        if (!fs.existsSync(pluginsPath)) {
            fs.mkdirSync(pluginsPath, { recursive: true });
        }
        const uri = vscode.Uri.file(pluginsPath);
        vscode.commands.executeCommand('revealFileInOS', uri);
    }));
    // Enable plugin
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.enablePlugin', async (item) => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager || item.type !== TreeItemType.PLUGIN)
            return;
        const plugin = item.data;
        await pluginManager.enablePlugin(plugin.manifest.id);
        provider.refresh();
        vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" enabled`);
    }));
    // Disable plugin
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.disablePlugin', async (item) => {
        const pluginManager = provider.getPluginManager();
        if (!pluginManager || item.type !== TreeItemType.PLUGIN)
            return;
        const plugin = item.data;
        await pluginManager.disablePlugin(plugin.manifest.id);
        provider.refresh();
        vscode.window.showInformationMessage(`Plugin "${plugin.manifest.name}" disabled`);
    }));
    // Enable rule
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.enableRule', (item) => {
        if (item.type !== TreeItemType.RULE)
            return;
        const rule = item.data;
        const ruleEngine = (0, custom_rules_1.getCustomRuleEngine)();
        ruleEngine.setRuleEnabled(rule.id, true);
        provider.refresh();
        vscode.window.showInformationMessage(`Rule "${rule.name}" enabled`);
    }));
    // Disable rule
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.disableRule', (item) => {
        if (item.type !== TreeItemType.RULE)
            return;
        const rule = item.data;
        const ruleEngine = (0, custom_rules_1.getCustomRuleEngine)();
        ruleEngine.setRuleEnabled(rule.id, false);
        provider.refresh();
        vscode.window.showInformationMessage(`Rule "${rule.name}" disabled`);
    }));
    // Show rule details
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.showRuleDetails', (item) => {
        if (item.type !== TreeItemType.RULE)
            return;
        const rule = item.data;
        const panel = vscode.window.createWebviewPanel('ruleDetails', `Rule: ${rule.name}`, vscode.ViewColumn.Beside, {});
        panel.webview.html = getRuleDetailsHtml(rule);
    }));
    // Test rule
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.testRule', async (item) => {
        if (item.type !== TreeItemType.RULE)
            return;
        const rule = item.data;
        const ruleEngine = (0, custom_rules_1.getCustomRuleEngine)();
        try {
            const results = ruleEngine.testRule(rule.id);
            if (results.length === 0) {
                vscode.window.showInformationMessage('No test cases defined for this rule');
                return;
            }
            const passed = results.filter(r => r.passed).length;
            const failed = results.filter(r => !r.passed).length;
            if (failed === 0) {
                vscode.window.showInformationMessage(`All ${passed} test(s) passed for "${rule.name}"`);
            }
            else {
                vscode.window.showWarningMessage(`${passed} passed, ${failed} failed for "${rule.name}"`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Test failed: ${error.message}`);
        }
    }));
}
/**
 * Generate HTML for rule details panel
 */
function getRuleDetailsHtml(rule) {
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
  `;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
//# sourceMappingURL=plugins-tree-provider.js.map