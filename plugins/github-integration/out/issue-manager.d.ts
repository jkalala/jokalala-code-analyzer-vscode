/**
 * Issue Manager
 *
 * Manages the creation and tracking of GitHub issues from security findings.
 * Handles batch creation, deduplication, and status synchronization.
 */
import * as vscode from 'vscode';
import { GitHubService } from './github-service';
import { SecurityFinding, GitHubIssue, FindingIssueMapping, GitHubPluginConfig } from './types';
export declare class IssueManager {
    private githubService;
    private globalState;
    private config;
    constructor(githubService: GitHubService, globalState: vscode.Memento, config: GitHubPluginConfig);
    /**
     * Update configuration
     */
    updateConfig(config: GitHubPluginConfig): void;
    /**
     * Create a single issue from a finding
     */
    createIssueFromFinding(finding: SecurityFinding, repository?: string): Promise<GitHubIssue | null>;
    /**
     * Create issues from multiple findings
     */
    createIssuesFromFindings(findings: SecurityFinding[], repository?: string, options?: {
        severityThreshold?: string;
        skipExisting?: boolean;
    }): Promise<{
        created: GitHubIssue[];
        skipped: number;
        failed: number;
    }>;
    /**
     * Auto-create issues for findings meeting severity threshold
     */
    autoCreateIssuesForFindings(findings: SecurityFinding[]): Promise<void>;
    /**
     * Sync issue status with GitHub
     */
    syncIssueStatus(): Promise<void>;
    /**
     * Get all finding-issue mappings
     */
    getAllMappings(): Promise<FindingIssueMapping[]>;
    /**
     * Get mapping for a specific finding
     */
    getMappingForFinding(findingId: string): Promise<FindingIssueMapping | undefined>;
    /**
     * Save a finding-issue mapping
     */
    private saveFindingIssueMapping;
    /**
     * Remove mapping for a finding
     */
    removeMappingForFinding(findingId: string): Promise<void>;
    /**
     * Clear all mappings
     */
    clearAllMappings(): Promise<void>;
    /**
     * Select repository from available options
     */
    private selectRepository;
    /**
     * Get issues created by Jokalala
     */
    getJokalalaIssues(repository: string): Promise<GitHubIssue[]>;
}
//# sourceMappingURL=issue-manager.d.ts.map