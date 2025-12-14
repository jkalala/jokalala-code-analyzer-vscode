# Jokalala GitHub Integration Plugin

Seamlessly integrate Jokalala Code Analyzer security findings with GitHub. Auto-create issues from vulnerabilities, link findings to pull requests, and track remediation progress.

## Features

### Auto-Create GitHub Issues

Automatically create well-formatted GitHub issues from security findings with:

- Severity badges and labels
- Detailed vulnerability descriptions
- Code snippets showing the vulnerable code
- Remediation recommendations
- CWE/CVE references and links
- Automatic label creation and assignment

### Link Findings to Pull Requests

Connect security findings to pull requests:

- Add detailed comments to PRs with finding information
- Create summary reports for multiple findings
- Track which findings have been addressed
- Group findings by PR for easy review

### Track Remediation Progress

Monitor the status of security issues:

- Sync issue status with GitHub
- View all created issues in the tree view
- Track open vs closed issues
- Link findings back to their GitHub issues

## Installation

### From Jokalala Plugin Marketplace

1. Open VS Code
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `Jokalala: Install Plugin`
4. Search for "GitHub Integration"
5. Click Install

### Manual Installation

1. Download the plugin from releases
2. Extract to `~/.jokalala/plugins/github-integration/`
3. Restart VS Code
4. The plugin will be automatically loaded

## Configuration

Configure the plugin in VS Code settings:

```json
{
  // Enable/disable the GitHub integration
  "jokalala.github.enabled": true,

  // Automatically create issues for high-severity findings
  "jokalala.github.autoCreateIssues": false,

  // Minimum severity for auto-creating issues
  "jokalala.github.autoCreateSeverityThreshold": "high",

  // Labels to add to created issues
  "jokalala.github.issueLabels": ["security", "jokalala"],

  // Default assignees for created issues
  "jokalala.github.issueAssignees": [],

  // Add comments to PRs when linking findings
  "jokalala.github.linkPRComments": true,

  // Include code snippets in issue descriptions
  "jokalala.github.includeCodeSnippet": true,

  // Include remediation suggestions in issues
  "jokalala.github.includeRemediation": true,

  // Default repository (owner/repo format)
  "jokalala.github.defaultRepository": "",

  // GitHub Enterprise URL (leave empty for github.com)
  "jokalala.github.enterpriseUrl": ""
}
```

## Usage

### Authentication

1. Open Command Palette
2. Run `Jokalala GitHub: Authenticate`
3. Follow the OAuth flow to authorize the plugin
4. Or manually enter a Personal Access Token

**Required Token Scopes:**
- `repo` - Full control of private repositories
- `write:org` - Read and write org membership (optional, for org repos)

### Creating Issues

#### From a Single Finding

1. Right-click on a finding in the Issues tree view
2. Select `Jokalala GitHub: Create Issue from Finding`
3. Select the target repository
4. The issue will be created with all details

#### From All Findings (Batch)

1. Open Command Palette
2. Run `Jokalala GitHub: Create Issues from All Findings`
3. Select the severity threshold
4. Select the target repository
5. Issues will be created for all qualifying findings

#### Auto-Create Issues

Enable automatic issue creation:

1. Set `jokalala.github.autoCreateIssues` to `true`
2. Set `jokalala.github.autoCreateSeverityThreshold` to desired level
3. Set `jokalala.github.defaultRepository` to your repo
4. Issues will be created automatically after each analysis

### Linking to Pull Requests

1. Right-click on a finding
2. Select `Jokalala GitHub: Link Finding to PR`
3. Select the target repository
4. Select the pull request
5. A comment will be added to the PR with finding details

### Viewing Created Issues

- Use the GitHub Integration tree view in the Jokalala sidebar
- Or run `Jokalala GitHub: View Created Issues` command
- Click on an issue to open it in GitHub

### Syncing Status

- Run `Jokalala GitHub: Sync Issue Status` to update issue states
- Or click the sync icon in the tree view

## Issue Format

Created issues include:

```markdown
## Security Finding Details

**Detected by:** Jokalala Code Analyzer
**Finding ID:** `abc123`
**Severity:** ![Critical](https://img.shields.io/badge/severity-critical-red)
**Category:** SQL Injection
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)
**Confidence:** 95%

## Location

**File:** `src/database/queries.ts`
**Line:** 42-45

## Description

User input is directly concatenated into SQL query without sanitization...

## Vulnerable Code

```typescript
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

## Remediation

Use parameterized queries or prepared statements...

## References

- https://owasp.org/www-community/attacks/SQL_Injection

---

*This issue was automatically created by Jokalala Code Analyzer*
```

## PR Comment Format

PR comments include:

- Summary table with severity counts
- Collapsible sections for each finding
- File locations and line numbers
- Remediation suggestions
- Links to CWE/CVE references

## Commands

| Command | Description |
|---------|-------------|
| `jokalala.github.authenticate` | Sign in to GitHub |
| `jokalala.github.createIssue` | Create issue from selected finding |
| `jokalala.github.createIssuesFromFindings` | Create issues from all findings |
| `jokalala.github.linkToPR` | Link finding to a pull request |
| `jokalala.github.viewIssues` | View all created issues |
| `jokalala.github.syncStatus` | Sync issue status with GitHub |
| `jokalala.github.refreshTree` | Refresh the tree view |
| `jokalala.github.logout` | Disconnect from GitHub |

## GitHub Enterprise

For GitHub Enterprise, set the `enterpriseUrl` configuration:

```json
{
  "jokalala.github.enterpriseUrl": "https://github.mycompany.com"
}
```

## Troubleshooting

### Authentication Failed

1. Ensure you have the correct token scopes
2. Check if your token has expired
3. Try logging out and re-authenticating

### Issues Not Created

1. Check you have write access to the repository
2. Verify the repository name is correct (owner/repo)
3. Check the VS Code Output panel for errors

### Rate Limiting

GitHub has API rate limits. If you hit them:

1. Wait a few minutes before retrying
2. Consider using a GitHub Enterprise instance
3. Reduce batch size for bulk operations

## API Reference

### Plugin Context

The plugin receives a context object with:

```typescript
interface PluginContext {
  extensionContext: vscode.ExtensionContext;
  secrets: vscode.SecretStorage;
  globalState: vscode.Memento;
  workspaceState: vscode.Memento;
  logger: PluginLogger;
  registerCommand: (command: string, callback: Function) => Disposable;
  onAnalysisComplete: (callback: (findings: SecurityFinding[]) => void) => Disposable;
  getFindings: () => SecurityFinding[];
  getConfiguration: <T>(key: string) => T;
}
```

### Security Finding Interface

```typescript
interface SecurityFinding {
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
  code?: string;
  remediation?: string;
  references?: string[];
  confidence: number;
  tags?: string[];
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- GitHub Issues: [Report a bug](https://github.com/jkalala/jokalala-github-integration/issues)
- Documentation: [Full documentation](https://jokalala.com/docs/plugins/github)
- Email: support@jokalala.com

---

*Made with love by the Jokalala Team*
