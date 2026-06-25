# Jokalala Code Analyzer — VS Code Extension

> AI-powered security vulnerability detection, compliance audit trail, and intelligent code analysis — built for professional development teams.

[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](https://github.com/jkalala/jokalala-code-analyzer-vscode/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-007ACC.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-hardened-brightgreen.svg)](#security)

---

## What it does

Jokalala scans your code for **50+ vulnerability types** as you work — SQL injection, XSS, command injection, hardcoded secrets, insecure dependencies, and more. Results appear as editor squiggles with one-click fixes, powered by DeepSeek and OpenAI.

**v2.4.0 is a security hardening release.** It introduces a tamper-evident audit trail, plugin sandboxing with timeout enforcement, pre-transmission secrets screening, and mandatory HTTPS enforcement for all API calls.

---

---

## Quick Start

```text
1. Install the extension (see Installation)
2. Open Command Palette → "Jokalala: Sign In"
3. Complete sign-in in your browser
4. Open any source file
5. Ctrl+Shift+P → "Jokalala: Analyze Current File"
```

No API key setup required — authentication is handled via OAuth2 deep-link.

---

## Features

### 🔍 Real-Time Code Analysis

| Mode | What it does | Speed |
|---|---|---|
| **Quick** | Offline regex patterns only — no network | Instant |
| **Deep** | AI analysis of the current function/class | ~3s |
| **Full** | Complete file analysis with CVE lookup | ~8s |

Enable **auto-analyze on save** with `"jokalala.autoAnalyze": true`.

### 🛡️ Security Vulnerability Detection

- **50+ vulnerability types**: SQL injection, XSS, command injection, path traversal, SSRF, XXE, deserialization, race conditions, and more
- **OWASP Top 10** full coverage
- **CWE/CVE mapping** for every finding
- **CISA KEV & EPSS scores** for exploitation likelihood
- **Compliance flags**: PCI-DSS, SOX, HIPAA, GDPR patterns

### 🔐 Secrets Detection

150+ patterns detect hardcoded credentials before they reach your repository or any API:
- Private keys (RSA, EC, OpenSSH)
- AWS, GCP, Azure credentials
- GitHub/GitLab tokens
- Database connection strings with passwords
- JWTs, Stripe, Twilio, SendGrid keys
- Generic bearer token assignments

**New in v2.4.0**: Secrets are screened *before transmission to the API*. If a secret is found in the code you're about to analyze, a consent dialog is shown — analysis is blocked until you explicitly confirm.

### 🐳 Container & Infrastructure-as-Code Security

- **Dockerfile**: Root user, exposed secrets, insecure base images (CIS Docker Benchmark)
- **Docker Compose**: Privileged containers, Docker socket mounts, host networking
- **Kubernetes**: Missing security contexts, dangerous capabilities (NSA/CISA Guide)
- **Terraform**: Open security groups, public resources, disabled encryption
- **CloudFormation**: AWS infrastructure template analysis
- **Helm Charts**: Kubernetes package scanning

### 📦 Software Composition Analysis (SCA)

- **Ecosystems**: npm, pip, Maven, Gradle, Go modules, Rust crates, Ruby gems, PHP Composer, .NET NuGet
- **Real-time CVE lookup** with CVSS scores via NVD
- **SBOM generation**: CycloneDX 1.5 and SPDX 2.3
- **License compliance**: GPL, AGPL, and other copyleft detection

### 📋 Compliance Audit Trail *(New in v2.4.0)*

Every security-relevant action is logged to `globalStorageUri/audit.jsonl`:

- Tamper-evident **SHA-256 chain hashing** (each entry hashes the previous)
- Covers auth events, analysis requests, plugin lifecycle, configuration changes
- User IDs **hashed** (SHA-256) — no PII stored
- **Export to JSONL** for Splunk, Elastic, Datadog via `Jokalala: Export Audit Log`

### 🌐 Language Support (19+ Languages)

**Web & Frontend:** JavaScript, TypeScript, Vue.js, Svelte  
**Backend & Systems:** Python, Java, Kotlin, Scala, Go, Rust, C, C++, C#, PHP, Ruby  
**Mobile:** Swift, Objective-C, Dart/Flutter  
**Blockchain:** Solidity (30+ smart contract patterns, SWC Registry)

### 📊 Sidebar Panels

| Panel | Contents |
|---|---|
| **Issues** | All findings grouped by severity with one-click navigation |
| **CVEs** | Known CVE IDs linked to your code and dependencies |
| **Recommendations** | AI-powered fix suggestions |
| **Refactoring** | Code improvement suggestions with diff preview |
| **Dependencies (SCA)** | Vulnerable package visualization |
| **Container & IaC** | Infrastructure security issues |
| **Plugins** | Custom rule management |

---

## Installation

### From VS Code Marketplace

Search **"Jokalala Code Analyzer"** in the Extensions panel or:

```bash
ext install jokalala.code-analysis
```

### From VSIX (latest release)

```bash
# Download the release from GitHub
# https://github.com/jkalala/jokalala-code-analyzer-vscode/releases

code --install-extension jokalala-code-analysis-2.4.0.vsix
```

### From Source

```bash
git clone https://github.com/jkalala/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode

# Install dependencies
pnpm install

# Compile
pnpm run compile

# Package
pnpm run package

# Install
code --install-extension jokalala-code-analysis-*.vsix
```

**Requirements:** Node.js ≥18, VS Code ≥1.85, pnpm ≥8

---

## Authentication

The extension uses **OAuth2 via deep-link** — no manual API key setup.

### Sign In

1. `Ctrl+Shift+P` → **"Jokalala: Sign In"**
2. Your browser opens `https://jokalala.com/vscode-auth`
3. Log in or create an account
4. The web app redirects to `vscode://jokalala.code-analysis/auth?token=<jwt>`
5. VS Code receives the token and stores it in the **OS keychain** (SecretStorage)

The token is never stored in `settings.json` or any plaintext file.

### Sign Out

`Ctrl+Shift+P` → **"Jokalala: Sign Out"** — clears all credentials from SecretStorage.

### Tiers

| Tier | Daily analyses | File size limit | History |
|---|---|---|---|
| Anonymous (no sign-in) | 2 | 50 KB | None |
| Free (signed in) | 5 | 100 KB | Last 5 |
| Pro | Unlimited | 5 MB | Unlimited |

---

## Configuration

All settings live under the `jokalala.*` namespace.

### Minimal setup (recommended)

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true
}
```

### Full configuration reference

```json
{
  // Core
  "jokalala.apiEndpoint": "https://jokalala.com/api/agents/dev-assistant",
  "jokalala.analysisMode": "full",          // "quick" | "deep" | "full"
  "jokalala.autoAnalyze": false,            // Run on every file save
  "jokalala.showInlineWarnings": true,

  // Limits
  "jokalala.maxFileSize": 50000,            // Characters (not bytes)
  "jokalala.maxProjectFiles": 40,
  "jokalala.requestTimeout": 60000,         // Milliseconds

  // Privacy
  "jokalala.enableTelemetry": false,        // Opt-in — disabled by default

  // Performance
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 1800000,             // 30 minutes
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 3,

  // Plugins
  "jokalala.plugins.enabled": true,
  "jokalala.plugins.paths": []              // Additional plugin directories
}
```

> **Security note**: `jokalala.apiEndpoint` must use HTTPS for non-localhost URLs. HTTP endpoints are blocked to prevent code and analysis results from being transmitted in plaintext.

---

## Security

### What the extension protects

| Protection | Mechanism |
|---|---|
| Credentials | OS keychain (VSCode SecretStorage) — never in settings files |
| API calls | HTTPS enforced; HTTP blocked for non-localhost |
| Secrets in code | Pre-screened before transmission; consent required |
| Plugin code | Sandboxed with read-only state access and 5s timeout |
| Plugin files | SHA-256 integrity hash on first load; changes blocked |
| Auth callback | JWT format validated; userId allowlist regex checked |
| Audit log | Tamper-evident chain hashing; sanitised details |
| Error messages | File paths, tokens, and emails redacted before logging |
| Telemetry | Opt-in (disabled by default); user IDs hashed |

### What is sent to the API

When you trigger an analysis:
- The **source code** of the file being analysed
- The **language** identifier
- A **session ID** (no user identifiers unless signed in)
- The **analysis mode** (`quick`/`deep`/`full`)

What is **never** sent:
- Your file system paths
- Git history or repository names
- Other files in your project
- Your API key or auth token in the request body

### Reporting vulnerabilities

Please report security issues to **security@jokalala.com** rather than GitHub issues. We follow responsible disclosure with a 90-day remediation window.

---

## Plugin System

The plugin system lets teams add custom security rules without modifying the extension.

### Creating a plugin

1. Create a directory in your workspace: `.jokalala/plugins/my-rules/`
2. Add a manifest: `jokalala-plugin.json`

```json
{
  "id": "my-company-rules",
  "name": "My Company Rules",
  "displayName": "Company Security Standards",
  "description": "Internal security rules",
  "version": "1.0.0",
  "type": "pattern",
  "contributes": {
    "rules": [
      {
        "id": "no-debug-logging",
        "name": "No debug logging in production",
        "description": "console.log calls should not reach production",
        "severity": "warning",
        "category": "quality",
        "patterns": [
          { "type": "regex", "pattern": "console\\.log\\(" }
        ]
      }
    ]
  }
}
```

### Plugin security model

- **Integrity verification**: SHA-256 hash of all plugin files stored on first load. If any file changes, the plugin is blocked until the developer reviews and re-approves.
- **Read-only state**: Plugins cannot write to VS Code's global or workspace state.
- **Timeout enforcement**: Plugin `activate()` is limited to **5 seconds**. Plugins that hang are terminated automatically.
- **Path safety**: `manifest.main` is verified to stay inside the plugin directory — path traversal (e.g. `"../../evil"`) is blocked.

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8
- VS Code ≥ 1.85

### Setup

```bash
git clone https://github.com/jkalala/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode
pnpm install
pnpm run compile
```

### Run in development

1. Open the repository in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension loads in the new VS Code window

### Run tests

```bash
pnpm run test
```

Tests use Mocha with the `@vscode/test-electron` runner. Security test suites:

| Suite | Tests | Covers |
|---|---|---|
| `url-validator.test.ts` | 25 | HTTPS enforcement, safe URL joining, path traversal |
| `typed-errors.test.ts` | 30 | Error hierarchy, normalisation, type guards |
| `secrets-prescreener.test.ts` | 24 | 12 secret patterns, redaction verification |
| `audit-service.test.ts` | 26 | Chain hash integrity, detail sanitisation, userId hashing |
| `plugin-sandbox.test.ts` | 16 | Timeout enforcement, restricted context, log capture |

### Package for release

```bash
pnpm run package
# Produces: jokalala-code-analysis-<version>.vsix
```

### Project structure

```
src/
├── extension.ts              # Entry point
├── commands/                 # VS Code command handlers
├── core/                     # Offline analysis engines
│   ├── offline-analyzer.ts   # 50+ regex vulnerability patterns
│   ├── secrets-detector.ts   # 150+ secret patterns
│   └── incremental-analyzer.ts
├── services/                 # Business logic
│   ├── auth-service.ts       # OAuth2 + SecretStorage
│   ├── code-analysis-service.ts
│   ├── audit-service.ts      # ✦ Compliance audit trail
│   ├── plugin-sandbox.ts     # ✦ Sandboxed plugin execution
│   ├── plugin-manager.ts     # Plugin lifecycle + integrity
│   ├── cve-service.ts
│   ├── sca-service.ts
│   └── container-iac-service.ts
├── providers/                # Tree view providers
├── utils/
│   ├── url-validator.ts      # ✦ HTTPS enforcement
│   ├── typed-errors.ts       # ✦ Error hierarchy
│   ├── secrets-prescreener.ts # ✦ Pre-transmission secrets gate
│   └── circuit-breaker.ts
└── test/                     # Test suites

✦ = new in v2.4.0
```

---

## Changelog

### [2.4.0] — 2026-06-25 (Security Hardening Release)

#### Security fixes
- HTTPS enforced for all outbound API calls; HTTP blocked for non-localhost
- Plugin path-traversal prevention (manifest.main bounds check)
- Plugin integrity verification via SHA-256 baseline hashing
- JWT format validation on OAuth2 deep-link callback
- Feedback URL validated before data transmission
- URL concatenation replaced with `safeJoinUrl()` in all commands
- Absolute file paths stripped from feedback payloads

#### New features
- **Compliance audit trail** (`AuditService`): tamper-evident JSONL with chain hashing
- **Plugin sandbox**: restricted PluginContext, 5s timeout, read-only state
- **Secrets pre-screening**: consent dialog before transmitting code with secrets
- **Typed error hierarchy**: `AppError` subclasses replace `catch (error: any)`
- `Jokalala: Export Audit Log` command

#### Changes
- Default `apiEndpoint`: `http://localhost:3000` → `https://jokalala.com/api/agents/dev-assistant`
- `enableTelemetry` default: `true` → `false` (opt-in)
- Removed `[DEBUG]` log statements that exposed internal URLs in production

#### Testing
- 121 new test cases across 5 new security test suites

See [CHANGELOG.md](CHANGELOG.md) for full history.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Support

| Channel | Use for |
|---|---|
| [GitHub Issues](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues) | Bugs, feature requests |
| [jokalala.com](https://jokalala.com) | Account, billing, Pro features |
| security@jokalala.com | Security vulnerability reports |
| sales@jokalala.com | Team licenses, enterprise deployment |

---

*Built by the Jokalala team. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).*
