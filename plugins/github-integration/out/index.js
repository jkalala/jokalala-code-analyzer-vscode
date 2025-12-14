"use strict";
/**
 * Jokalala GitHub Integration Plugin
 *
 * Main entry point for the GitHub integration plugin.
 * Provides functionality to:
 * - Auto-create GitHub issues from security findings
 * - Link findings to pull requests
 * - Track remediation progress
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const github_service_1 = require("./github-service");
const issue_manager_1 = require("./issue-manager");
const pr_linker_1 = require("./pr-linker");
const github_tree_provider_1 = require("./github-tree-provider");
// Plugin instances
let githubService;
let issueManager;
let prLinker;
let treeProvider;
let pluginContext;
/**
 * Plugin activation
 */
async function activate(context) {
    pluginContext = context;
    const { extensionContext, secrets, globalState, logger } = context;
    logger.info('Activating GitHub Integration plugin');
    // Load configuration
    const config = loadConfiguration();
    if (!config.enabled) {
        logger.info('GitHub integration is disabled');
        return;
    }
    // Initialize services
    githubService = new github_service_1.GitHubService(secrets, logger, config.enterpriseUrl);
    issueManager = new issue_manager_1.IssueManager(githubService, globalState, config);
    prLinker = new pr_linker_1.PRLinker(githubService, globalState, config);
    // Register tree view
    treeProvider = (0, github_tree_provider_1.registerGitHubTreeView)(extensionContext, githubService, issueManager, prLinker);
    // Register commands
    registerCommands(extensionContext);
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('jokalala.github')) {
            const newConfig = loadConfiguration();
            issueManager.updateConfig(newConfig);
            prLinker.updateConfig(newConfig);
            logger.info('GitHub integration configuration updated');
        }
    });
    // Subscribe to analysis completion for auto-create
    context.onAnalysisComplete(async (findings) => {
        const currentConfig = loadConfiguration();
        if (currentConfig.autoCreateIssues) {
            await issueManager.autoCreateIssuesForFindings(findings);
        }
    });
    logger.info('GitHub Integration plugin activated successfully');
}
/**
 * Plugin deactivation
 */
async function deactivate() {
    pluginContext?.logger.info('Deactivating GitHub Integration plugin');
}
/**
 * Load plugin configuration
 */
function loadConfiguration() {
    const config = vscode.workspace.getConfiguration('jokalala.github');
    return {
        enabled: config.get('enabled', true),
        autoCreateIssues: config.get('autoCreateIssues', false),
        autoCreateSeverityThreshold: config.get('autoCreateSeverityThreshold', 'high'),
        issueLabels: config.get('issueLabels', ['security', 'jokalala']),
        issueAssignees: config.get('issueAssignees', []),
        linkPRComments: config.get('linkPRComments', true),
        includeCodeSnippet: config.get('includeCodeSnippet', true),
        includeRemediation: config.get('includeRemediation', true),
        defaultRepository: config.get('defaultRepository', ''),
        enterpriseUrl: config.get('enterpriseUrl', '')
    };
}
/**
 * Register all commands
 */
function registerCommands(context) {
    const { logger } = pluginContext;
    // Authenticate command
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.authenticate', async () => {
        logger.info('Authenticating with GitHub');
        const success = await githubService.authenticate();
        if (success) {
            vscode.window.showInformationMessage('Successfully connected to GitHub');
            treeProvider.updateAuthStatus();
        }
        else {
            vscode.window.showErrorMessage('Failed to connect to GitHub');
        }
    }));
    // Create issue from single finding
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.createIssue', async (finding) => {
        if (!await ensureAuthenticated()) {
            return;
        }
        // If no finding provided, get from context or prompt
        const targetFinding = finding || await selectFinding();
        if (!targetFinding) {
            vscode.window.showWarningMessage('No finding selected');
            return;
        }
        await issueManager.createIssueFromFinding(targetFinding);
        treeProvider.refresh();
    }));
    // Create issues from all findings
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.createIssuesFromFindings', async () => {
        if (!await ensureAuthenticated()) {
            return;
        }
        const findings = pluginContext.getFindings();
        if (findings.length === 0) {
            vscode.window.showInformationMessage('No findings available. Run an analysis first.');
            return;
        }
        // Ask for severity threshold
        const threshold = await vscode.window.showQuickPick([
            { label: 'Critical', value: 'critical', description: 'Only critical findings' },
            { label: 'High', value: 'high', description: 'Critical and high findings' },
            { label: 'Medium', value: 'medium', description: 'Critical, high, and medium findings' },
            { label: 'Low', value: 'low', description: 'All except info findings' },
            { label: 'All', value: 'info', description: 'All findings' }
        ], {
            placeHolder: 'Select minimum severity threshold'
        });
        if (!threshold) {
            return;
        }
        await issueManager.createIssuesFromFindings(findings, undefined, {
            severityThreshold: threshold.value
        });
        treeProvider.refresh();
    }));
    // Link finding to PR
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.linkToPR', async (finding) => {
        if (!await ensureAuthenticated()) {
            return;
        }
        const targetFinding = finding || await selectFinding();
        if (!targetFinding) {
            vscode.window.showWarningMessage('No finding selected');
            return;
        }
        await prLinker.linkFindingToPR(targetFinding);
        treeProvider.refresh();
    }));
    // View created issues
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.viewIssues', async () => {
        if (!await ensureAuthenticated()) {
            return;
        }
        const mappings = await issueManager.getAllMappings();
        if (mappings.length === 0) {
            vscode.window.showInformationMessage('No issues have been created yet');
            return;
        }
        const items = mappings.map(m => ({
            label: `#${m.issueNumber}`,
            description: m.repository,
            detail: `Status: ${m.status} | Created: ${new Date(m.createdAt).toLocaleDateString()}`,
            url: m.issueUrl
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an issue to open'
        });
        if (selected) {
            vscode.env.openExternal(vscode.Uri.parse(selected.url));
        }
    }));
    // Sync issue status
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.syncStatus', async () => {
        if (!await ensureAuthenticated()) {
            return;
        }
        await issueManager.syncIssueStatus();
        treeProvider.refresh();
    }));
    // Open in GitHub
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.openInGitHub', async (url) => {
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }));
    // Refresh tree view
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.refreshTree', () => {
        treeProvider.updateAuthStatus();
    }));
    // Logout command
    context.subscriptions.push(vscode.commands.registerCommand('jokalala.github.logout', async () => {
        await githubService.logout();
        vscode.window.showInformationMessage('Disconnected from GitHub');
        treeProvider.updateAuthStatus();
    }));
}
/**
 * Ensure user is authenticated
 */
async function ensureAuthenticated() {
    const isAuth = await githubService.isAuthenticated();
    if (!isAuth) {
        const action = await vscode.window.showWarningMessage('You need to sign in to GitHub first', 'Sign In');
        if (action === 'Sign In') {
            const success = await githubService.authenticate();
            if (success) {
                treeProvider.updateAuthStatus();
            }
            return success;
        }
        return false;
    }
    return true;
}
/**
 * Select a finding from current analysis results
 */
async function selectFinding() {
    const findings = pluginContext.getFindings();
    if (findings.length === 0) {
        vscode.window.showInformationMessage('No findings available');
        return undefined;
    }
    const items = findings.map(f => ({
        label: f.title,
        description: `${f.severity.toUpperCase()} | ${f.file}:${f.line}`,
        detail: f.description.substring(0, 100) + '...',
        finding: f
    }));
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a finding',
        matchOnDescription: true,
        matchOnDetail: true
    });
    return selected?.finding;
}
// Export for plugin API
exports.default = {
    activate,
    deactivate
};
//# sourceMappingURL=index.js.map