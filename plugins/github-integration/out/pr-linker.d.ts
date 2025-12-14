/**
 * Pull Request Linker
 *
 * Links security findings to GitHub pull requests.
 * Adds comments to PRs with finding details and tracks remediation.
 */
import * as vscode from 'vscode';
import { GitHubService } from './github-service';
import { SecurityFinding, FindingPRLink, GitHubPluginConfig } from './types';
export declare class PRLinker {
    private githubService;
    private globalState;
    private config;
    constructor(githubService: GitHubService, globalState: vscode.Memento, config: GitHubPluginConfig);
    /**
     * Update configuration
     */
    updateConfig(config: GitHubPluginConfig): void;
    /**
     * Link a finding to a pull request
     */
    linkFindingToPR(finding: SecurityFinding, repository?: string): Promise<FindingPRLink | null>;
    /**
     * Link multiple findings to a PR
     */
    linkFindingsToPR(findings: SecurityFinding[], repository?: string): Promise<{
        linked: FindingPRLink[];
        failed: number;
    }>;
    /**
     * Build summary comment for multiple findings
     */
    private buildSummaryComment;
    /**
     * Get severity emoji
     */
    private getSeverityEmoji;
    /**
     * Group findings by severity
     */
    private groupBySeverity;
    /**
     * Get all PR links
     */
    getAllLinks(): Promise<FindingPRLink[]>;
    /**
     * Get link for a specific finding and PR
     */
    getLinkForFinding(findingId: string, prNumber?: number): Promise<FindingPRLink | undefined>;
    /**
     * Get all links for a PR
     */
    getLinksForPR(prNumber: number, repository: string): Promise<FindingPRLink[]>;
    /**
     * Save a finding-PR link
     */
    private saveFindingPRLink;
    /**
     * Remove link
     */
    removeLink(findingId: string, prNumber: number): Promise<void>;
    /**
     * Clear all links
     */
    clearAllLinks(): Promise<void>;
    /**
     * Select repository
     */
    private selectRepository;
    /**
     * Select pull request
     */
    private selectPullRequest;
    /**
     * Format date for display
     */
    private formatDate;
}
//# sourceMappingURL=pr-linker.d.ts.map