/**
 * GitHub Tree View Provider
 *
 * Provides a tree view for GitHub integration showing:
 * - Authentication status
 * - Created issues
 * - Linked pull requests
 * - Repository information
 */

import * as vscode from 'vscode';
import { GitHubService } from './github-service';
import { IssueManager } from './issue-manager';
import { PRLinker } from './pr-linker';
import {
    GitHubIssue,
    FindingIssueMapping,
    FindingPRLink
} from './types';

type TreeItemType =
    | 'auth-status'
    | 'auth-login'
    | 'section-issues'
    | 'section-prs'
    | 'section-actions'
    | 'github-issue'
    | 'github-pr-link'
    | 'action-create-issues'
    | 'action-sync'
    | 'empty';

export class GitHubTreeItem extends vscode.TreeItem {
    public readonly itemType: TreeItemType;
    public readonly data?: any;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        itemType: TreeItemType,
        data?: any
    ) {
        super(label, collapsibleState);
        this.itemType = itemType;
        this.data = data;
        this.contextValue = `github-${itemType}`;
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'auth-status':
                this.iconPath = new vscode.ThemeIcon('account');
                this.description = this.data?.authenticated ? 'Connected' : 'Not connected';
                break;

            case 'auth-login':
                this.iconPath = new vscode.ThemeIcon('sign-in');
                this.command = {
                    command: 'jokalala.github.authenticate',
                    title: 'Sign in to GitHub'
                };
                break;

            case 'section-issues':
                this.iconPath = new vscode.ThemeIcon('issues');
                this.description = this.data?.count ? `${this.data.count}` : '';
                break;

            case 'section-prs':
                this.iconPath = new vscode.ThemeIcon('git-pull-request');
                this.description = this.data?.count ? `${this.data.count}` : '';
                break;

            case 'section-actions':
                this.iconPath = new vscode.ThemeIcon('rocket');
                break;

            case 'github-issue':
                this.setupIssueItem();
                break;

            case 'github-pr-link':
                this.setupPRLinkItem();
                break;

            case 'action-create-issues':
                this.iconPath = new vscode.ThemeIcon('issue-opened');
                this.command = {
                    command: 'jokalala.github.createIssuesFromFindings',
                    title: 'Create Issues from Findings'
                };
                break;

            case 'action-sync':
                this.iconPath = new vscode.ThemeIcon('sync');
                this.command = {
                    command: 'jokalala.github.syncStatus',
                    title: 'Sync Issue Status'
                };
                break;

            case 'empty':
                this.iconPath = new vscode.ThemeIcon('info');
                this.description = '';
                break;
        }
    }

    private setupIssueItem(): void {
        const issue = this.data as (FindingIssueMapping & { issue?: GitHubIssue });

        if (issue.issue) {
            (this as vscode.TreeItem).label = `#${issue.issueNumber} ${issue.issue.title}`;
            this.description = issue.issue.state;
            this.tooltip = new vscode.MarkdownString(
                `**Issue #${issue.issueNumber}**\n\n` +
                `State: ${issue.issue.state}\n\n` +
                `Repository: ${issue.repository}\n\n` +
                `Created: ${new Date(issue.createdAt).toLocaleDateString()}\n\n` +
                `[Open in GitHub](${issue.issueUrl})`
            );
            this.tooltip.isTrusted = true;
        } else {
            this.description = issue.status;
            this.tooltip = `Issue #${issue.issueNumber} in ${issue.repository}`;
        }

        // Icon based on status
        if (issue.status === 'closed' || issue.issue?.state === 'closed') {
            this.iconPath = new vscode.ThemeIcon('issue-closed', new vscode.ThemeColor('charts.purple'));
        } else {
            this.iconPath = new vscode.ThemeIcon('issue-opened', new vscode.ThemeColor('charts.green'));
        }

        // Command to open in browser
        this.command = {
            command: 'jokalala.github.openInGitHub',
            title: 'Open in GitHub',
            arguments: [issue.issueUrl]
        };
    }

    private setupPRLinkItem(): void {
        const link = this.data as FindingPRLink;

        (this as vscode.TreeItem).label = `PR #${link.prNumber}`;
        this.description = link.repository;
        this.iconPath = new vscode.ThemeIcon('git-pull-request');
        this.tooltip = new vscode.MarkdownString(
            `**Pull Request #${link.prNumber}**\n\n` +
            `Repository: ${link.repository}\n\n` +
            `Linked: ${new Date(link.linkedAt).toLocaleDateString()}\n\n` +
            `[Open in GitHub](${link.prUrl})`
        );
        this.tooltip.isTrusted = true;

        this.command = {
            command: 'jokalala.github.openInGitHub',
            title: 'Open in GitHub',
            arguments: [link.prUrl]
        };
    }
}

export class GitHubTreeProvider implements vscode.TreeDataProvider<GitHubTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<GitHubTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private githubService: GitHubService;
    private issueManager: IssueManager;
    private prLinker: PRLinker;
    private isAuthenticated: boolean = false;
    private userName: string = '';

    constructor(
        githubService: GitHubService,
        issueManager: IssueManager,
        prLinker: PRLinker
    ) {
        this.githubService = githubService;
        this.issueManager = issueManager;
        this.prLinker = prLinker;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async updateAuthStatus(): Promise<void> {
        this.isAuthenticated = await this.githubService.isAuthenticated();
        if (this.isAuthenticated) {
            const user = await this.githubService.getAuthenticatedUser();
            this.userName = user?.login || '';
        }
        this.refresh();
    }

    getTreeItem(element: GitHubTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitHubTreeItem): Promise<GitHubTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        switch (element.itemType) {
            case 'section-issues':
                return this.getIssueItems();
            case 'section-prs':
                return this.getPRLinkItems();
            case 'section-actions':
                return this.getActionItems();
            default:
                return [];
        }
    }

    private async getRootItems(): Promise<GitHubTreeItem[]> {
        const items: GitHubTreeItem[] = [];

        // Authentication status
        if (this.isAuthenticated) {
            items.push(new GitHubTreeItem(
                this.userName || 'Connected',
                vscode.TreeItemCollapsibleState.None,
                'auth-status',
                { authenticated: true }
            ));
        } else {
            items.push(new GitHubTreeItem(
                'Sign in to GitHub',
                vscode.TreeItemCollapsibleState.None,
                'auth-login'
            ));

            return items;
        }

        // Issues section
        const mappings = await this.issueManager.getAllMappings();
        items.push(new GitHubTreeItem(
            'Created Issues',
            vscode.TreeItemCollapsibleState.Expanded,
            'section-issues',
            { count: mappings.length }
        ));

        // PR Links section
        const links = await this.prLinker.getAllLinks();
        items.push(new GitHubTreeItem(
            'PR Links',
            vscode.TreeItemCollapsibleState.Collapsed,
            'section-prs',
            { count: links.length }
        ));

        // Actions section
        items.push(new GitHubTreeItem(
            'Quick Actions',
            vscode.TreeItemCollapsibleState.Collapsed,
            'section-actions'
        ));

        return items;
    }

    private async getIssueItems(): Promise<GitHubTreeItem[]> {
        const mappings = await this.issueManager.getAllMappings();

        if (mappings.length === 0) {
            return [new GitHubTreeItem(
                'No issues created yet',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            )];
        }

        // Sort by creation date (newest first)
        const sorted = [...mappings].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return sorted.map(mapping => new GitHubTreeItem(
            `#${mapping.issueNumber}`,
            vscode.TreeItemCollapsibleState.None,
            'github-issue',
            mapping
        ));
    }

    private async getPRLinkItems(): Promise<GitHubTreeItem[]> {
        const links = await this.prLinker.getAllLinks();

        if (links.length === 0) {
            return [new GitHubTreeItem(
                'No PR links yet',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            )];
        }

        // Group by PR
        const grouped = new Map<string, FindingPRLink[]>();
        links.forEach(link => {
            const key = `${link.repository}#${link.prNumber}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(link);
        });

        const items: GitHubTreeItem[] = [];
        grouped.forEach((prLinks, _key) => {
            const firstLink = prLinks[0];
            items.push(new GitHubTreeItem(
                `PR #${firstLink.prNumber} (${prLinks.length} findings)`,
                vscode.TreeItemCollapsibleState.None,
                'github-pr-link',
                firstLink
            ));
        });

        return items;
    }

    private getActionItems(): GitHubTreeItem[] {
        return [
            new GitHubTreeItem(
                'Create Issues from All Findings',
                vscode.TreeItemCollapsibleState.None,
                'action-create-issues'
            ),
            new GitHubTreeItem(
                'Sync Issue Status',
                vscode.TreeItemCollapsibleState.None,
                'action-sync'
            )
        ];
    }
}

/**
 * Register the GitHub tree view
 */
export function registerGitHubTreeView(
    context: vscode.ExtensionContext,
    githubService: GitHubService,
    issueManager: IssueManager,
    prLinker: PRLinker
): GitHubTreeProvider {
    const treeProvider = new GitHubTreeProvider(githubService, issueManager, prLinker);

    const treeView = vscode.window.createTreeView('jokalala-github', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(treeView);

    // Update auth status on initial load
    treeProvider.updateAuthStatus();

    return treeProvider;
}
