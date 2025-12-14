# Jokalala Code Analyzer VS Code Extension - Development Guide

## Overview

The Jokalala Code Analyzer is an AI-powered security vulnerability detection extension for Visual Studio Code. It provides static analysis, LLM-powered deep analysis, CVE scanning, refactoring suggestions, and Container/IaC security scanning across 19 programming languages.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Development Setup](#development-setup)
4. [Core Components](#core-components)
5. [Security Implementation](#security-implementation)
6. [API Integration](#api-integration)
7. [Testing](#testing)
8. [Build & Release](#build--release)
9. [Contributing Guidelines](#contributing-guidelines)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Commands   │  │   Views     │  │    Diagnostics          │  │
│  │  Handler    │  │  Provider   │  │    Collection           │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│  ┌──────┴────────────────┴──────────────────────┴─────────────┐ │
│  │                     Extension Core                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │  Analysis   │  │   Cache     │  │    Rate Limiter     │ │ │
│  │  │  Service    │  │   Manager   │  │    (Token Bucket)   │ │ │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────────┘ │ │
│  └─────────┼──────────────────────────────────────────────────┘ │
│            │                                                     │
│  ┌─────────┴──────────────────────────────────────────────────┐ │
│  │                   Security Layer                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │  Secret     │  │  Encryption │  │    Input            │ │ │
│  │  │  Storage    │  │  (AES-256)  │  │    Sanitization     │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API Service                           │
│         (Jokalala Analysis API / Self-hosted)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
jokalala-code-analyzer-vscode/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── commands/                 # Command handlers
│   │   ├── analyze-file.ts
│   │   ├── analyze-project.ts
│   │   ├── analyze-selection.ts
│   │   └── set-api-key.ts
│   ├── providers/                # VS Code providers
│   │   ├── issues-tree-provider.ts
│   │   ├── cve-tree-provider.ts
│   │   ├── refactoring-tree-provider.ts
│   │   ├── sca-tree-provider.ts
│   │   └── container-iac-tree-provider.ts
│   ├── services/                 # Business logic
│   │   ├── analysis-service.ts
│   │   ├── api-client.ts
│   │   ├── cache-service.ts
│   │   ├── telemetry-service-v2.ts
│   │   └── diagnostics-service.ts
│   ├── utils/                    # Utilities
│   │   ├── rate-limiter.ts
│   │   ├── encryption-service.ts
│   │   ├── input-sanitizer.ts
│   │   └── secure-storage.ts
│   └── types/                    # TypeScript definitions
│       ├── analysis.ts
│       ├── vulnerability.ts
│       └── config.ts
├── images/                       # Extension icons
├── .github/
│   └── workflows/
│       ├── ci.yml                # CI/CD pipeline
│       └── release.yml           # Release automation
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── README.md                     # User documentation
```

---

## Development Setup

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **VS Code** 1.85.0 or higher
- **Git** for version control

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/jkalala/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Open in VS Code
code .
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode - auto-compile on changes |
| `npm run lint` | Run TypeScript type checking |
| `npm run test` | Run lint checks |
| `npm run package` | Create .vsix package |
| `npm run publish` | Publish to VS Code Marketplace |

### Running in Debug Mode

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. The extension will be active in the new VS Code window
4. Set breakpoints in TypeScript files for debugging

---

## Core Components

### 1. Extension Entry Point

**File:** `src/extension.ts`

```typescript
import * as vscode from 'vscode';
import { AnalysisService } from './services/analysis-service';
import { IssuesTreeProvider } from './providers/issues-tree-provider';
import { SecureStorage } from './utils/secure-storage';

export async function activate(context: vscode.ExtensionContext) {
    // Initialize secure storage for API keys
    const secureStorage = new SecureStorage(context.secrets);

    // Initialize analysis service
    const analysisService = new AnalysisService(secureStorage);

    // Register tree view providers
    const issuesProvider = new IssuesTreeProvider();
    vscode.window.registerTreeDataProvider('jokalala-issues', issuesProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'jokalala-code-analysis.analyzeFile',
            () => analysisService.analyzeCurrentFile()
        )
    );

    // Auto-analyze on save (if enabled)
    if (vscode.workspace.getConfiguration('jokalala').get('autoAnalyze')) {
        vscode.workspace.onDidSaveTextDocument(
            (doc) => analysisService.analyzeDocument(doc)
        );
    }
}

export function deactivate() {
    // Cleanup resources
}
```

### 2. Analysis Service

**File:** `src/services/analysis-service.ts`

```typescript
import * as vscode from 'vscode';
import { ApiClient } from './api-client';
import { RateLimiter } from '../utils/rate-limiter';
import { InputSanitizer } from '../utils/input-sanitizer';

export interface AnalysisResult {
    vulnerabilities: Vulnerability[];
    metrics: CodeMetrics;
    recommendations: string[];
}

export interface Vulnerability {
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    line: number;
    column: number;
    message: string;
    cwe?: string;
    fix?: string;
}

export class AnalysisService {
    private apiClient: ApiClient;
    private rateLimiter: RateLimiter;
    private sanitizer: InputSanitizer;

    constructor(secureStorage: SecureStorage) {
        this.apiClient = new ApiClient(secureStorage);
        this.rateLimiter = new RateLimiter({
            tokensPerInterval: 10,
            interval: 60000 // 1 minute
        });
        this.sanitizer = new InputSanitizer();
    }

    async analyzeCurrentFile(): Promise<AnalysisResult | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active file to analyze');
            return null;
        }

        // Check rate limit
        if (!this.rateLimiter.tryConsume()) {
            vscode.window.showWarningMessage(
                'Rate limit exceeded. Please wait before analyzing again.'
            );
            return null;
        }

        const document = editor.document;
        const config = vscode.workspace.getConfiguration('jokalala');

        // Validate file size
        const maxSize = config.get<number>('maxFileSize', 200000);
        if (document.getText().length > maxSize) {
            vscode.window.showWarningMessage(
                `File exceeds maximum size of ${maxSize} characters`
            );
            return null;
        }

        // Sanitize and prepare request
        const sanitizedCode = this.sanitizer.sanitize(document.getText());

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing code...',
            cancellable: true
        }, async (progress, token) => {
            try {
                const result = await this.apiClient.analyze({
                    code: sanitizedCode,
                    language: document.languageId,
                    filename: document.fileName,
                    mode: config.get('analysisMode', 'full')
                }, token);

                return result;
            } catch (error) {
                this.handleError(error);
                return null;
            }
        });
    }

    private handleError(error: unknown): void {
        if (error instanceof Error) {
            if (error.message.includes('timeout')) {
                vscode.window.showErrorMessage(
                    'Analysis timed out. Try a smaller file or quick mode.'
                );
            } else if (error.message.includes('401')) {
                vscode.window.showErrorMessage(
                    'Invalid API key. Use "Jokalala: Set API Key" to configure.'
                );
            } else {
                vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            }
        }
    }
}
```

### 3. Tree View Provider

**File:** `src/providers/issues-tree-provider.ts`

```typescript
import * as vscode from 'vscode';
import { Vulnerability } from '../services/analysis-service';

export class IssuesTreeProvider implements vscode.TreeDataProvider<IssueItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<IssueItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private issues: Vulnerability[] = [];
    private viewMode: 'severity' | 'file' | 'type' = 'severity';

    updateIssues(issues: Vulnerability[]): void {
        this.issues = issues;
        this._onDidChangeTreeData.fire(undefined);
    }

    toggleViewMode(): void {
        const modes: Array<'severity' | 'file' | 'type'> = ['severity', 'file', 'type'];
        const currentIndex = modes.indexOf(this.viewMode);
        this.viewMode = modes[(currentIndex + 1) % modes.length];
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: IssueItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: IssueItem): IssueItem[] {
        if (!element) {
            return this.getRootItems();
        }
        return element.children || [];
    }

    private getRootItems(): IssueItem[] {
        switch (this.viewMode) {
            case 'severity':
                return this.groupBySeverity();
            case 'file':
                return this.groupByFile();
            case 'type':
                return this.groupByType();
        }
    }

    private groupBySeverity(): IssueItem[] {
        const severities = ['critical', 'high', 'medium', 'low', 'info'];
        return severities.map(severity => {
            const filtered = this.issues.filter(i => i.severity === severity);
            return new IssueItem(
                `${severity.toUpperCase()} (${filtered.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                filtered.map(i => this.createIssueItem(i))
            );
        }).filter(item => item.children && item.children.length > 0);
    }

    private createIssueItem(issue: Vulnerability): IssueItem {
        const item = new IssueItem(
            `Line ${issue.line}: ${issue.message}`,
            vscode.TreeItemCollapsibleState.None
        );
        item.command = {
            command: 'jokalala-code-analysis.goToIssue',
            title: 'Go to Issue',
            arguments: [issue]
        };
        item.iconPath = this.getSeverityIcon(issue.severity);
        item.tooltip = `${issue.type}\n${issue.cwe || ''}\n\n${issue.message}`;
        return item;
    }

    private getSeverityIcon(severity: string): vscode.ThemeIcon {
        const iconMap: Record<string, string> = {
            critical: 'error',
            high: 'warning',
            medium: 'info',
            low: 'debug',
            info: 'lightbulb'
        };
        return new vscode.ThemeIcon(iconMap[severity] || 'circle');
    }
}

class IssueItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public children?: IssueItem[]
    ) {
        super(label, collapsibleState);
    }
}
```

---

## Security Implementation

### 1. Secure API Key Storage

**File:** `src/utils/secure-storage.ts`

```typescript
import * as vscode from 'vscode';

const API_KEY_KEY = 'jokalala.apiKey';

export class SecureStorage {
    constructor(private secrets: vscode.SecretStorage) {}

    async getApiKey(): Promise<string | undefined> {
        return this.secrets.get(API_KEY_KEY);
    }

    async setApiKey(key: string): Promise<void> {
        // Validate key format before storing
        if (!this.isValidApiKeyFormat(key)) {
            throw new Error('Invalid API key format');
        }
        await this.secrets.store(API_KEY_KEY, key);
    }

    async deleteApiKey(): Promise<void> {
        await this.secrets.delete(API_KEY_KEY);
    }

    private isValidApiKeyFormat(key: string): boolean {
        // API keys should be alphanumeric with allowed special chars
        return /^[a-zA-Z0-9_-]{20,128}$/.test(key);
    }
}
```

### 2. Rate Limiter (Token Bucket)

**File:** `src/utils/rate-limiter.ts`

```typescript
export interface RateLimiterConfig {
    tokensPerInterval: number;
    interval: number; // milliseconds
    maxTokens?: number;
}

export class RateLimiter {
    private tokens: number;
    private maxTokens: number;
    private tokensPerInterval: number;
    private interval: number;
    private lastRefill: number;

    constructor(config: RateLimiterConfig) {
        this.tokensPerInterval = config.tokensPerInterval;
        this.interval = config.interval;
        this.maxTokens = config.maxTokens || config.tokensPerInterval;
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }

    tryConsume(tokens: number = 1): boolean {
        this.refill();

        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        return false;
    }

    getAvailableTokens(): number {
        this.refill();
        return this.tokens;
    }

    getTimeUntilRefill(): number {
        const elapsed = Date.now() - this.lastRefill;
        return Math.max(0, this.interval - elapsed);
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = Math.floor(
            (elapsed / this.interval) * this.tokensPerInterval
        );

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }
}
```

### 3. Input Sanitization

**File:** `src/utils/input-sanitizer.ts`

```typescript
export interface SanitizationOptions {
    maxLength?: number;
    stripNullBytes?: boolean;
    normalizeLineEndings?: boolean;
}

export class InputSanitizer {
    private readonly defaultOptions: SanitizationOptions = {
        maxLength: 200000,
        stripNullBytes: true,
        normalizeLineEndings: true
    };

    sanitize(input: string, options?: SanitizationOptions): string {
        const opts = { ...this.defaultOptions, ...options };
        let result = input;

        // Strip null bytes (prevent null byte injection)
        if (opts.stripNullBytes) {
            result = result.replace(/\0/g, '');
        }

        // Normalize line endings
        if (opts.normalizeLineEndings) {
            result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        }

        // Enforce maximum length
        if (opts.maxLength && result.length > opts.maxLength) {
            result = result.substring(0, opts.maxLength);
        }

        return result;
    }

    sanitizeFilename(filename: string): string {
        // Remove path traversal attempts
        return filename
            .replace(/\.\./g, '')
            .replace(/[<>:"|?*]/g, '_')
            .substring(0, 255);
    }

    sanitizeEndpoint(url: string): string | null {
        try {
            const parsed = new URL(url);

            // Only allow HTTPS in production
            if (parsed.protocol !== 'https:' &&
                !parsed.hostname.includes('localhost')) {
                return null;
            }

            return parsed.toString();
        } catch {
            return null;
        }
    }
}
```

### 4. Encryption Service

**File:** `src/utils/encryption-service.ts`

```typescript
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export class EncryptionService {
    private key: Buffer;

    constructor(password: string, salt?: Buffer) {
        const usedSalt = salt || crypto.randomBytes(SALT_LENGTH);
        this.key = crypto.pbkdf2Sync(
            password,
            usedSalt,
            100000,
            32,
            'sha256'
        );
    }

    encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Format: iv:authTag:ciphertext (all hex encoded)
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }

    decrypt(ciphertext: string): string {
        const parts = ciphertext.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid ciphertext format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
```

---

## API Integration

### API Client

**File:** `src/services/api-client.ts`

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';
import { SecureStorage } from '../utils/secure-storage';

export interface AnalysisRequest {
    code: string;
    language: string;
    filename: string;
    mode: 'quick' | 'deep' | 'full';
}

export class ApiClient {
    private client: AxiosInstance;
    private secureStorage: SecureStorage;

    constructor(secureStorage: SecureStorage) {
        this.secureStorage = secureStorage;

        const config = vscode.workspace.getConfiguration('jokalala');
        const timeout = config.get<number>('requestTimeout', 60000);

        this.client = axios.create({
            timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Jokalala-VSCode-Extension/2.1.1'
            }
        });

        // Add request interceptor for auth
        this.client.interceptors.request.use(async (config) => {
            const apiKey = await this.secureStorage.getApiKey();
            if (apiKey) {
                config.headers.Authorization = `Bearer ${apiKey}`;
            }
            return config;
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => this.handleApiError(error)
        );
    }

    async analyze(
        request: AnalysisRequest,
        cancellationToken?: vscode.CancellationToken
    ): Promise<AnalysisResult> {
        const config = vscode.workspace.getConfiguration('jokalala');
        const endpoint = config.get<string>(
            'apiEndpoint',
            'https://api.jokalala.com/v1/analyze'
        );

        const source = axios.CancelToken.source();

        if (cancellationToken) {
            cancellationToken.onCancellationRequested(() => {
                source.cancel('Analysis cancelled by user');
            });
        }

        const response = await this.client.post(endpoint, request, {
            cancelToken: source.token
        });

        return response.data;
    }

    private handleApiError(error: AxiosError): never {
        if (axios.isCancel(error)) {
            throw new Error('Request cancelled');
        }

        if (error.response) {
            const status = error.response.status;
            switch (status) {
                case 401:
                    throw new Error('401: Invalid or missing API key');
                case 403:
                    throw new Error('403: Access forbidden');
                case 429:
                    throw new Error('429: Rate limit exceeded');
                case 500:
                    throw new Error('500: Server error');
                default:
                    throw new Error(`${status}: ${error.message}`);
            }
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('timeout: Request timed out');
        }

        throw error;
    }
}
```

---

## Testing

### Unit Test Example

**File:** `src/test/rate-limiter.test.ts`

```typescript
import * as assert from 'assert';
import { RateLimiter } from '../utils/rate-limiter';

suite('RateLimiter Tests', () => {
    test('should allow requests within limit', () => {
        const limiter = new RateLimiter({
            tokensPerInterval: 10,
            interval: 60000
        });

        for (let i = 0; i < 10; i++) {
            assert.strictEqual(limiter.tryConsume(), true);
        }
    });

    test('should block requests exceeding limit', () => {
        const limiter = new RateLimiter({
            tokensPerInterval: 5,
            interval: 60000
        });

        for (let i = 0; i < 5; i++) {
            limiter.tryConsume();
        }

        assert.strictEqual(limiter.tryConsume(), false);
    });

    test('should refill tokens over time', async () => {
        const limiter = new RateLimiter({
            tokensPerInterval: 10,
            interval: 100 // 100ms for testing
        });

        // Consume all tokens
        for (let i = 0; i < 10; i++) {
            limiter.tryConsume();
        }

        assert.strictEqual(limiter.tryConsume(), false);

        // Wait for refill
        await new Promise(resolve => setTimeout(resolve, 150));

        assert.strictEqual(limiter.tryConsume(), true);
    });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run with VS Code test runner
npm run pretest && node ./out/test/runTest.js
```

---

## Build & Release

### CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

permissions:
  contents: read
  security-events: write
  actions: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compile
        run: npm run compile

      - name: Lint
        run: npm run lint

      - name: Package extension
        run: npx vsce package

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: extension-vsix
          path: '*.vsix'

  publish:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Publish to VS Code Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

### Release Process

1. **Version Bump**
   ```bash
   # Update version in package.json
   npm version patch  # or minor/major
   ```

2. **Create Release Tag**
   ```bash
   git tag v2.1.2
   git push origin v2.1.2
   ```

3. **GitHub Release**
   ```bash
   gh release create v2.1.2 --title "v2.1.2" --notes "Release notes..."
   ```

4. **Automated Publish**
   - CI/CD automatically publishes to VS Code Marketplace on tag push

---

## Contributing Guidelines

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Use meaningful variable/function names
- Add JSDoc comments for public APIs
- Maximum line length: 100 characters

### Git Workflow

1. Create feature branch from `main`
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make changes with atomic commits
   ```bash
   git commit -m "feat: add new vulnerability scanner"
   ```

3. Push and create Pull Request
   ```bash
   git push origin feature/your-feature
   gh pr create
   ```

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

### Security Guidelines

- Never log sensitive data (API keys, tokens)
- Use SecretStorage for credentials
- Validate all user inputs
- Sanitize code before sending to API
- Use HTTPS for all external requests
- Follow OWASP secure coding guidelines

---

## Resources

- **VS Code Extension API**: https://code.visualstudio.com/api
- **VSCE Publishing**: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- **Extension Guidelines**: https://code.visualstudio.com/api/references/extension-guidelines
- **Security Best Practices**: https://code.visualstudio.com/api/references/extension-manifest#security

---

## Support

- **Issues**: https://github.com/jkalala/jokalala-code-analyzer-vscode/issues
- **Discussions**: https://github.com/jkalala/jokalala-code-analyzer-vscode/discussions
- **Email**: support@jokalala.com

---

*Version: 2.1.1 | Last Updated: December 2025*
