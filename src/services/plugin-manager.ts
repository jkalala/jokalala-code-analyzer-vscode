/**
 * Plugin Manager Service
 *
 * Enterprise-grade plugin system for extending the Jokalala Code Analyzer.
 * Supports loading, managing, and executing plugins for custom security rules,
 * language analyzers, and result enrichers.
 *
 * Features:
 * - Plugin discovery and loading from workspace/global locations
 * - Plugin lifecycle management (load/unload/enable/disable)
 * - Plugin dependency resolution
 * - Plugin configuration management
 * - Built-in plugin marketplace integration
 *
 * @module services/plugin-manager
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import {
  CustomRule,
  CustomRuleEngine,
  RuleCategory,
  RuleSeverity,
  RulePack,
  PatternType,
  getCustomRuleEngine,
} from '../core/custom-rules'

/**
 * Plugin types supported by the system
 */
export enum PluginType {
  PATTERN = 'pattern',
  LANGUAGE = 'language',
  ENRICHER = 'enricher',
  HOOK = 'hook',
  INTEGRATION = 'integration',
}

/**
 * Plugin status
 */
export enum PluginStatus {
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  ERROR = 'error',
  UPDATING = 'updating',
}

/**
 * Plugin manifest definition
 */
export interface PluginManifest {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author?: string
  publisher?: string
  license?: string
  homepage?: string
  repository?: string
  type: PluginType
  engines?: {
    jokalala?: string
    vscode?: string
  }
  keywords?: string[]
  categories?: string[]
  activationEvents?: string[]
  main?: string
  contributes?: {
    rules?: CustomRule[]
    rulePacks?: RulePack[]
    languages?: string[]
    commands?: Array<{
      command: string
      title: string
    }>
    configuration?: Record<string, unknown>
  }
  dependencies?: Record<string, string>
}

/**
 * Loaded plugin instance
 */
export interface LoadedPlugin {
  manifest: PluginManifest
  status: PluginStatus
  path: string
  loadedAt: Date
  error?: string
  instance?: {
    activate?: (context: PluginContext) => Promise<void> | void
    deactivate?: () => Promise<void> | void
  }
}

/**
 * Plugin context provided to plugins during activation
 */
export interface PluginContext {
  extensionPath: string
  pluginPath: string
  storagePath: string
  globalState: vscode.Memento
  workspaceState: vscode.Memento
  subscriptions: { dispose(): void }[]
  ruleEngine: CustomRuleEngine
  logger: PluginLogger
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
}

/**
 * Plugin search result from marketplace
 */
export interface PluginSearchResult {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  downloads: number
  rating: number
  type: PluginType
  verified: boolean
}

/**
 * Plugin Manager Events
 */
export interface PluginManagerEvents {
  'plugin-loaded': { plugin: LoadedPlugin }
  'plugin-unloaded': { pluginId: string }
  'plugin-enabled': { pluginId: string }
  'plugin-disabled': { pluginId: string }
  'plugin-error': { pluginId: string; error: Error }
  'rules-updated': { count: number }
}

/**
 * Plugin Manager Configuration
 */
export interface PluginManagerConfig {
  enablePlugins: boolean
  pluginPaths: string[]
  enableMarketplace: boolean
  autoUpdate: boolean
  trustedPublishers: string[]
  maxPlugins: number
}

const DEFAULT_CONFIG: PluginManagerConfig = {
  enablePlugins: true,
  pluginPaths: [],
  enableMarketplace: true,
  autoUpdate: false,
  trustedPublishers: ['jokalala', 'official'],
  maxPlugins: 50,
}

/**
 * Plugin Manager Service
 *
 * Central service for managing plugins in the VS Code extension.
 */
export class PluginManager extends EventEmitter {
  private config: PluginManagerConfig
  private plugins: Map<string, LoadedPlugin> = new Map()
  private ruleEngine: CustomRuleEngine
  private context: vscode.ExtensionContext | null = null
  private outputChannel: vscode.OutputChannel | null = null

  constructor(config: Partial<PluginManagerConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.ruleEngine = getCustomRuleEngine()
  }

  /**
   * Initialize the plugin manager
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context
    this.outputChannel = vscode.window.createOutputChannel('Jokalala Plugins')

    // Load saved plugin state
    const savedState = context.globalState.get<Record<string, boolean>>('jokalala.plugins.state', {})

    // Discover and load plugins
    await this.discoverPlugins()

    // Apply saved enabled/disabled state
    for (const [pluginId, enabled] of Object.entries(savedState)) {
      const plugin = this.plugins.get(pluginId)
      if (plugin) {
        plugin.status = enabled ? PluginStatus.ENABLED : PluginStatus.DISABLED
      }
    }

    this.log('Plugin manager initialized', { pluginsLoaded: this.plugins.size })
  }

  /**
   * Discover plugins from configured paths
   */
  async discoverPlugins(): Promise<void> {
    const searchPaths = [
      ...this.config.pluginPaths,
      path.join(this.context?.extensionPath || '', 'plugins'),
    ]

    // Add workspace plugin paths
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        searchPaths.push(path.join(folder.uri.fsPath, '.jokalala', 'plugins'))
      }
    }

    // Add global plugin path
    const globalPluginPath = path.join(
      this.context?.globalStorageUri?.fsPath || '',
      'plugins'
    )
    searchPaths.push(globalPluginPath)

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        await this.loadPluginsFromDirectory(searchPath)
      }
    }
  }

  /**
   * Load plugins from a directory
   */
  private async loadPluginsFromDirectory(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(dirPath, entry.name)
          const manifestPath = path.join(pluginPath, 'jokalala-plugin.json')

          if (fs.existsSync(manifestPath)) {
            await this.loadPlugin(pluginPath)
          }
        } else if (entry.name.endsWith('.json') && entry.name !== 'jokalala-plugin.json') {
          // Load single rule file
          await this.loadRuleFile(path.join(dirPath, entry.name))
        }
      }
    } catch (error) {
      this.logError('Failed to load plugins from directory', error as Error, { dirPath })
    }
  }

  /**
   * Load a plugin from path
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    const manifestPath = path.join(pluginPath, 'jokalala-plugin.json')

    try {
      // Read and parse manifest
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
      const manifest: PluginManifest = JSON.parse(manifestContent)

      // Validate manifest
      if (!manifest.id || !manifest.name || !manifest.version) {
        throw new Error('Invalid plugin manifest: missing required fields')
      }

      // Check if already loaded
      if (this.plugins.has(manifest.id)) {
        this.log(`Plugin ${manifest.id} already loaded, skipping`)
        return this.plugins.get(manifest.id) || null
      }

      // Check max plugins limit
      if (this.plugins.size >= this.config.maxPlugins) {
        throw new Error(`Maximum plugin limit (${this.config.maxPlugins}) reached`)
      }

      // Create loaded plugin entry
      const loadedPlugin: LoadedPlugin = {
        manifest,
        status: PluginStatus.INSTALLED,
        path: pluginPath,
        loadedAt: new Date(),
      }

      // Load contributed rules
      if (manifest.contributes?.rules) {
        for (const rule of manifest.contributes.rules) {
          const validation = this.ruleEngine.addRule({
            ...rule,
            enabled: true,
          })
          if (!validation.valid) {
            this.logError(`Invalid rule in plugin ${manifest.id}`, new Error(validation.errors[0]?.message))
          }
        }
      }

      // Load contributed rule packs
      if (manifest.contributes?.rulePacks) {
        for (const pack of manifest.contributes.rulePacks) {
          this.ruleEngine.addRulePack(pack)
        }
      }

      // Load main module if specified
      if (manifest.main) {
        const mainPath = path.join(pluginPath, manifest.main)
        if (fs.existsSync(mainPath)) {
          try {
            // Dynamic import for plugin modules
            loadedPlugin.instance = require(mainPath)
          } catch (e) {
            this.logError(`Failed to load plugin module: ${manifest.id}`, e as Error)
          }
        }
      }

      // Store plugin
      this.plugins.set(manifest.id, loadedPlugin)
      loadedPlugin.status = PluginStatus.ENABLED

      // Activate plugin if it has an activate function
      if (loadedPlugin.instance?.activate && this.context) {
        try {
          await loadedPlugin.instance.activate(this.createPluginContext(pluginPath))
        } catch (e) {
          loadedPlugin.status = PluginStatus.ERROR
          loadedPlugin.error = (e as Error).message
          this.logError(`Failed to activate plugin: ${manifest.id}`, e as Error)
        }
      }

      this.log(`Plugin loaded: ${manifest.displayName || manifest.name} v${manifest.version}`)
      this.emit('plugin-loaded', { plugin: loadedPlugin })

      return loadedPlugin
    } catch (error) {
      this.logError('Failed to load plugin', error as Error, { pluginPath })
      return null
    }
  }

  /**
   * Load a single rule file
   */
  async loadRuleFile(filePath: string): Promise<boolean> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      if (Array.isArray(data.rules)) {
        // Rule pack format
        for (const rule of data.rules) {
          this.ruleEngine.addRule({ ...rule, enabled: true })
        }
        this.log(`Loaded ${data.rules.length} rules from ${path.basename(filePath)}`)
      } else if (data.id && data.patterns) {
        // Single rule format
        this.ruleEngine.addRule({ ...data, enabled: true })
        this.log(`Loaded rule ${data.id} from ${path.basename(filePath)}`)
      }

      this.emit('rules-updated', { count: this.ruleEngine.getRules().length })
      return true
    } catch (error) {
      this.logError('Failed to load rule file', error as Error, { filePath })
      return false
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      return false
    }

    try {
      // Deactivate plugin
      if (plugin.instance?.deactivate) {
        await plugin.instance.deactivate()
      }

      // Remove contributed rules
      if (plugin.manifest.contributes?.rules) {
        for (const rule of plugin.manifest.contributes.rules) {
          this.ruleEngine.removeRule(rule.id)
        }
      }

      // Remove from map
      this.plugins.delete(pluginId)
      this.emit('plugin-unloaded', { pluginId })

      this.log(`Plugin unloaded: ${plugin.manifest.name}`)
      return true
    } catch (error) {
      this.logError('Failed to unload plugin', error as Error, { pluginId })
      return false
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      return false
    }

    plugin.status = PluginStatus.ENABLED

    // Re-enable rules
    if (plugin.manifest.contributes?.rules) {
      for (const rule of plugin.manifest.contributes.rules) {
        this.ruleEngine.setRuleEnabled(rule.id, true)
      }
    }

    await this.savePluginState()
    this.emit('plugin-enabled', { pluginId })
    return true
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      return false
    }

    plugin.status = PluginStatus.DISABLED

    // Disable rules
    if (plugin.manifest.contributes?.rules) {
      for (const rule of plugin.manifest.contributes.rules) {
        this.ruleEngine.setRuleEnabled(rule.id, false)
      }
    }

    await this.savePluginState()
    this.emit('plugin-disabled', { pluginId })
    return true
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get a specific plugin
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get plugins by type
   */
  getPluginsByType(type: PluginType): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.manifest.type === type)
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.status === PluginStatus.ENABLED)
  }

  /**
   * Get plugin statistics
   */
  getStatistics(): {
    total: number
    enabled: number
    disabled: number
    errors: number
    byType: Record<string, number>
    totalRules: number
  } {
    const plugins = Array.from(this.plugins.values())
    const byType: Record<string, number> = {}

    for (const plugin of plugins) {
      const type = plugin.manifest.type || 'unknown'
      byType[type] = (byType[type] || 0) + 1
    }

    return {
      total: plugins.length,
      enabled: plugins.filter(p => p.status === PluginStatus.ENABLED).length,
      disabled: plugins.filter(p => p.status === PluginStatus.DISABLED).length,
      errors: plugins.filter(p => p.status === PluginStatus.ERROR).length,
      byType,
      totalRules: this.ruleEngine.getRules().length,
    }
  }

  /**
   * Create a new plugin scaffold
   */
  async createPluginScaffold(
    name: string,
    type: PluginType,
    targetPath: string
  ): Promise<string> {
    const pluginId = name.toLowerCase().replace(/\s+/g, '-')
    const pluginPath = path.join(targetPath, pluginId)

    // Create directory
    fs.mkdirSync(pluginPath, { recursive: true })

    // Create manifest
    const manifest: PluginManifest = {
      id: pluginId,
      name: pluginId,
      displayName: name,
      description: `Custom ${type} plugin for Jokalala Code Analyzer`,
      version: '1.0.0',
      type,
      engines: {
        jokalala: '^2.0.0',
        vscode: '^1.85.0',
      },
      contributes: {
        rules: type === PluginType.PATTERN ? [
          {
            id: `${pluginId}-rule-1`,
            name: 'Example Rule',
            description: 'An example security rule',
            version: '1.0.0',
            severity: RuleSeverity.MEDIUM,
            category: RuleCategory.SECURITY,
            tags: ['example'],
            languages: ['javascript', 'typescript'],
            patterns: [
              {
                type: PatternType.REGEX,
                value: 'console\\.log\\(',
              },
            ],
            message: {
              default: 'Console.log found in code',
              fix: 'Remove console.log statements in production code',
            },
            enabled: true,
          },
        ] : [],
      },
    }

    // Write manifest
    fs.writeFileSync(
      path.join(pluginPath, 'jokalala-plugin.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Create README
    const readme = `# ${name}

A custom plugin for Jokalala Code Analyzer.

## Installation

Copy this folder to your Jokalala plugins directory:
- Workspace: \`.jokalala/plugins/\`
- Global: VS Code global storage

## Configuration

Edit \`jokalala-plugin.json\` to customize rules and settings.

## Rules

This plugin provides the following rules:

${type === PluginType.PATTERN ? '- `' + pluginId + '-rule-1`: Example Rule' : 'No rules defined yet.'}

## License

MIT
`
    fs.writeFileSync(path.join(pluginPath, 'README.md'), readme)

    this.log(`Created plugin scaffold at ${pluginPath}`)
    return pluginPath
  }

  /**
   * Import rules from a file
   */
  async importRulesFromFile(uri: vscode.Uri): Promise<{ imported: number; errors: string[] }> {
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf-8')
      return this.ruleEngine.importRules(content)
    } catch (error) {
      return { imported: 0, errors: [(error as Error).message] }
    }
  }

  /**
   * Export rules to a file
   */
  async exportRulesToFile(uri: vscode.Uri, ruleIds?: string[]): Promise<void> {
    const content = this.ruleEngine.exportRules(ruleIds)
    fs.writeFileSync(uri.fsPath, content)
  }

  /**
   * Create plugin context for activation
   */
  private createPluginContext(pluginPath: string): PluginContext {
    return {
      extensionPath: this.context?.extensionPath || '',
      pluginPath,
      storagePath: this.context?.globalStorageUri?.fsPath || '',
      globalState: this.context?.globalState as vscode.Memento,
      workspaceState: this.context?.workspaceState as vscode.Memento,
      subscriptions: [],
      ruleEngine: this.ruleEngine,
      logger: {
        info: (msg, ...args) => this.log(msg, ...args),
        warn: (msg, ...args) => this.log(`[WARN] ${msg}`, ...args),
        error: (msg, ...args) => this.logError(msg, new Error(), ...args),
        debug: (msg, ...args) => this.log(`[DEBUG] ${msg}`, ...args),
      },
    }
  }

  /**
   * Save plugin state
   */
  private async savePluginState(): Promise<void> {
    const state: Record<string, boolean> = {}
    for (const [id, plugin] of this.plugins) {
      state[id] = plugin.status === PluginStatus.ENABLED
    }
    await this.context?.globalState.update('jokalala.plugins.state', state)
  }

  /**
   * Log message
   */
  private log(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const formatted = `[${timestamp}] ${message} ${args.length ? JSON.stringify(args) : ''}`
    this.outputChannel?.appendLine(formatted)
  }

  /**
   * Log error
   */
  private logError(message: string, error: Error, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const formatted = `[${timestamp}] ERROR: ${message} - ${error.message} ${args.length ? JSON.stringify(args) : ''}`
    this.outputChannel?.appendLine(formatted)
    console.error(formatted, error)
  }

  /**
   * Dispose the plugin manager
   */
  dispose(): void {
    for (const [id] of this.plugins) {
      this.unloadPlugin(id).catch(() => {})
    }
    this.outputChannel?.dispose()
  }
}

// Singleton instance
let pluginManagerInstance: PluginManager | null = null

/**
 * Get the plugin manager instance
 */
export function getPluginManager(config?: Partial<PluginManagerConfig>): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager(config)
  }
  return pluginManagerInstance
}

/**
 * Initialize the plugin manager with extension context
 */
export async function initializePluginManager(
  context: vscode.ExtensionContext,
  config?: Partial<PluginManagerConfig>
): Promise<PluginManager> {
  const manager = getPluginManager(config)
  await manager.initialize(context)
  return manager
}
