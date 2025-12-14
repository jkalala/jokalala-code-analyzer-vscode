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
type TreeItemType = 'auth-status' | 'auth-login' | 'section-issues' | 'section-prs' | 'section-actions' | 'github-issue' | 'github-pr-link' | 'action-create-issues' | 'action-sync' | 'empty';
export declare class GitHubTreeItem extends vscode.TreeItem {
    readonly itemType: TreeItemType;
    readonly data?: any;
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, itemType: TreeItemType, data?: any);
    private setupItem;
    private setupIssueItem;
    private setupPRLinkItem;
}
export declare class GitHubTreeProvider implements vscode.TreeDataProvider<GitHubTreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<GitHubTreeItem | undefined>;
    private githubService;
    private issueManager;
    private prLinker;
    private isAuthenticated;
    private userName;
    constructor(githubService: GitHubService, issueManager: IssueManager, prLinker: PRLinker);
    refresh(): void;
    updateAuthStatus(): Promise<void>;
    getTreeItem(element: GitHubTreeItem): vscode.TreeItem;
    getChildren(element?: GitHubTreeItem): Promise<GitHubTreeItem[]>;
    private getRootItems;
    private getIssueItems;
    private getPRLinkItems;
    private getActionItems;
}
/**
 * Register the GitHub tree view
 */
export declare function registerGitHubTreeView(context: vscode.ExtensionContext, githubService: GitHubService, issueManager: IssueManager, prLinker: PRLinker): GitHubTreeProvider;
export {};
//# sourceMappingURL=github-tree-provider.d.ts.map