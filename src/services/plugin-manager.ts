/**
 * Plugin Manager Service
 *
 * Manages the lifecycle of Jokalala plugins including:
 * - Plugin discovery and loading
 * - Plugin activation/deactivation
 * - Plugin context management
 * - Inter-plugin communication
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Logger } from './logger'
import { Issue } from '../interfaces/code-analysis-service.interface'

/**
 * Security finding interface that plugins receive
 */
export interface SecurityFinding {
    id: string
    title: string
    description: string
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
    category: string
    cwe?: string
    cve?: string
    file: string
    line: number
    column?: number
    code?: string
    remediation?: string
    references?: string[]
    confidence: number
    tags?: string[]
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
    info(message: string, ...args: any[]): void
    warn(message: string, ...args: any[]): void
    error(message: string, ...args: any[]): void
    debug(message: string, ...args: any[]): void
}

/**
 * Context provided to plugins during activation
 */
export interface PluginContext {
    extensionContext: vscode.ExtensionContext
    secrets: vscode.SecretStorage
    globalState: vscode.Memento
    workspaceState: vscode.Memento
    logger: PluginLogger
    registerCommand: (command: string, callback: (...args: any[]) => any) => vscode.Disposable
    onAnalysisComplete: (callback: (findings: SecurityFinding[]) => void) => vscode.Disposable
    getFindings: () => SecurityFinding[]
    getConfiguration: <T>(key: string) => T | undefined
}

/**
 * Plugin manifest structure
 */
export interface PluginManifest {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    publisher: string
    main: string
    engines?: {
        jokalala?: string
        vscode?: string
    }
    activationEvents?: string[]
    contributes?: {
        commands?: Array<{
            command: string
            title: string
            category?: string
            icon?: string
        }>
        views?: {
            [viewContainerId: string]: Array<{
                id: string
                name: string
                when?: string
            }>
        }
        configuration?: {
            title: string
            properties: {
                [key: string]: {
                    type: string
                    default?: any
                    description?: string
                    enum?: any[]
                    items?: any
                }
            }
        }
        menus?: {
            [menuId: string]: Array<{
                command: string
                when?: string
                group?: string
            }>
        }
    }
    dependencies?: { [name: string]: string }
}

/**
 * Plugin module interface
 */
export interface PluginModule {
    activate(context: PluginContext): Promise<void>
    deactivate?(): Promise<void>
}

/**
 * Loaded plugin information
 */
interface LoadedPlugin {
    manifest: PluginManifest
    module: PluginModule
    context: PluginContext
    disposables: vscode.Disposable[]
    isActive: boolean
    path: string
}

/**
 * Plugin Manager class
 */
export class PluginManager {
    private plugins: Map<string, LoadedPlugin> = new Map()
    private logger: Logger
    private extensionContext: vscode.ExtensionContext
    private currentFindings: SecurityFinding[] = []
    private analysisCompleteListeners: Set<(findings: SecurityFinding[]) => void> = new Set()
    private pluginDirectories: string[] = []

    constructor(extensionContext: vscode.ExtensionContext, logger: Logger) {
        this.extensionContext = extensionContext
        this.logger = logger

        // Set up plugin directories
        this.pluginDirectories = [
            // Built-in plugins
            path.join(extensionContext.extensionPath, 'plugins'),
            // User plugins
            path.join(extensionContext.globalStorageUri.fsPath, 'plugins'),
        ]

        // Add workspace plugins if available
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (workspaceFolder) {
            this.pluginDirectories.push(
                path.join(workspaceFolder.uri.fsPath, '.jokalala', 'plugins')
            )
        }
    }

    /**
     * Discover and load all available plugins
     */
    async discoverAndLoadPlugins(): Promise<void> {
        this.logger.info('Discovering plugins...')

        for (const dir of this.pluginDirectories) {
            await this.discoverPluginsInDirectory(dir)
        }

        this.logger.info(`Discovered ${this.plugins.size} plugin(s)`)
    }

    /**
     * Discover plugins in a specific directory
     */
    private async discoverPluginsInDirectory(directory: string): Promise<void> {
        try {
            if (!fs.existsSync(directory)) {
                return
            }

            const entries = fs.readdirSync(directory, { withFileTypes: true })

            for (const entry of entries) {
                if (!entry.isDirectory()) continue

                const pluginPath = path.join(directory, entry.name)
                const manifestPath = path.join(pluginPath, 'manifest.json')

                if (fs.existsSync(manifestPath)) {
                    try {
                        await this.loadPlugin(pluginPath)
                    } catch (error) {
                        this.logger.error(`Failed to load plugin at ${pluginPath}`, error as Error)
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`Failed to scan plugin directory ${directory}`, error as Error)
        }
    }

    /**
     * Load a single plugin
     */
    async loadPlugin(pluginPath: string): Promise<void> {
        const manifestPath = path.join(pluginPath, 'manifest.json')

        // Read and parse manifest
        const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
        const manifest: PluginManifest = JSON.parse(manifestContent)

        if (this.plugins.has(manifest.id)) {
            this.logger.warn(`Plugin ${manifest.id} already loaded, skipping`)
            return
        }

        this.logger.info(`Loading plugin: ${manifest.displayName} v${manifest.version}`)

        // Resolve main entry point
        const mainPath = path.join(pluginPath, manifest.main)

        if (!fs.existsSync(mainPath)) {
            throw new Error(`Plugin main entry not found: ${mainPath}`)
        }

        // Load the plugin module
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pluginModule: PluginModule = require(mainPath)

        if (typeof pluginModule.activate !== 'function') {
            throw new Error(`Plugin ${manifest.id} does not export an activate function`)
        }

        // Create plugin context
        const context = this.createPluginContext(manifest)

        // Store plugin info
        this.plugins.set(manifest.id, {
            manifest,
            module: pluginModule,
            context,
            disposables: [],
            isActive: false,
            path: pluginPath,
        })

        // Register contributed commands from manifest
        this.registerPluginContributions(manifest)
    }

    /**
     * Create a context for a plugin
     */
    private createPluginContext(manifest: PluginManifest): PluginContext {
        const pluginLogger: PluginLogger = {
            info: (message: string, ...args: any[]) => {
                this.logger.info(`[${manifest.id}] ${message}`, ...args)
            },
            warn: (message: string, ...args: any[]) => {
                this.logger.warn(`[${manifest.id}] ${message}`, ...args)
            },
            error: (message: string, ...args: any[]) => {
                this.logger.error(`[${manifest.id}] ${message}`, args[0] as Error)
            },
            debug: (message: string, ...args: any[]) => {
                this.logger.debug(`[${manifest.id}] ${message}`, ...args)
            },
        }

        return {
            extensionContext: this.extensionContext,
            secrets: this.extensionContext.secrets,
            globalState: this.extensionContext.globalState,
            workspaceState: this.extensionContext.workspaceState,
            logger: pluginLogger,
            registerCommand: (command: string, callback: (...args: any[]) => any) => {
                const disposable = vscode.commands.registerCommand(command, callback)
                const plugin = this.plugins.get(manifest.id)
                if (plugin) {
                    plugin.disposables.push(disposable)
                }
                return disposable
            },
            onAnalysisComplete: (callback: (findings: SecurityFinding[]) => void) => {
                this.analysisCompleteListeners.add(callback)
                return {
                    dispose: () => {
                        this.analysisCompleteListeners.delete(callback)
                    },
                }
            },
            getFindings: () => this.currentFindings,
            getConfiguration: <T>(key: string): T | undefined => {
                const config = vscode.workspace.getConfiguration()
                return config.get<T>(key)
            },
        }
    }

    /**
     * Register contributions from plugin manifest
     */
    private registerPluginContributions(manifest: PluginManifest): void {
        // Configuration contributions are handled by VS Code through package.json
        // Commands are registered during plugin activation
        // Views are registered through the main extension's package.json

        if (manifest.contributes?.configuration) {
            this.logger.debug(`Plugin ${manifest.id} contributes configuration settings`)
        }

        if (manifest.contributes?.commands) {
            this.logger.debug(
                `Plugin ${manifest.id} contributes ${manifest.contributes.commands.length} commands`
            )
        }

        if (manifest.contributes?.views) {
            this.logger.debug(`Plugin ${manifest.id} contributes views`)
        }
    }

    /**
     * Activate all loaded plugins
     */
    async activateAllPlugins(): Promise<void> {
        for (const [id, plugin] of this.plugins) {
            if (!plugin.isActive) {
                await this.activatePlugin(id)
            }
        }
    }

    /**
     * Activate a specific plugin
     */
    async activatePlugin(pluginId: string): Promise<void> {
        const plugin = this.plugins.get(pluginId)

        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`)
        }

        if (plugin.isActive) {
            this.logger.warn(`Plugin ${pluginId} is already active`)
            return
        }

        try {
            this.logger.info(`Activating plugin: ${plugin.manifest.displayName}`)
            await plugin.module.activate(plugin.context)
            plugin.isActive = true
            this.logger.info(`Plugin ${plugin.manifest.displayName} activated successfully`)
        } catch (error) {
            this.logger.error(`Failed to activate plugin ${pluginId}`, error as Error)
            throw error
        }
    }

    /**
     * Deactivate a specific plugin
     */
    async deactivatePlugin(pluginId: string): Promise<void> {
        const plugin = this.plugins.get(pluginId)

        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`)
        }

        if (!plugin.isActive) {
            return
        }

        try {
            this.logger.info(`Deactivating plugin: ${plugin.manifest.displayName}`)

            // Call plugin's deactivate if available
            if (plugin.module.deactivate) {
                await plugin.module.deactivate()
            }

            // Dispose all registered disposables
            plugin.disposables.forEach(d => d.dispose())
            plugin.disposables = []

            plugin.isActive = false
            this.logger.info(`Plugin ${plugin.manifest.displayName} deactivated`)
        } catch (error) {
            this.logger.error(`Error deactivating plugin ${pluginId}`, error as Error)
        }
    }

    /**
     * Deactivate all plugins
     */
    async deactivateAllPlugins(): Promise<void> {
        for (const [id] of this.plugins) {
            await this.deactivatePlugin(id)
        }
    }

    /**
     * Notify plugins of analysis completion
     */
    notifyAnalysisComplete(issues: Issue[]): void {
        // Convert issues to SecurityFindings
        this.currentFindings = issues.map(issue => this.issueToSecurityFinding(issue))

        // Notify all listeners
        for (const listener of this.analysisCompleteListeners) {
            try {
                listener(this.currentFindings)
            } catch (error) {
                this.logger.error('Error in analysis complete listener', error as Error)
            }
        }
    }

    /**
     * Convert an Issue to a SecurityFinding
     */
    private issueToSecurityFinding(issue: Issue): SecurityFinding {
        return {
            id: `${issue.category}-${issue.line}-${Date.now()}`,
            title: issue.message,
            description: issue.message,
            severity: issue.severity,
            category: issue.category,
            cwe: issue.codeSnippet?.match(/CWE-\d+/)?.[0],
            file: issue.filePath || '',
            line: issue.line || 1,
            column: issue.column,
            code: issue.codeSnippet,
            remediation: issue.suggestion,
            confidence: issue.priorityScore ? issue.priorityScore / 100 : 0.8,
            tags: [issue.source],
        }
    }

    /**
     * Get list of loaded plugins
     */
    getLoadedPlugins(): PluginManifest[] {
        return Array.from(this.plugins.values()).map(p => p.manifest)
    }

    /**
     * Get plugin status
     */
    getPluginStatus(pluginId: string): { loaded: boolean; active: boolean } | null {
        const plugin = this.plugins.get(pluginId)
        if (!plugin) return null

        return {
            loaded: true,
            active: plugin.isActive,
        }
    }

    /**
     * Install a plugin from a path
     */
    async installPlugin(sourcePath: string): Promise<void> {
        const manifestPath = path.join(sourcePath, 'manifest.json')

        if (!fs.existsSync(manifestPath)) {
            throw new Error('Invalid plugin: manifest.json not found')
        }

        const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
        const manifest: PluginManifest = JSON.parse(manifestContent)

        // Target directory for user plugins
        const targetDir = path.join(
            this.extensionContext.globalStorageUri.fsPath,
            'plugins',
            manifest.id
        )

        // Create target directory
        fs.mkdirSync(targetDir, { recursive: true })

        // Copy plugin files
        this.copyDirectory(sourcePath, targetDir)

        this.logger.info(`Plugin ${manifest.displayName} installed to ${targetDir}`)

        // Load and activate the plugin
        await this.loadPlugin(targetDir)
        await this.activatePlugin(manifest.id)
    }

    /**
     * Uninstall a plugin
     */
    async uninstallPlugin(pluginId: string): Promise<void> {
        const plugin = this.plugins.get(pluginId)

        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`)
        }

        // Deactivate first
        await this.deactivatePlugin(pluginId)

        // Remove from loaded plugins
        this.plugins.delete(pluginId)

        // Delete plugin files (only if in user plugins directory)
        const userPluginsDir = path.join(
            this.extensionContext.globalStorageUri.fsPath,
            'plugins'
        )

        if (plugin.path.startsWith(userPluginsDir)) {
            fs.rmSync(plugin.path, { recursive: true, force: true })
            this.logger.info(`Plugin ${pluginId} uninstalled`)
        } else {
            this.logger.warn(`Plugin ${pluginId} is a built-in plugin and cannot be uninstalled`)
        }
    }

    /**
     * Helper to copy directory recursively
     */
    private copyDirectory(source: string, target: string): void {
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true })
        }

        const entries = fs.readdirSync(source, { withFileTypes: true })

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name)
            const targetPath = path.join(target, entry.name)

            if (entry.isDirectory()) {
                this.copyDirectory(sourcePath, targetPath)
            } else {
                fs.copyFileSync(sourcePath, targetPath)
            }
        }
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        this.deactivateAllPlugins().catch(error => {
            this.logger.error('Error during plugin manager disposal', error as Error)
        })
    }
}
