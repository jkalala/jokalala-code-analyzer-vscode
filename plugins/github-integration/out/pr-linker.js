"use strict";
/**
 * Pull Request Linker
 *
 * Links security findings to GitHub pull requests.
 * Adds comments to PRs with finding details and tracks remediation.
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
exports.PRLinker = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const PR_LINKS_KEY = 'jokalala.github.findingPRLinks';
class PRLinker {
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
     * Link a finding to a pull request
     */
    async linkFindingToPR(finding, repository) {
        // Get repository
        const repo = repository ||
            this.config.defaultRepository ||
            await this.selectRepository();
        if (!repo) {
            vscode.window.showWarningMessage('No repository selected');
            return null;
        }
        // Get open pull requests
        const pullRequests = await this.githubService.getPullRequests(repo);
        if (pullRequests.length === 0) {
            vscode.window.showInformationMessage('No open pull requests found in this repository');
            return null;
        }
        // Select PR
        const selectedPR = await this.selectPullRequest(pullRequests);
        if (!selectedPR) {
            return null;
        }
        // Check for existing link
        const existingLink = await this.getLinkForFinding(finding.id, selectedPR.number);
        if (existingLink) {
            const action = await vscode.window.showWarningMessage(`Finding already linked to PR #${selectedPR.number}`, 'View PR', 'Link Again', 'Cancel');
            if (action === 'View PR') {
                vscode.env.openExternal(vscode.Uri.parse(selectedPR.html_url));
                return existingLink;
            }
            else if (action !== 'Link Again') {
                return null;
            }
        }
        // Link options
        const options = {
            finding,
            pullRequest: selectedPR,
            repository: repo,
            addComment: this.config.linkPRComments
        };
        try {
            const result = await this.githubService.linkFindingToPR(options);
            // Save link
            const link = {
                findingId: finding.id,
                prNumber: selectedPR.number,
                repository: repo,
                prUrl: selectedPR.html_url,
                linkedAt: new Date().toISOString(),
                commentId: result?.commentId
            };
            await this.saveFindingPRLink(link);
            vscode.window.showInformationMessage(`Linked finding to PR #${selectedPR.number}${result ? ' (comment added)' : ''}`, 'View PR').then(selection => {
                if (selection === 'View PR') {
                    vscode.env.openExternal(vscode.Uri.parse(selectedPR.html_url));
                }
            });
            return link;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to link to PR: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    /**
     * Link multiple findings to a PR
     */
    async linkFindingsToPR(findings, repository) {
        const result = {
            linked: [],
            failed: 0
        };
        // Get repository
        const repo = repository ||
            this.config.defaultRepository ||
            await this.selectRepository();
        if (!repo) {
            vscode.window.showWarningMessage('No repository selected');
            return result;
        }
        // Get open pull requests
        const pullRequests = await this.githubService.getPullRequests(repo);
        if (pullRequests.length === 0) {
            vscode.window.showInformationMessage('No open pull requests found in this repository');
            return result;
        }
        // Select PR
        const selectedPR = await this.selectPullRequest(pullRequests);
        if (!selectedPR) {
            return result;
        }
        // Create summary comment
        const summaryComment = this.buildSummaryComment(findings);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Linking ${findings.length} findings to PR #${selectedPR.number}`,
            cancellable: false
        }, async (progress) => {
            try {
                // Add single summary comment for all findings
                const options = {
                    finding: findings[0], // Primary finding
                    pullRequest: selectedPR,
                    repository: repo,
                    addComment: this.config.linkPRComments,
                    commentBody: summaryComment
                };
                const commentResult = await this.githubService.linkFindingToPR(options);
                // Save links for all findings
                for (const finding of findings) {
                    const link = {
                        findingId: finding.id,
                        prNumber: selectedPR.number,
                        repository: repo,
                        prUrl: selectedPR.html_url,
                        linkedAt: new Date().toISOString(),
                        commentId: commentResult?.commentId
                    };
                    await this.saveFindingPRLink(link);
                    result.linked.push(link);
                }
            }
            catch (error) {
                result.failed = findings.length;
            }
        });
        vscode.window.showInformationMessage(`Linked ${result.linked.length} findings to PR #${selectedPR.number}`);
        return result;
    }
    /**
     * Build summary comment for multiple findings
     */
    buildSummaryComment(findings) {
        const lines = [];
        // Sort by severity
        const sorted = [...findings].sort((a, b) => (types_1.SEVERITY_PRIORITY[b.severity] || 0) - (types_1.SEVERITY_PRIORITY[a.severity] || 0));
        // Count by severity
        const counts = {};
        sorted.forEach(f => {
            counts[f.severity] = (counts[f.severity] || 0) + 1;
        });
        lines.push('## :shield: Jokalala Security Scan Results');
        lines.push('');
        lines.push('### Summary');
        lines.push('');
        lines.push('| Severity | Count |');
        lines.push('|----------|-------|');
        ['critical', 'high', 'medium', 'low', 'info'].forEach(sev => {
            if (counts[sev]) {
                lines.push(`| ${this.getSeverityEmoji(sev)} ${sev.charAt(0).toUpperCase() + sev.slice(1)} | ${counts[sev]} |`);
            }
        });
        lines.push('');
        lines.push(`**Total Findings:** ${findings.length}`);
        lines.push('');
        lines.push('### Findings');
        lines.push('');
        // Group by severity
        const grouped = this.groupBySeverity(sorted);
        for (const [severity, severityFindings] of Object.entries(grouped)) {
            lines.push(`#### ${this.getSeverityEmoji(severity)} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${severityFindings.length})`);
            lines.push('');
            severityFindings.forEach((f, i) => {
                lines.push(`<details>`);
                lines.push(`<summary><b>${i + 1}. ${f.title}</b></summary>`);
                lines.push('');
                lines.push(`- **File:** \`${f.file}:${f.line}\``);
                lines.push(`- **Category:** ${f.category}`);
                if (f.cwe) {
                    lines.push(`- **CWE:** ${f.cwe}`);
                }
                lines.push(`- **Confidence:** ${Math.round(f.confidence * 100)}%`);
                lines.push('');
                lines.push(f.description);
                lines.push('');
                if (f.remediation) {
                    lines.push('**Remediation:**');
                    lines.push(f.remediation);
                    lines.push('');
                }
                lines.push('</details>');
                lines.push('');
            });
        }
        lines.push('---');
        lines.push('');
        lines.push('*Scan performed by [Jokalala Code Analyzer](https://jokalala.com)*');
        return lines.join('\n');
    }
    /**
     * Get severity emoji
     */
    getSeverityEmoji(severity) {
        const emojis = {
            critical: ':red_circle:',
            high: ':orange_circle:',
            medium: ':yellow_circle:',
            low: ':green_circle:',
            info: ':blue_circle:'
        };
        return emojis[severity] || ':white_circle:';
    }
    /**
     * Group findings by severity
     */
    groupBySeverity(findings) {
        const grouped = {};
        findings.forEach(f => {
            if (!grouped[f.severity]) {
                grouped[f.severity] = [];
            }
            grouped[f.severity].push(f);
        });
        return grouped;
    }
    /**
     * Get all PR links
     */
    async getAllLinks() {
        return this.globalState.get(PR_LINKS_KEY, []);
    }
    /**
     * Get link for a specific finding and PR
     */
    async getLinkForFinding(findingId, prNumber) {
        const links = await this.getAllLinks();
        if (prNumber) {
            return links.find(l => l.findingId === findingId && l.prNumber === prNumber);
        }
        return links.find(l => l.findingId === findingId);
    }
    /**
     * Get all links for a PR
     */
    async getLinksForPR(prNumber, repository) {
        const links = await this.getAllLinks();
        return links.filter(l => l.prNumber === prNumber && l.repository === repository);
    }
    /**
     * Save a finding-PR link
     */
    async saveFindingPRLink(link) {
        const links = await this.getAllLinks();
        // Remove existing link for same finding-PR combination
        const filtered = links.filter(l => !(l.findingId === link.findingId && l.prNumber === link.prNumber));
        filtered.push(link);
        await this.globalState.update(PR_LINKS_KEY, filtered);
    }
    /**
     * Remove link
     */
    async removeLink(findingId, prNumber) {
        const links = await this.getAllLinks();
        const filtered = links.filter(l => !(l.findingId === findingId && l.prNumber === prNumber));
        await this.globalState.update(PR_LINKS_KEY, filtered);
    }
    /**
     * Clear all links
     */
    async clearAllLinks() {
        await this.globalState.update(PR_LINKS_KEY, []);
    }
    /**
     * Select repository
     */
    async selectRepository() {
        const workspaceRepo = await this.githubService.getRepositoryFromWorkspace();
        const repositories = await this.githubService.getRepositories();
        if (repositories.length === 0 && !workspaceRepo) {
            vscode.window.showErrorMessage('No repositories found. Please authenticate with GitHub first.');
            return null;
        }
        const items = [];
        if (workspaceRepo) {
            items.push({
                label: workspaceRepo,
                description: '$(folder) Current workspace'
            });
        }
        repositories.forEach(repo => {
            if (repo.full_name !== workspaceRepo) {
                items.push({
                    label: repo.full_name,
                    description: repo.private ? '$(lock) Private' : '$(globe) Public'
                });
            }
        });
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a repository'
        });
        return selected?.label || null;
    }
    /**
     * Select pull request
     */
    async selectPullRequest(pullRequests) {
        const items = pullRequests.map(pr => ({
            label: `#${pr.number} ${pr.title}`,
            description: `${pr.head.ref} → ${pr.base.ref}`,
            detail: `by ${pr.user.login} · updated ${this.formatDate(pr.updated_at)}`,
            pr
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a pull request',
            matchOnDescription: true,
            matchOnDetail: true
        });
        return selected?.pr || null;
    }
    /**
     * Format date for display
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffMins < 60) {
            return `${diffMins}m ago`;
        }
        else if (diffHours < 24) {
            return `${diffHours}h ago`;
        }
        else if (diffDays < 30) {
            return `${diffDays}d ago`;
        }
        else {
            return date.toLocaleDateString();
        }
    }
}
exports.PRLinker = PRLinker;
//# sourceMappingURL=pr-linker.js.map