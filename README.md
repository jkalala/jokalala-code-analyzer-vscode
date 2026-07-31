# Jokalala Code Analyzer — VS Code Extension

> Hybrid SAST for the IDE: zero-latency local Tier-1 packs, cloud Stage-1 when you need depth — built for professional development teams.

[![Version](https://img.shields.io/badge/version-2.4.2-blue.svg)](https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v2.4.2)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-007ACC.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/jokalala.jokalala-code-analysis)](https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis)
[![Security](https://img.shields.io/badge/security-hardened-brightgreen.svg)](#security)

---

## What it does

Jokalala scans your code for **50+ vulnerability types** as you work — SQL injection, XSS, command injection, hardcoded secrets, insecure dependencies, and more. Results appear as editor squiggles with one-click fixes.

**v2.4.2** ships the **Local Deterministic Tier-1 engine**: shared versioned rule packs + JS/TS AST visitors run on-save with **$0 infra**, then optionally merge with cloud Stage-1 (hybrid). Precision-first defaults keep noise low; HTTPS, secrets pre-screening, audit trail, and plugin sandboxing from 2.4.0 remain in place.

Architecture overview: [`docs/analyzer/LOCAL-TIER1.md`](docs/analyzer/LOCAL-TIER1.md)

---

## What's new in v2.4.2

- **Local Tier-1 engine** — bundled packs (`secrets`, `javascript`) + Babel AST (`eval`, `innerHTML`, `dangerouslySetInnerHTML`, `child_process`, …)
- **`jokalala.analysisTier`**: `local` | `hybrid` | `cloud` (default **hybrid**)
- **`jokalala.localPackProfile`**: `precision` (default, low noise) | `full` (+ Semgrep-lite patterns)
- **On-save / quick** → local only (no network)
- **Zero-noise** — CWE+line dedupe; suppress hits near DOMPurify / sanitize / `shell:false`; no noisy AST→regex fallback
- **esbuild bundle** — single `dist/extension.js`; VSIX ~368KB

---

## Quick Start

```text
1. Install the extension (Marketplace or VSIX from the v2.4.2 release)
2. Open Command Palette → "Jokalala: Sign In" (optional for higher limits)
3. Open any source file
4. Ctrl+Shift+P → "Jokalala: Analyze Current File"
   — or enable auto-analyze on save for instant local Tier-1
```

No API key in settings required when using Sign In — OAuth2 deep-link stores the token in SecretStorage.

---

## Features

### Hybrid analysis (Tier-1 local + cloud)

| Mode / tier | What it does | Network |
|---|---|---|
| **Quick** / `analysisTier: local` | Deterministic packs + JS/TS AST | None |
| **Hybrid** (default for deep/full) | Local findings, then cloud Stage-1 merge | Yes (fail-open to local) |
| **Cloud** | API only | Yes |

Enable **auto-analyze on save** with `"jokalala.autoAnalyze": true` — always uses **quick/local** ($0).

### Security Vulnerability Detection

- **50+ vulnerability types**: SQL injection, XSS, command injection, path traversal, SSRF, XXE, deserialization, and more
- **OWASP Top 10** coverage
- **CWE/CVE mapping** for findings
- **CISA KEV & EPSS scores** for exploitation likelihood

### Secrets Detection

High-confidence pack patterns plus pre-transmission screening:

- Private keys, cloud credentials, tokens, DB URLs with passwords
- **Secrets screened before cloud API calls** — consent dialog if matches found (v2.4.0+)

### Container & Infrastructure-as-Code Security

- **Dockerfile** / **Compose** / **Kubernetes** / **Terraform** / **CloudFormation** / **Helm**

### Software Composition Analysis (SCA)

- Multi-ecosystem CVE lookup, SBOM (CycloneDX / SPDX), license compliance

### Compliance Audit Trail *(since v2.4.0)*

Tamper-evident JSONL audit log with SHA-256 chain hashing — export via `Jokalala: Export Audit Log`.

### Language Support (19+ Languages)

**Web:** JavaScript, TypeScript, Vue, Svelte  
**Backend / systems:** Python, Java, Go, Rust, C/C++, C#, PHP, Ruby, Kotlin, Scala  
**Mobile / other:** Swift, Objective-C, Dart, Solidity  

Local AST Tier-1 is **JS/TS-first**; other languages use pack regex and/or cloud Stage-1.

### Sidebar Panels

Issues · CVEs · Recommendations · Refactoring · Dependencies (SCA) · Container & IaC · Plugins

---

## Installation

### From VS Code Marketplace

Search **"Jokalala Code Analyzer"** or:

```bash
ext install jokalala.jokalala-code-analysis
```

### From VSIX (v2.4.2)

```bash
# https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v2.4.2
code --install-extension jokalala-code-analysis-2.4.2.vsix
```

### From Source

```bash
git clone https://github.com/jkalala/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode
pnpm install   # or npm install
pnpm run compile
pnpm run package
code --install-extension jokalala-code-analysis-*.vsix
```

**Requirements:** Node.js ≥18, VS Code ≥1.85

---

## Authentication

**OAuth2 via deep-link** — no manual API key in `settings.json`.

1. `Ctrl+Shift+P` → **Jokalala: Sign In**
2. Complete login in the browser
3. Token stored in the OS keychain (SecretStorage)

Sign out with **Jokalala: Sign Out**.

---

## Configuration

### Recommended

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.analysisTier": "hybrid",
  "jokalala.localPackProfile": "precision",
  "jokalala.autoAnalyze": true,
  "jokalala.enableTelemetry": false
}
```

| Setting | Values | Default | Meaning |
|---|---|---|---|
| `analysisMode` | `quick` \| `deep` \| `full` | `full` | quick → force local Tier-1 |
| `analysisTier` | `local` \| `hybrid` \| `cloud` | `hybrid` | Where Stage-1 runs |
| `localPackProfile` | `precision` \| `full` | `precision` | Pack set (`full` adds Semgrep-lite patterns) |
| `autoAnalyze` | boolean | `false` | On-save → local quick only |
| `apiEndpoint` | URL | production HTTPS | Dev-assistant base |
| `enableTelemetry` | boolean | `false` | Opt-in |

### Full reference

```json
{
  "jokalala.apiEndpoint": "https://www.jokalala.com/api/agents/dev-assistant",
  "jokalala.analysisMode": "full",
  "jokalala.analysisTier": "hybrid",
  "jokalala.localPackProfile": "precision",
  "jokalala.autoAnalyze": false,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.maxFileSize": 200000,
  "jokalala.maxProjectFiles": 40,
  "jokalala.requestTimeout": 60000,
  "jokalala.enableTelemetry": false,
  "jokalala.plugins.enabled": false,
  "jokalala.plugins.trustedPublishers": ["jokalala", "official"],
  "jokalala.logLevel": "info"
}
```

> **Security note**: `jokalala.apiEndpoint` must use HTTPS for non-localhost URLs.

---

## Security

### What the extension protects

| Protection | Mechanism |
|---|---|
| Credentials | OS keychain (SecretStorage) — never in settings files |
| API calls | HTTPS enforced; HTTP blocked for non-localhost |
| Secrets in code | Pre-screened before transmission; consent required |
| Plugin code | Sandboxed with read-only state access and 5s timeout |
| Plugin files | SHA-256 integrity hash on first load; changes blocked |
| Auth callback | JWT format validated |
| Audit log | Tamper-evident chain hashing; sanitised details |
| Telemetry | Opt-in (disabled by default); user IDs hashed |

### What is sent to the API

**Local / quick / on-save:** nothing — Tier-1 runs in the extension host.

**Hybrid / cloud deep-full:** source of the file being analysed, language, analysis mode, session context. Paths and secrets are gated as above.

### Reporting vulnerabilities

Report to **security@jokalala.com** (responsible disclosure, 90-day window).

---

## Plugin System

Declarative JSON rule plugins under `.jokalala/plugins/`. Executable JS plugins are disabled by default for security. See [PUBLISHING.md](PUBLISHING.md) / plugin docs for the manifest format.

---

## Development

```bash
pnpm install
pnpm run compile    # typecheck + esbuild bundle
pnpm run package    # vsce package --no-dependencies
pnpm run check:vsix-size
```

Parity for shared packs:

```bash
cd packages/analyzer-rule-packs
pnpm run compile && pnpm run test:parity
```

### Project structure

```
src/
├── extension.ts
├── core/
│   ├── local-deterministic-engine.ts   # Tier-1 packs + AST
│   ├── offline-analyzer.ts             # thin wrapper
│   └── …
├── services/
│   ├── code-analysis-service.ts        # local / hybrid / cloud
│   ├── audit-service.ts
│   └── …
packages/analyzer-rule-packs/           # shared JSON packs + matcher
docs/analyzer/LOCAL-TIER1.md
```

---

## Changelog

### [2.4.2] — 2026-07-31

Local Tier-1 engine, precision packs, hybrid tiers, esbuild bundle. See [CHANGELOG.md](CHANGELOG.md).

### [2.4.0] — 2026-06-25

Security hardening: HTTPS enforcement, audit trail, plugin sandbox, secrets pre-screening.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Support

| Channel | Use for |
|---|---|
| [GitHub Issues](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues) | Bugs, feature requests |
| [Releases](https://github.com/jkalala/jokalala-code-analyzer-vscode/releases) | VSIX downloads |
| [jokalala.com](https://jokalala.com) | Account, billing, Pro |
| security@jokalala.com | Vulnerability reports |
| sales@jokalala.com | Enterprise |

---

*Built by the Jokalala team. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).*
