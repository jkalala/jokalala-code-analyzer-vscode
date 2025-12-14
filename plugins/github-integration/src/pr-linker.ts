/**
 * Pull Request Linker
 *
 * Links security findings to GitHub pull requests.
 * Adds comments to PRs with finding details and tracks remediation.
 */

import * as vscode from 'vscode';
import { GitHubService } from './github-service';
import {
    SecurityFinding,
    GitHubPullRequest,
    FindingPRLink,
    GitHubPluginConfig,
    LinkToPROptions,
    SEVERITY_PRIORITY
} from './types';

const PR_LINKS_KEY = 'jokalala.github.findingPRLinks';

export class PRLinker {
    private githubService: GitHubService;
    private globalState: vscode.Memento;
    private config: GitHubPluginConfig;

    constructor(
        githubService: GitHubService,
        globalState: vscode.Memento,
        config: GitHubPluginConfig
    ) {
        this.githubService = githubService;
        this.globalState = globalState;
        this.config = config;
    }

    /**
     * Update configuration
     */
    updateConfig(config: GitHubPluginConfig): void {
        this.config = config;
    }

    /**
     * Link a finding to a pull request
     */
    async linkFindingToPR(
        finding: SecurityFinding,
        repository?: string
    ): Promise<FindingPRLink | null> {
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
            vscode.window.showInformationMessage(
                'No open pull requests found in this repository'
            );
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
            const action = await vscode.window.showWarningMessage(
                `Finding already linked to PR #${selectedPR.number}`,
                'View PR',
                'Link Again',
                'Cancel'
            );

            if (action === 'View PR') {
                vscode.env.openExternal(vscode.Uri.parse(selectedPR.html_url));
                return existingLink;
            } else if (action !== 'Link Again') {
                return null;
            }
        }

        // Link options
        const options: LinkToPROptions = {
            finding,
            pullRequest: selectedPR,
            repository: repo,
            addComment: this.config.linkPRComments
        };

        try {
            const result = await this.githubService.linkFindingToPR(options);

            // Save link
            const link: FindingPRLink = {
                findingId: finding.id,
                prNumber: selectedPR.number,
                repository: repo,
                prUrl: selectedPR.html_url,
                linkedAt: new Date().toISOString(),
                commentId: result?.commentId
            };

            await this.saveFindingPRLink(link);

            vscode.window.showInformationMessage(
                `Linked finding to PR #${selectedPR.number}${result ? ' (comment added)' : ''}`,
                'View PR'
            ).then(selection => {
                if (selection === 'View PR') {
                    vscode.env.openExternal(vscode.Uri.parse(selectedPR.html_url));
                }
            });

            return link;
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to link to PR: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return null;
        }
    }

    /**
     * Link multiple findings to a PR
     */
    async linkFindingsToPR(
        findings: SecurityFinding[],
        repository?: string
    ): Promise<{ linked: FindingPRLink[]; failed: number }> {
        const result = {
            linked: [] as FindingPRLink[],
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
            vscode.window.showInformationMessage(
                'No open pull requests found in this repository'
            );
            return result;
        }

        // Select PR
        const selectedPR = await this.selectPullRequest(pullRequests);

        if (!selectedPR) {
            return result;
        }

        // Create summary comment
        const summaryComment = this.buildSummaryComment(findings);

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Linking ${findings.length} findings to PR #${selectedPR.number}`,
                cancellable: false
            },
            async (progress) => {
                try {
                    // Add single summary comment for all findings
                    const options: LinkToPROptions = {
                        finding: findings[0], // Primary finding
                        pullRequest: selectedPR,
                        repository: repo,
                        addComment: this.config.linkPRComments,
                        commentBody: summaryComment
                    };

                    const commentResult = await this.githubService.linkFindingToPR(options);

                    // Save links for all findings
                    for (const finding of findings) {
                        const link: FindingPRLink = {
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
                } catch (error) {
                    result.failed = findings.length;
                }
            }
        );

        vscode.window.showInformationMessage(
            `Linked ${result.linked.length} findings to PR #${selectedPR.number}`
        );

        return result;
    }

    /**
     * Build summary comment for multiple findings
     */
    private buildSummaryComment(findings: SecurityFinding[]): string {
        const lines: string[] = [];

        // Sort by severity
        const sorted = [...findings].sort((a, b) =>
            (SEVERITY_PRIORITY[b.severity] || 0) - (SEVERITY_PRIORITY[a.severity] || 0)
        );

        // Count by severity
        const counts: Record<string, number> = {};
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
    private getSeverityEmoji(severity: string): string {
        const emojis: Record<string, string> = {
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
    private groupBySeverity(findings: SecurityFinding[]): Record<string, SecurityFinding[]> {
        const grouped: Record<string, SecurityFinding[]> = {};

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
    async getAllLinks(): Promise<FindingPRLink[]> {
        return this.globalState.get<FindingPRLink[]>(PR_LINKS_KEY, []);
    }

    /**
     * Get link for a specific finding and PR
     */
    async getLinkForFinding(
        findingId: string,
        prNumber?: number
    ): Promise<FindingPRLink | undefined> {
        const links = await this.getAllLinks();

        if (prNumber) {
            return links.find(l => l.findingId === findingId && l.prNumber === prNumber);
        }

        return links.find(l => l.findingId === findingId);
    }

    /**
     * Get all links for a PR
     */
    async getLinksForPR(prNumber: number, repository: string): Promise<FindingPRLink[]> {
        const links = await this.getAllLinks();
        return links.filter(l => l.prNumber === prNumber && l.repository === repository);
    }

    /**
     * Save a finding-PR link
     */
    private async saveFindingPRLink(link: FindingPRLink): Promise<void> {
        const links = await this.getAllLinks();

        // Remove existing link for same finding-PR combination
        const filtered = links.filter(
            l => !(l.findingId === link.findingId && l.prNumber === link.prNumber)
        );
        filtered.push(link);

        await this.globalState.update(PR_LINKS_KEY, filtered);
    }

    /**
     * Remove link
     */
    async removeLink(findingId: string, prNumber: number): Promise<void> {
        const links = await this.getAllLinks();
        const filtered = links.filter(
            l => !(l.findingId === findingId && l.prNumber === prNumber)
        );
        await this.globalState.update(PR_LINKS_KEY, filtered);
    }

    /**
     * Clear all links
     */
    async clearAllLinks(): Promise<void> {
        await this.globalState.update(PR_LINKS_KEY, []);
    }

    /**
     * Select repository
     */
    private async selectRepository(): Promise<string | null> {
        const workspaceRepo = await this.githubService.getRepositoryFromWorkspace();
        const repositories = await this.githubService.getRepositories();

        if (repositories.length === 0 && !workspaceRepo) {
            vscode.window.showErrorMessage(
                'No repositories found. Please authenticate with GitHub first.'
            );
            return null;
        }

        const items: vscode.QuickPickItem[] = [];

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
    private async selectPullRequest(
        pullRequests: GitHubPullRequest[]
    ): Promise<GitHubPullRequest | null> {
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
    private formatDate(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 30) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}
