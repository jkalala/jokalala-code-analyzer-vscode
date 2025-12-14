"use strict";
/**
 * GitHub API Service
 *
 * Handles all GitHub API interactions including authentication,
 * issue creation, PR operations, and repository management.
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
exports.GitHubService = void 0;
const vscode = __importStar(require("vscode"));
const rest_1 = require("@octokit/rest");
const types_1 = require("./types");
const GITHUB_TOKEN_KEY = 'jokalala.github.token';
class GitHubService {
    constructor(secrets, logger, enterpriseUrl = '') {
        this.octokit = null;
        this.secrets = secrets;
        this.logger = logger;
        this.enterpriseUrl = enterpriseUrl;
    }
    /**
     * Check if authenticated
     */
    async isAuthenticated() {
        const token = await this.secrets.get(GITHUB_TOKEN_KEY);
        return !!token;
    }
    /**
     * Authenticate with GitHub
     */
    async authenticate() {
        try {
            // Try VS Code's built-in GitHub authentication
            const session = await vscode.authentication.getSession('github', ['repo', 'write:org'], {
                createIfNone: true
            });
            if (session) {
                await this.secrets.store(GITHUB_TOKEN_KEY, session.accessToken);
                await this.initializeOctokit(session.accessToken);
                this.logger.info('Successfully authenticated with GitHub');
                return true;
            }
            return false;
        }
        catch (error) {
            this.logger.error('GitHub authentication failed', error);
            // Fallback to manual token input
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your GitHub Personal Access Token',
                password: true,
                placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
                validateInput: (value) => {
                    if (!value || value.length < 20) {
                        return 'Please enter a valid GitHub token';
                    }
                    return null;
                }
            });
            if (token) {
                await this.secrets.store(GITHUB_TOKEN_KEY, token);
                await this.initializeOctokit(token);
                this.logger.info('Successfully authenticated with GitHub (manual token)');
                return true;
            }
            return false;
        }
    }
    /**
     * Initialize Octokit client
     */
    async initializeOctokit(token) {
        const authToken = token || await this.secrets.get(GITHUB_TOKEN_KEY);
        if (!authToken) {
            throw new Error('No GitHub token available');
        }
        const options = {
            auth: authToken
        };
        if (this.enterpriseUrl) {
            options.baseUrl = `${this.enterpriseUrl}/api/v3`;
        }
        this.octokit = new rest_1.Octokit(options);
    }
    /**
     * Ensure Octokit is initialized
     */
    async ensureOctokit() {
        if (!this.octokit) {
            await this.initializeOctokit();
        }
        if (!this.octokit) {
            throw new Error('GitHub client not initialized. Please authenticate first.');
        }
        return this.octokit;
    }
    /**
     * Get authenticated user
     */
    async getAuthenticatedUser() {
        try {
            const octokit = await this.ensureOctokit();
            const { data } = await octokit.users.getAuthenticated();
            return { login: data.login, name: data.name || data.login };
        }
        catch (error) {
            this.logger.error('Failed to get authenticated user', error);
            return null;
        }
    }
    /**
     * Get repositories accessible by the user
     */
    async getRepositories() {
        try {
            const octokit = await this.ensureOctokit();
            const { data } = await octokit.repos.listForAuthenticatedUser({
                sort: 'updated',
                per_page: 100
            });
            return data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                owner: {
                    id: repo.owner.id,
                    login: repo.owner.login,
                    avatar_url: repo.owner.avatar_url,
                    html_url: repo.owner.html_url
                },
                html_url: repo.html_url,
                default_branch: repo.default_branch,
                private: repo.private
            }));
        }
        catch (error) {
            this.logger.error('Failed to get repositories', error);
            return [];
        }
    }
    /**
     * Create a GitHub issue from a security finding
     */
    async createIssueFromFinding(options) {
        try {
            const octokit = await this.ensureOctokit();
            const [owner, repo] = options.repository.split('/');
            // Build issue body
            const body = this.buildIssueBody(options);
            // Prepare labels
            const labels = [
                ...(options.labels || []),
                'security',
                'jokalala',
                types_1.DEFAULT_SEVERITY_LABELS[options.finding.severity] || 'security'
            ];
            // Ensure labels exist
            await this.ensureLabelsExist(owner, repo, labels, options.finding.severity);
            // Create the issue
            const { data } = await octokit.issues.create({
                owner,
                repo,
                title: this.buildIssueTitle(options.finding),
                body,
                labels,
                assignees: options.assignees || []
            });
            this.logger.info(`Created issue #${data.number} for finding ${options.finding.id}`);
            return {
                id: data.id,
                number: data.number,
                title: data.title,
                body: data.body || '',
                state: data.state,
                html_url: data.html_url,
                created_at: data.created_at,
                updated_at: data.updated_at,
                closed_at: data.closed_at || undefined,
                labels: data.labels.map(l => ({
                    id: typeof l === 'object' ? l.id || 0 : 0,
                    name: typeof l === 'object' ? l.name || '' : l,
                    color: typeof l === 'object' ? l.color || '' : '',
                    description: typeof l === 'object' ? l.description || undefined : undefined
                })),
                assignees: data.assignees?.map(a => ({
                    id: a.id,
                    login: a.login,
                    avatar_url: a.avatar_url,
                    html_url: a.html_url
                })) || [],
                repository: options.repository,
                findingId: options.finding.id
            };
        }
        catch (error) {
            this.logger.error('Failed to create issue', error);
            throw error;
        }
    }
    /**
     * Build issue title from finding
     */
    buildIssueTitle(finding) {
        const severityBadge = finding.severity.toUpperCase();
        const cweTag = finding.cwe ? ` [${finding.cwe}]` : '';
        return `[${severityBadge}]${cweTag} ${finding.title}`;
    }
    /**
     * Build issue body from finding
     */
    buildIssueBody(options) {
        const { finding, includeCodeSnippet, includeRemediation } = options;
        const lines = [];
        // Header
        lines.push('## Security Finding Details');
        lines.push('');
        lines.push(`**Detected by:** Jokalala Code Analyzer`);
        lines.push(`**Finding ID:** \`${finding.id}\``);
        lines.push(`**Severity:** ${this.getSeverityBadge(finding.severity)}`);
        lines.push(`**Category:** ${finding.category}`);
        if (finding.cwe) {
            lines.push(`**CWE:** [${finding.cwe}](https://cwe.mitre.org/data/definitions/${finding.cwe.replace('CWE-', '')}.html)`);
        }
        if (finding.cve) {
            lines.push(`**CVE:** [${finding.cve}](https://nvd.nist.gov/vuln/detail/${finding.cve})`);
        }
        lines.push(`**Confidence:** ${Math.round(finding.confidence * 100)}%`);
        lines.push('');
        // Location
        lines.push('## Location');
        lines.push('');
        lines.push(`**File:** \`${finding.file}\``);
        lines.push(`**Line:** ${finding.line}${finding.endLine ? `-${finding.endLine}` : ''}`);
        lines.push('');
        // Description
        lines.push('## Description');
        lines.push('');
        lines.push(finding.description);
        lines.push('');
        // Code snippet
        if (includeCodeSnippet !== false && finding.code) {
            lines.push('## Vulnerable Code');
            lines.push('');
            lines.push('```' + this.getLanguageFromFile(finding.file));
            lines.push(finding.code);
            lines.push('```');
            lines.push('');
        }
        // Remediation
        if (includeRemediation !== false && finding.remediation) {
            lines.push('## Remediation');
            lines.push('');
            lines.push(finding.remediation);
            lines.push('');
        }
        // References
        if (finding.references && finding.references.length > 0) {
            lines.push('## References');
            lines.push('');
            finding.references.forEach(ref => {
                lines.push(`- ${ref}`);
            });
            lines.push('');
        }
        // Tags
        if (finding.tags && finding.tags.length > 0) {
            lines.push('## Tags');
            lines.push('');
            lines.push(finding.tags.map(t => `\`${t}\``).join(' '));
            lines.push('');
        }
        // Additional body
        if (options.additionalBody) {
            lines.push('## Additional Notes');
            lines.push('');
            lines.push(options.additionalBody);
            lines.push('');
        }
        // Footer
        lines.push('---');
        lines.push('');
        lines.push('*This issue was automatically created by [Jokalala Code Analyzer](https://jokalala.com)*');
        return lines.join('\n');
    }
    /**
     * Get severity badge markdown
     */
    getSeverityBadge(severity) {
        const badges = {
            critical: '![Critical](https://img.shields.io/badge/severity-critical-red)',
            high: '![High](https://img.shields.io/badge/severity-high-orange)',
            medium: '![Medium](https://img.shields.io/badge/severity-medium-yellow)',
            low: '![Low](https://img.shields.io/badge/severity-low-green)',
            info: '![Info](https://img.shields.io/badge/severity-info-blue)'
        };
        return badges[severity] || severity;
    }
    /**
     * Get language from file extension
     */
    getLanguageFromFile(file) {
        const ext = file.split('.').pop()?.toLowerCase() || '';
        const langMap = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            py: 'python',
            java: 'java',
            go: 'go',
            rs: 'rust',
            c: 'c',
            cpp: 'cpp',
            cs: 'csharp',
            php: 'php',
            rb: 'ruby',
            yaml: 'yaml',
            yml: 'yaml',
            json: 'json',
            tf: 'hcl',
            dockerfile: 'dockerfile'
        };
        return langMap[ext] || ext;
    }
    /**
     * Ensure labels exist in repository
     */
    async ensureLabelsExist(owner, repo, labels, severity) {
        const octokit = await this.ensureOctokit();
        for (const labelName of labels) {
            try {
                await octokit.issues.getLabel({ owner, repo, name: labelName });
            }
            catch {
                // Label doesn't exist, create it
                try {
                    let color = '0075ca'; // Default blue
                    if (labelName.includes('critical')) {
                        color = types_1.SEVERITY_COLORS.critical;
                    }
                    else if (labelName.includes('high')) {
                        color = types_1.SEVERITY_COLORS.high;
                    }
                    else if (labelName.includes('medium')) {
                        color = types_1.SEVERITY_COLORS.medium;
                    }
                    else if (labelName.includes('low')) {
                        color = types_1.SEVERITY_COLORS.low;
                    }
                    else if (labelName === 'security') {
                        color = 'd73a4a';
                    }
                    else if (labelName === 'jokalala') {
                        color = '5319e7';
                    }
                    await octokit.issues.createLabel({
                        owner,
                        repo,
                        name: labelName,
                        color,
                        description: `Created by Jokalala GitHub Integration`
                    });
                    this.logger.info(`Created label: ${labelName}`);
                }
                catch (createError) {
                    this.logger.warn(`Could not create label ${labelName}: ${createError}`);
                }
            }
        }
    }
    /**
     * Get open pull requests for a repository
     */
    async getPullRequests(repository) {
        try {
            const octokit = await this.ensureOctokit();
            const [owner, repo] = repository.split('/');
            const { data } = await octokit.pulls.list({
                owner,
                repo,
                state: 'open',
                sort: 'updated',
                direction: 'desc',
                per_page: 50
            });
            return data.map(pr => ({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                body: pr.body || '',
                state: pr.state,
                html_url: pr.html_url,
                head: {
                    ref: pr.head.ref,
                    sha: pr.head.sha
                },
                base: {
                    ref: pr.base.ref,
                    sha: pr.base.sha
                },
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                merged_at: pr.merged_at || undefined,
                user: {
                    id: pr.user?.id || 0,
                    login: pr.user?.login || '',
                    avatar_url: pr.user?.avatar_url || '',
                    html_url: pr.user?.html_url || ''
                }
            }));
        }
        catch (error) {
            this.logger.error('Failed to get pull requests', error);
            return [];
        }
    }
    /**
     * Link a finding to a pull request by adding a comment
     */
    async linkFindingToPR(options) {
        try {
            const octokit = await this.ensureOctokit();
            const [owner, repo] = options.repository.split('/');
            if (!options.addComment) {
                return null;
            }
            const commentBody = options.commentBody || this.buildPRCommentBody(options.finding);
            const { data } = await octokit.issues.createComment({
                owner,
                repo,
                issue_number: options.pullRequest.number,
                body: commentBody
            });
            this.logger.info(`Added comment to PR #${options.pullRequest.number} for finding ${options.finding.id}`);
            return {
                commentId: data.id,
                commentUrl: data.html_url
            };
        }
        catch (error) {
            this.logger.error('Failed to link finding to PR', error);
            throw error;
        }
    }
    /**
     * Build PR comment body from finding
     */
    buildPRCommentBody(finding) {
        const lines = [];
        lines.push('## :warning: Security Finding Detected');
        lines.push('');
        lines.push(`**${finding.title}**`);
        lines.push('');
        lines.push(`| Property | Value |`);
        lines.push(`|----------|-------|`);
        lines.push(`| Severity | ${this.getSeverityBadge(finding.severity)} |`);
        lines.push(`| Category | ${finding.category} |`);
        lines.push(`| File | \`${finding.file}:${finding.line}\` |`);
        if (finding.cwe) {
            lines.push(`| CWE | ${finding.cwe} |`);
        }
        lines.push(`| Confidence | ${Math.round(finding.confidence * 100)}% |`);
        lines.push('');
        lines.push('### Description');
        lines.push('');
        lines.push(finding.description);
        lines.push('');
        if (finding.remediation) {
            lines.push('### Recommended Fix');
            lines.push('');
            lines.push(finding.remediation);
            lines.push('');
        }
        lines.push('---');
        lines.push('*Detected by [Jokalala Code Analyzer](https://jokalala.com)*');
        return lines.join('\n');
    }
    /**
     * Get issue by number
     */
    async getIssue(repository, issueNumber) {
        try {
            const octokit = await this.ensureOctokit();
            const [owner, repo] = repository.split('/');
            const { data } = await octokit.issues.get({
                owner,
                repo,
                issue_number: issueNumber
            });
            return {
                id: data.id,
                number: data.number,
                title: data.title,
                body: data.body || '',
                state: data.state,
                html_url: data.html_url,
                created_at: data.created_at,
                updated_at: data.updated_at,
                closed_at: data.closed_at || undefined,
                labels: data.labels.map(l => ({
                    id: typeof l === 'object' ? l.id || 0 : 0,
                    name: typeof l === 'object' ? l.name || '' : l,
                    color: typeof l === 'object' ? l.color || '' : '',
                    description: typeof l === 'object' ? l.description || undefined : undefined
                })),
                assignees: data.assignees?.map(a => ({
                    id: a.id,
                    login: a.login,
                    avatar_url: a.avatar_url,
                    html_url: a.html_url
                })) || [],
                repository
            };
        }
        catch (error) {
            this.logger.error('Failed to get issue', error);
            return null;
        }
    }
    /**
     * Close an issue
     */
    async closeIssue(repository, issueNumber) {
        try {
            const octokit = await this.ensureOctokit();
            const [owner, repo] = repository.split('/');
            await octokit.issues.update({
                owner,
                repo,
                issue_number: issueNumber,
                state: 'closed'
            });
            this.logger.info(`Closed issue #${issueNumber}`);
            return true;
        }
        catch (error) {
            this.logger.error('Failed to close issue', error);
            return false;
        }
    }
    /**
     * Get repository from current workspace
     */
    async getRepositoryFromWorkspace() {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                return null;
            }
            const git = gitExtension.exports.getAPI(1);
            const repositories = git.repositories;
            if (repositories.length === 0) {
                return null;
            }
            const repo = repositories[0];
            const remotes = repo.state.remotes;
            for (const remote of remotes) {
                if (remote.name === 'origin') {
                    const url = remote.fetchUrl || remote.pushUrl;
                    if (url) {
                        // Parse GitHub URL
                        const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
                        if (match) {
                            return `${match[1]}/${match[2]}`;
                        }
                    }
                }
            }
            return null;
        }
        catch (error) {
            this.logger.error('Failed to get repository from workspace', error);
            return null;
        }
    }
    /**
     * Logout / Clear authentication
     */
    async logout() {
        await this.secrets.delete(GITHUB_TOKEN_KEY);
        this.octokit = null;
        this.logger.info('Logged out from GitHub');
    }
}
exports.GitHubService = GitHubService;
//# sourceMappingURL=github-service.js.map