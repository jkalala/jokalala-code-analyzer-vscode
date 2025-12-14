"use strict";
/**
 * Issue Manager
 *
 * Manages the creation and tracking of GitHub issues from security findings.
 * Handles batch creation, deduplication, and status synchronization.
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
exports.IssueManager = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const MAPPINGS_KEY = 'jokalala.github.findingIssueMappings';
class IssueManager {
    constructor(githubService, globalState, config) {
        this.githubService = githubService;
        this.globalState = globalState;
        this.config = config;
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = config;
    }
    /**
     * Create a single issue from a finding
     */
    async createIssueFromFinding(finding, repository) {
        // Check if issue already exists for this finding
        const existingMapping = await this.getMappingForFinding(finding.id);
        if (existingMapping) {
            const existingIssue = await this.githubService.getIssue(existingMapping.repository, existingMapping.issueNumber);
            if (existingIssue && existingIssue.state === 'open') {
                vscode.window.showInformationMessage(`Issue #${existingIssue.number} already exists for this finding`, 'Open Issue').then(selection => {
                    if (selection === 'Open Issue') {
                        vscode.env.openExternal(vscode.Uri.parse(existingIssue.html_url));
                    }
                });
                return existingIssue;
            }
        }
        // Get repository
        const repo = repository ||
            this.config.defaultRepository ||
            await this.selectRepository();
        if (!repo) {
            vscode.window.showWarningMessage('No repository selected');
            return null;
        }
        // Create issue options
        const options = {
            finding,
            repository: repo,
            labels: this.config.issueLabels,
            assignees: this.config.issueAssignees,
            includeCodeSnippet: this.config.includeCodeSnippet,
            includeRemediation: this.config.includeRemediation
        };
        try {
            const issue = await this.githubService.createIssueFromFinding(options);
            if (issue) {
                // Save mapping
                await this.saveFindingIssueMapping({
                    findingId: finding.id,
                    issueNumber: issue.number,
                    repository: repo,
                    issueUrl: issue.html_url,
                    createdAt: new Date().toISOString(),
                    status: 'open'
                });
                vscode.window.showInformationMessage(`Created issue #${issue.number}: ${issue.title}`, 'Open Issue').then(selection => {
                    if (selection === 'Open Issue') {
                        vscode.env.openExternal(vscode.Uri.parse(issue.html_url));
                    }
                });
            }
            return issue;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    /**
     * Create issues from multiple findings
     */
    async createIssuesFromFindings(findings, repository, options) {
        const result = {
            created: [],
            skipped: 0,
            failed: 0
        };
        // Filter by severity threshold
        const threshold = options?.severityThreshold || this.config.autoCreateSeverityThreshold;
        const thresholdPriority = types_1.SEVERITY_PRIORITY[threshold] || 0;
        const filteredFindings = findings.filter(f => (types_1.SEVERITY_PRIORITY[f.severity] || 0) >= thresholdPriority);
        if (filteredFindings.length === 0) {
            vscode.window.showInformationMessage(`No findings meet the severity threshold (${threshold})`);
            return result;
        }
        // Get repository
        const repo = repository ||
            this.config.defaultRepository ||
            await this.selectRepository();
        if (!repo) {
            vscode.window.showWarningMessage('No repository selected');
            return result;
        }
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating GitHub Issues',
            cancellable: true
        }, async (progress, token) => {
            const total = filteredFindings.length;
            for (let i = 0; i < filteredFindings.length; i++) {
                if (token.isCancellationRequested) {
                    break;
                }
                const finding = filteredFindings[i];
                progress.report({
                    message: `${i + 1}/${total}: ${finding.title}`,
                    increment: (100 / total)
                });
                // Check for existing mapping
                if (options?.skipExisting !== false) {
                    const existing = await this.getMappingForFinding(finding.id);
                    if (existing) {
                        result.skipped++;
                        continue;
                    }
                }
                try {
                    const issueOptions = {
                        finding,
                        repository: repo,
                        labels: this.config.issueLabels,
                        assignees: this.config.issueAssignees,
                        includeCodeSnippet: this.config.includeCodeSnippet,
                        includeRemediation: this.config.includeRemediation
                    };
                    const issue = await this.githubService.createIssueFromFinding(issueOptions);
                    if (issue) {
                        result.created.push(issue);
                        // Save mapping
                        await this.saveFindingIssueMapping({
                            findingId: finding.id,
                            issueNumber: issue.number,
                            repository: repo,
                            issueUrl: issue.html_url,
                            createdAt: new Date().toISOString(),
                            status: 'open'
                        });
                    }
                    else {
                        result.failed++;
                    }
                    // Rate limiting - small delay between requests
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                catch (error) {
                    result.failed++;
                }
            }
        });
        // Show summary
        const message = [
            `Created: ${result.created.length}`,
            result.skipped > 0 ? `Skipped (existing): ${result.skipped}` : null,
            result.failed > 0 ? `Failed: ${result.failed}` : null
        ].filter(Boolean).join(', ');
        vscode.window.showInformationMessage(`GitHub Issues: ${message}`);
        return result;
    }
    /**
     * Auto-create issues for findings meeting severity threshold
     */
    async autoCreateIssuesForFindings(findings) {
        if (!this.config.autoCreateIssues) {
            return;
        }
        const repo = this.config.defaultRepository ||
            await this.githubService.getRepositoryFromWorkspace();
        if (!repo) {
            return;
        }
        await this.createIssuesFromFindings(findings, repo, {
            severityThreshold: this.config.autoCreateSeverityThreshold,
            skipExisting: true
        });
    }
    /**
     * Sync issue status with GitHub
     */
    async syncIssueStatus() {
        const mappings = await this.getAllMappings();
        if (mappings.length === 0) {
            vscode.window.showInformationMessage('No linked issues to sync');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing Issue Status',
            cancellable: false
        }, async (progress) => {
            let updated = 0;
            for (let i = 0; i < mappings.length; i++) {
                const mapping = mappings[i];
                progress.report({
                    message: `${i + 1}/${mappings.length}`,
                    increment: (100 / mappings.length)
                });
                try {
                    const issue = await this.githubService.getIssue(mapping.repository, mapping.issueNumber);
                    if (issue) {
                        const newStatus = issue.state === 'closed' ? 'closed' : 'open';
                        if (mapping.status !== newStatus) {
                            mapping.status = newStatus;
                            updated++;
                        }
                    }
                }
                catch {
                    // Issue may have been deleted
                }
            }
            // Save updated mappings
            await this.globalState.update(MAPPINGS_KEY, mappings);
            vscode.window.showInformationMessage(`Synced ${mappings.length} issues, ${updated} status changes`);
        });
    }
    /**
     * Get all finding-issue mappings
     */
    async getAllMappings() {
        return this.globalState.get(MAPPINGS_KEY, []);
    }
    /**
     * Get mapping for a specific finding
     */
    async getMappingForFinding(findingId) {
        const mappings = await this.getAllMappings();
        return mappings.find(m => m.findingId === findingId);
    }
    /**
     * Save a finding-issue mapping
     */
    async saveFindingIssueMapping(mapping) {
        const mappings = await this.getAllMappings();
        // Remove existing mapping for this finding if any
        const filteredMappings = mappings.filter(m => m.findingId !== mapping.findingId);
        filteredMappings.push(mapping);
        await this.globalState.update(MAPPINGS_KEY, filteredMappings);
    }
    /**
     * Remove mapping for a finding
     */
    async removeMappingForFinding(findingId) {
        const mappings = await this.getAllMappings();
        const filtered = mappings.filter(m => m.findingId !== findingId);
        await this.globalState.update(MAPPINGS_KEY, filtered);
    }
    /**
     * Clear all mappings
     */
    async clearAllMappings() {
        await this.globalState.update(MAPPINGS_KEY, []);
    }
    /**
     * Select repository from available options
     */
    async selectRepository() {
        // First try to get from workspace
        const workspaceRepo = await this.githubService.getRepositoryFromWorkspace();
        // Get all available repositories
        const repositories = await this.githubService.getRepositories();
        if (repositories.length === 0 && !workspaceRepo) {
            vscode.window.showErrorMessage('No repositories found. Please authenticate with GitHub first.');
            return null;
        }
        // Build quick pick items
        const items = [];
        if (workspaceRepo) {
            items.push({
                label: workspaceRepo,
                description: '$(folder) Current workspace',
                detail: 'Repository detected from current workspace'
            });
        }
        repositories.forEach(repo => {
            if (repo.full_name !== workspaceRepo) {
                items.push({
                    label: repo.full_name,
                    description: repo.private ? '$(lock) Private' : '$(globe) Public',
                    detail: repo.html_url
                });
            }
        });
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a repository',
            matchOnDescription: true,
            matchOnDetail: true
        });
        return selected?.label || null;
    }
    /**
     * Get issues created by Jokalala
     */
    async getJokalalaIssues(repository) {
        const mappings = await this.getAllMappings();
        const repoMappings = mappings.filter(m => m.repository === repository);
        const issues = [];
        for (const mapping of repoMappings) {
            const issue = await this.githubService.getIssue(mapping.repository, mapping.issueNumber);
            if (issue) {
                issue.findingId = mapping.findingId;
                issues.push(issue);
            }
        }
        return issues;
    }
}
exports.IssueManager = IssueManager;
//# sourceMappingURL=issue-manager.js.map