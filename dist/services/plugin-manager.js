"use strict";
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
exports.PluginManager = exports.PluginStatus = exports.PluginType = void 0;
exports.getPluginManager = getPluginManager;
exports.initializePluginManager = initializePluginManager;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const events_1 = require("events");
const custom_rules_1 = require("../core/custom-rules");
/**
 * Plugin types supported by the system
 */
var PluginType;
(function (PluginType) {
    PluginType["PATTERN"] = "pattern";
    PluginType["LANGUAGE"] = "language";
    PluginType["ENRICHER"] = "enricher";
    PluginType["HOOK"] = "hook";
    PluginType["INTEGRATION"] = "integration";
})(PluginType || (exports.PluginType = PluginType = {}));
/**
 * Plugin status
 */
var PluginStatus;
(function (PluginStatus) {
    PluginStatus["INSTALLED"] = "installed";
    PluginStatus["ENABLED"] = "enabled";
    PluginStatus["DISABLED"] = "disabled";
    PluginStatus["ERROR"] = "error";
    PluginStatus["UPDATING"] = "updating";
})(PluginStatus || (exports.PluginStatus = PluginStatus = {}));
const DEFAULT_CONFIG = {
    enablePlugins: true,
    pluginPaths: [],
    enableMarketplace: true,
    autoUpdate: false,
    trustedPublishers: ['jokalala', 'official'],
    maxPlugins: 50,
};
/**
 * Plugin Manager Service
 *
 * Central service for managing plugins in the VS Code extension.
 */
class PluginManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "plugins", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "ruleEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "outputChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.ruleEngine = (0, custom_rules_1.getCustomRuleEngine)();
    }
    /**
     * Initialize the plugin manager
     */
    async initialize(context) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Jokalala Plugins');
        // Load saved plugin state
        const savedState = context.globalState.get('jokalala.plugins.state', {});
        // Discover and load plugins
        await this.discoverPlugins();
        // Apply saved enabled/disabled state
        for (const [pluginId, enabled] of Object.entries(savedState)) {
            const plugin = this.plugins.get(pluginId);
            if (plugin) {
                plugin.status = enabled ? PluginStatus.ENABLED : PluginStatus.DISABLED;
            }
        }
        this.log('Plugin manager initialized', { pluginsLoaded: this.plugins.size });
    }
    /**
     * Discover plugins from configured paths
     */
    async discoverPlugins() {
        const searchPaths = [
            ...this.config.pluginPaths,
            path.join(this.context?.extensionPath || '', 'plugins'),
        ];
        // Add workspace plugin paths
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                searchPaths.push(path.join(folder.uri.fsPath, '.jokalala', 'plugins'));
            }
        }
        // Add global plugin path
        const globalPluginPath = path.join(this.context?.globalStorageUri?.fsPath || '', 'plugins');
        searchPaths.push(globalPluginPath);
        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                await this.loadPluginsFromDirectory(searchPath);
            }
        }
    }
    /**
     * Load plugins from a directory
     */
    async loadPluginsFromDirectory(dirPath) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const pluginPath = path.join(dirPath, entry.name);
                    const manifestPath = path.join(pluginPath, 'jokalala-plugin.json');
                    if (fs.existsSync(manifestPath)) {
                        await this.loadPlugin(pluginPath);
                    }
                }
                else if (entry.name.endsWith('.json') && entry.name !== 'jokalala-plugin.json') {
                    // Load single rule file
                    await this.loadRuleFile(path.join(dirPath, entry.name));
                }
            }
        }
        catch (error) {
            this.logError('Failed to load plugins from directory', error, { dirPath });
        }
    }
    /**
     * Load a plugin from path
     */
    async loadPlugin(pluginPath) {
        const manifestPath = path.join(pluginPath, 'jokalala-plugin.json');
        try {
            // Read and parse manifest
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);
            // Validate manifest
            if (!manifest.id || !manifest.name || !manifest.version) {
                throw new Error('Invalid plugin manifest: missing required fields');
            }
            // Check if already loaded
            if (this.plugins.has(manifest.id)) {
                this.log(`Plugin ${manifest.id} already loaded, skipping`);
                return this.plugins.get(manifest.id) || null;
            }
            // Check max plugins limit
            if (this.plugins.size >= this.config.maxPlugins) {
                throw new Error(`Maximum plugin limit (${this.config.maxPlugins}) reached`);
            }
            // Create loaded plugin entry
            const loadedPlugin = {
                manifest,
                status: PluginStatus.INSTALLED,
                path: pluginPath,
                loadedAt: new Date(),
            };
            // Load contributed rules
            if (manifest.contributes?.rules) {
                for (const rule of manifest.contributes.rules) {
                    const validation = this.ruleEngine.addRule({
                        ...rule,
                        enabled: true,
                    });
                    if (!validation.valid) {
                        this.logError(`Invalid rule in plugin ${manifest.id}`, new Error(validation.errors[0]?.message));
                    }
                }
            }
            // Load contributed rule packs
            if (manifest.contributes?.rulePacks) {
                for (const pack of manifest.contributes.rulePacks) {
                    this.ruleEngine.addRulePack(pack);
                }
            }
            // Load main module if specified
            if (manifest.main) {
                const mainPath = path.join(pluginPath, manifest.main);
                if (fs.existsSync(mainPath)) {
                    try {
                        // Dynamic import for plugin modules
                        loadedPlugin.instance = require(mainPath);
                    }
                    catch (e) {
                        this.logError(`Failed to load plugin module: ${manifest.id}`, e);
                    }
                }
            }
            // Store plugin
            this.plugins.set(manifest.id, loadedPlugin);
            loadedPlugin.status = PluginStatus.ENABLED;
            // Activate plugin if it has an activate function
            if (loadedPlugin.instance?.activate && this.context) {
                try {
                    await loadedPlugin.instance.activate(this.createPluginContext(pluginPath));
                }
                catch (e) {
                    loadedPlugin.status = PluginStatus.ERROR;
                    loadedPlugin.error = e.message;
                    this.logError(`Failed to activate plugin: ${manifest.id}`, e);
                }
            }
            this.log(`Plugin loaded: ${manifest.displayName || manifest.name} v${manifest.version}`);
            this.emit('plugin-loaded', { plugin: loadedPlugin });
            return loadedPlugin;
        }
        catch (error) {
            this.logError('Failed to load plugin', error, { pluginPath });
            return null;
        }
    }
    /**
     * Load a single rule file
     */
    async loadRuleFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            if (Array.isArray(data.rules)) {
                // Rule pack format
                for (const rule of data.rules) {
                    this.ruleEngine.addRule({ ...rule, enabled: true });
                }
                this.log(`Loaded ${data.rules.length} rules from ${path.basename(filePath)}`);
            }
            else if (data.id && data.patterns) {
                // Single rule format
                this.ruleEngine.addRule({ ...data, enabled: true });
                this.log(`Loaded rule ${data.id} from ${path.basename(filePath)}`);
            }
            this.emit('rules-updated', { count: this.ruleEngine.getRules().length });
            return true;
        }
        catch (error) {
            this.logError('Failed to load rule file', error, { filePath });
            return false;
        }
    }
    /**
     * Unload a plugin
     */
    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }
        try {
            // Deactivate plugin
            if (plugin.instance?.deactivate) {
                await plugin.instance.deactivate();
            }
            // Remove contributed rules
            if (plugin.manifest.contributes?.rules) {
                for (const rule of plugin.manifest.contributes.rules) {
                    this.ruleEngine.removeRule(rule.id);
                }
            }
            // Remove from map
            this.plugins.delete(pluginId);
            this.emit('plugin-unloaded', { pluginId });
            this.log(`Plugin unloaded: ${plugin.manifest.name}`);
            return true;
        }
        catch (error) {
            this.logError('Failed to unload plugin', error, { pluginId });
            return false;
        }
    }
    /**
     * Enable a plugin
     */
    async enablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }
        plugin.status = PluginStatus.ENABLED;
        // Re-enable rules
        if (plugin.manifest.contributes?.rules) {
            for (const rule of plugin.manifest.contributes.rules) {
                this.ruleEngine.setRuleEnabled(rule.id, true);
            }
        }
        await this.savePluginState();
        this.emit('plugin-enabled', { pluginId });
        return true;
    }
    /**
     * Disable a plugin
     */
    async disablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }
        plugin.status = PluginStatus.DISABLED;
        // Disable rules
        if (plugin.manifest.contributes?.rules) {
            for (const rule of plugin.manifest.contributes.rules) {
                this.ruleEngine.setRuleEnabled(rule.id, false);
            }
        }
        await this.savePluginState();
        this.emit('plugin-disabled', { pluginId });
        return true;
    }
    /**
     * Get all loaded plugins
     */
    getPlugins() {
        return Array.from(this.plugins.values());
    }
    /**
     * Get a specific plugin
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }
    /**
     * Get plugins by type
     */
    getPluginsByType(type) {
        return Array.from(this.plugins.values()).filter(p => p.manifest.type === type);
    }
    /**
     * Get enabled plugins
     */
    getEnabledPlugins() {
        return Array.from(this.plugins.values()).filter(p => p.status === PluginStatus.ENABLED);
    }
    /**
     * Get plugin statistics
     */
    getStatistics() {
        const plugins = Array.from(this.plugins.values());
        const byType = {};
        for (const plugin of plugins) {
            const type = plugin.manifest.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        return {
            total: plugins.length,
            enabled: plugins.filter(p => p.status === PluginStatus.ENABLED).length,
            disabled: plugins.filter(p => p.status === PluginStatus.DISABLED).length,
            errors: plugins.filter(p => p.status === PluginStatus.ERROR).length,
            byType,
            totalRules: this.ruleEngine.getRules().length,
        };
    }
    /**
     * Create a new plugin scaffold
     */
    async createPluginScaffold(name, type, targetPath) {
        const pluginId = name.toLowerCase().replace(/\s+/g, '-');
        const pluginPath = path.join(targetPath, pluginId);
        // Create directory
        fs.mkdirSync(pluginPath, { recursive: true });
        // Create manifest
        const manifest = {
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
                        severity: custom_rules_1.RuleSeverity.MEDIUM,
                        category: custom_rules_1.RuleCategory.SECURITY,
                        tags: ['example'],
                        languages: ['javascript', 'typescript'],
                        patterns: [
                            {
                                type: custom_rules_1.PatternType.REGEX,
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
        };
        // Write manifest
        fs.writeFileSync(path.join(pluginPath, 'jokalala-plugin.json'), JSON.stringify(manifest, null, 2));
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
`;
        fs.writeFileSync(path.join(pluginPath, 'README.md'), readme);
        this.log(`Created plugin scaffold at ${pluginPath}`);
        return pluginPath;
    }
    /**
     * Import rules from a file
     */
    async importRulesFromFile(uri) {
        try {
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return this.ruleEngine.importRules(content);
        }
        catch (error) {
            return { imported: 0, errors: [error.message] };
        }
    }
    /**
     * Export rules to a file
     */
    async exportRulesToFile(uri, ruleIds) {
        const content = this.ruleEngine.exportRules(ruleIds);
        fs.writeFileSync(uri.fsPath, content);
    }
    /**
     * Create plugin context for activation
     */
    createPluginContext(pluginPath) {
        return {
            extensionPath: this.context?.extensionPath || '',
            pluginPath,
            storagePath: this.context?.globalStorageUri?.fsPath || '',
            globalState: this.context?.globalState,
            workspaceState: this.context?.workspaceState,
            subscriptions: [],
            ruleEngine: this.ruleEngine,
            logger: {
                info: (msg, ...args) => this.log(msg, ...args),
                warn: (msg, ...args) => this.log(`[WARN] ${msg}`, ...args),
                error: (msg, ...args) => this.logError(msg, new Error(), ...args),
                debug: (msg, ...args) => this.log(`[DEBUG] ${msg}`, ...args),
            },
        };
    }
    /**
     * Save plugin state
     */
    async savePluginState() {
        const state = {};
        for (const [id, plugin] of this.plugins) {
            state[id] = plugin.status === PluginStatus.ENABLED;
        }
        await this.context?.globalState.update('jokalala.plugins.state', state);
    }
    /**
     * Log message
     */
    log(message, ...args) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] ${message} ${args.length ? JSON.stringify(args) : ''}`;
        this.outputChannel?.appendLine(formatted);
    }
    /**
     * Log error
     */
    logError(message, error, ...args) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] ERROR: ${message} - ${error.message} ${args.length ? JSON.stringify(args) : ''}`;
        this.outputChannel?.appendLine(formatted);
        console.error(formatted, error);
    }
    /**
     * Dispose the plugin manager
     */
    dispose() {
        for (const [id] of this.plugins) {
            this.unloadPlugin(id).catch(() => { });
        }
        this.outputChannel?.dispose();
    }
}
exports.PluginManager = PluginManager;
// Singleton instance
let pluginManagerInstance = null;
/**
 * Get the plugin manager instance
 */
function getPluginManager(config) {
    if (!pluginManagerInstance) {
        pluginManagerInstance = new PluginManager(config);
    }
    return pluginManagerInstance;
}
/**
 * Initialize the plugin manager with extension context
 */
async function initializePluginManager(context, config) {
    const manager = getPluginManager(config);
    await manager.initialize(context);
    return manager;
}
//# sourceMappingURL=plugin-manager.js.map