/**
 * GitHub Integration Plugin Types
 *
 * Type definitions for the Jokalala GitHub Integration plugin.
 */

import * as vscode from 'vscode';

/**
 * Security finding from Jokalala analyzer
 */
export interface SecurityFinding {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    cwe?: string;
    cve?: string;
    file: string;
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    code?: string;
    remediation?: string;
    references?: string[];
    confidence: number;
    tags?: string[];
}

/**
 * GitHub issue representation
 */
export interface GitHubIssue {
    id: number;
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    html_url: string;
    created_at: string;
    updated_at: string;
    closed_at?: string;
    labels: GitHubLabel[];
    assignees: GitHubUser[];
    milestone?: GitHubMilestone;
    repository: string;
    findingId?: string;
}

/**
 * GitHub label
 */
export interface GitHubLabel {
    id: number;
    name: string;
    color: string;
    description?: string;
}

/**
 * GitHub user
 */
export interface GitHubUser {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
}

/**
 * GitHub milestone
 */
export interface GitHubMilestone {
    id: number;
    number: number;
    title: string;
    state: 'open' | 'closed';
    due_on?: string;
}

/**
 * GitHub pull request
 */
export interface GitHubPullRequest {
    id: number;
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed' | 'merged';
    html_url: string;
    head: {
        ref: string;
        sha: string;
    };
    base: {
        ref: string;
        sha: string;
    };
    created_at: string;
    updated_at: string;
    merged_at?: string;
    user: GitHubUser;
}

/**
 * GitHub repository
 */
export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    owner: GitHubUser;
    html_url: string;
    default_branch: string;
    private: boolean;
}

/**
 * Issue creation options
 */
export interface CreateIssueOptions {
    finding: SecurityFinding;
    repository: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
    includeCodeSnippet?: boolean;
    includeRemediation?: boolean;
    additionalBody?: string;
}

/**
 * PR link options
 */
export interface LinkToPROptions {
    finding: SecurityFinding;
    pullRequest: GitHubPullRequest;
    repository: string;
    addComment?: boolean;
    commentBody?: string;
}

/**
 * Plugin configuration
 */
export interface GitHubPluginConfig {
    enabled: boolean;
    autoCreateIssues: boolean;
    autoCreateSeverityThreshold: 'critical' | 'high' | 'medium' | 'low';
    issueLabels: string[];
    issueAssignees: string[];
    linkPRComments: boolean;
    includeCodeSnippet: boolean;
    includeRemediation: boolean;
    defaultRepository: string;
    enterpriseUrl: string;
}

/**
 * Finding-Issue mapping for tracking
 */
export interface FindingIssueMapping {
    findingId: string;
    issueNumber: number;
    repository: string;
    issueUrl: string;
    createdAt: string;
    status: 'open' | 'closed' | 'resolved';
}

/**
 * Finding-PR link
 */
export interface FindingPRLink {
    findingId: string;
    prNumber: number;
    repository: string;
    prUrl: string;
    linkedAt: string;
    commentId?: number;
}

/**
 * Plugin context provided by Jokalala
 */
export interface PluginContext {
    extensionContext: vscode.ExtensionContext;
    secrets: vscode.SecretStorage;
    globalState: vscode.Memento;
    workspaceState: vscode.Memento;
    logger: PluginLogger;
    registerCommand: (command: string, callback: (...args: any[]) => any) => vscode.Disposable;
    onAnalysisComplete: (callback: (findings: SecurityFinding[]) => void) => vscode.Disposable;
    getFindings: () => SecurityFinding[];
    getConfiguration: <T>(key: string) => T;
    showProgress: <T>(title: string, task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>) => Promise<T>;
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, error?: Error) => void;
    debug: (message: string, ...args: any[]) => void;
}

/**
 * Severity priority for sorting/filtering
 */
export const SEVERITY_PRIORITY: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1
};

/**
 * Severity to GitHub label color mapping
 */
export const SEVERITY_COLORS: Record<string, string> = {
    critical: 'd73a4a',  // Red
    high: 'ff6b6b',      // Light red
    medium: 'ffa500',    // Orange
    low: 'ffd93d',       // Yellow
    info: '0075ca'       // Blue
};

/**
 * Default issue labels by severity
 */
export const DEFAULT_SEVERITY_LABELS: Record<string, string> = {
    critical: 'priority: critical',
    high: 'priority: high',
    medium: 'priority: medium',
    low: 'priority: low',
    info: 'priority: low'
};
