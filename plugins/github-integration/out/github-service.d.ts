/**
 * GitHub API Service
 *
 * Handles all GitHub API interactions including authentication,
 * issue creation, PR operations, and repository management.
 */
import * as vscode from 'vscode';
import { GitHubIssue, GitHubPullRequest, GitHubRepository, CreateIssueOptions, LinkToPROptions, PluginLogger } from './types';
export declare class GitHubService {
    private octokit;
    private secrets;
    private logger;
    private enterpriseUrl;
    constructor(secrets: vscode.SecretStorage, logger: PluginLogger, enterpriseUrl?: string);
    /**
     * Check if authenticated
     */
    isAuthenticated(): Promise<boolean>;
    /**
     * Authenticate with GitHub
     */
    authenticate(): Promise<boolean>;
    /**
     * Initialize Octokit client
     */
    private initializeOctokit;
    /**
     * Ensure Octokit is initialized
     */
    private ensureOctokit;
    /**
     * Get authenticated user
     */
    getAuthenticatedUser(): Promise<{
        login: string;
        name: string;
    } | null>;
    /**
     * Get repositories accessible by the user
     */
    getRepositories(): Promise<GitHubRepository[]>;
    /**
     * Create a GitHub issue from a security finding
     */
    createIssueFromFinding(options: CreateIssueOptions): Promise<GitHubIssue | null>;
    /**
     * Build issue title from finding
     */
    private buildIssueTitle;
    /**
     * Build issue body from finding
     */
    private buildIssueBody;
    /**
     * Get severity badge markdown
     */
    private getSeverityBadge;
    /**
     * Get language from file extension
     */
    private getLanguageFromFile;
    /**
     * Ensure labels exist in repository
     */
    private ensureLabelsExist;
    /**
     * Get open pull requests for a repository
     */
    getPullRequests(repository: string): Promise<GitHubPullRequest[]>;
    /**
     * Link a finding to a pull request by adding a comment
     */
    linkFindingToPR(options: LinkToPROptions): Promise<{
        commentId: number;
        commentUrl: string;
    } | null>;
    /**
     * Build PR comment body from finding
     */
    private buildPRCommentBody;
    /**
     * Get issue by number
     */
    getIssue(repository: string, issueNumber: number): Promise<GitHubIssue | null>;
    /**
     * Close an issue
     */
    closeIssue(repository: string, issueNumber: number): Promise<boolean>;
    /**
     * Get repository from current workspace
     */
    getRepositoryFromWorkspace(): Promise<string | null>;
    /**
     * Logout / Clear authentication
     */
    logout(): Promise<void>;
}
//# sourceMappingURL=github-service.d.ts.map