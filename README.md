# Jokalala Code Analysis - VS Code Extension

A powerful VS Code extension that provides real-time code analysis, security vulnerability detection, and intelligent recommendations powered by AI. Now with **Container/IaC security scanning**, **Software Composition Analysis (SCA)**, and support for **19 programming languages**.

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/jkalala/jokalala-code-analyzer-vscode)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-007ACC.svg)](https://code.visualstudio.com/)

## 🚀 Quick Start

**New to Jokalala?** Check out our [Getting Started Guide](GETTING_STARTED.md) for step-by-step setup instructions!

1. **Install** the extension from VS Code Marketplace
2. **Get your API key** from [jokalala.com/api-keys](https://jokalala.com/api-keys)
3. **Configure** via Command Palette: `Jokalala: Show Settings`
4. **Analyze** your code with `Ctrl+Alt+A` / `Cmd+Alt+A`

## Features

### 🔍 Real-time Code Analysis

- **File Analysis**: Analyze individual files for security vulnerabilities, code quality issues, and best practice violations
- **Selection Analysis**: Analyze specific code selections for targeted feedback
- **Project Analysis**: Comprehensive analysis of entire projects with prioritized issue reporting

### 🛡️ Security Vulnerability Detection

- **50+ Vulnerability Types**: SQL injection, XSS, command injection, path traversal, and more
- **OWASP Top 10 Coverage**: Comprehensive detection of all OWASP Top 10 vulnerabilities
- **CWE/CVE Mapping**: Industry-standard vulnerability classification
- **CISA KEV & EPSS**: Prioritization using exploit data and probability scores

### 🐳 Container & Infrastructure-as-Code Security (NEW)

Scan your infrastructure configurations for security misconfigurations:

- **Dockerfile Analysis**: Detect insecure base images, root user usage, exposed secrets, missing health checks (CIS Docker Benchmark)
- **Docker Compose**: Identify privileged containers, host network sharing, Docker socket mounts
- **Kubernetes Manifests**: Find privileged pods, missing security contexts, dangerous capabilities (CIS Kubernetes Benchmark, NSA/CISA Guide)
- **Terraform**: Detect open security groups, public resources, disabled encryption, hardcoded secrets
- **CloudFormation**: AWS infrastructure template security analysis
- **Helm Charts**: Kubernetes package security scanning

### 📦 Software Composition Analysis (SCA) (NEW)

Secure your dependencies across multiple ecosystems:

- **Multi-ecosystem Support**: npm, pip, Maven, Gradle, Go, Rust, Ruby, PHP, .NET
- **NVD Integration**: Real-time CVE lookups with CVSS scores
- **SBOM Generation**: CycloneDX 1.5 and SPDX 2.3 format support
- **License Compliance**: Detect high-risk (GPL, AGPL) and medium-risk licenses

### 🌐 Language Support (19 Languages)

**Web & Frontend:**
- JavaScript, TypeScript, Vue.js SFC, Svelte/SvelteKit

**Backend & Systems:**
- Python, Java, Kotlin, Scala, Go, Rust, C, C++, C#, PHP, Ruby

**Mobile:**
- Swift, Objective-C, Dart/Flutter

**Blockchain:**
- Solidity (30+ smart contract patterns, SWC Registry compliant)

### 📊 Interactive Tree Views

- **Issues View**: Browse issues organized by severity with one-click navigation
- **CVE Database**: Search and scan for known vulnerabilities
- **Recommendations**: AI-powered improvement suggestions
- **Code Metrics**: Quality and security risk scores
- **Refactoring**: AI-powered code improvements with diff preview
- **Dependencies (SCA)**: Vulnerable dependency visualization
- **Container & IaC Security**: Infrastructure security issues by type or severity

### ⚡ Performance Features

- **Intelligent Caching**: Reduce API calls with configurable caching (TTL and size limits)
- **Request Queue**: Priority-based request management for optimal performance
- **Circuit Breaker**: Automatic failure detection and recovery
- **Retry Logic**: Exponential backoff for transient failures

### 🔐 Security Features

- **Secure API Key Storage**: Uses VS Code's SecretStorage API for secure credential management
- **Input Sanitization**: XSS prevention with HTML escaping
- **PII Anonymization**: File paths, emails, and tokens redacted from telemetry
- **HTTPS Validation**: Warns when using insecure HTTP endpoints

## Installation

### From VS Code Marketplace

Search for "Jokalala Code Analyzer" in VS Code Extensions.

### From VSIX

1. Download the latest `.vsix` file from releases
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
4. Click the `...` menu → "Install from VSIX..."
5. Select the downloaded `.vsix` file

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd packages/vscode-code-analysis

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package the extension
npm run package

# Install the generated .vsix file
code --install-extension jokalala-code-analysis-*.vsix
```

## Configuration

### 🔑 Getting Your API Key

**For Individual Developers:**

1. Sign up at [jokalala.com/signup](https://jokalala.com/signup)
2. Navigate to **Dashboard** → **API Keys**
3. Click **Generate New API Key**
4. Copy your key

**For Teams:**

Contact <sales@jokalala.com> for team licenses and custom deployments.

**For Self-Hosted:**

Deploy your own backend and generate keys from your admin dashboard.

### ⚙️ Configuration Methods

#### Method 1: Quick Setup (Recommended)

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: **Jokalala: Show Settings**
3. Enter your API endpoint: `https://api.jokalala.com/analyze`
4. Enter your API key (will be stored securely)

#### Method 2: VS Code Settings UI

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "jokalala"
3. Configure:
   - **API Endpoint**: `https://api.jokalala.com/analyze`
   - **API Key**: Your personal API key
   - **Analysis Mode**: `full`, `deep`, or `quick`
   - **Auto Analyze**: Enable/disable auto-analysis on save

#### Method 3: settings.json (Advanced)

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.maxFileSize": 200000,
  "jokalala.maxProjectFiles": 40,
  "jokalala.requestTimeout": 60000,
  "jokalala.enableTelemetry": true
}
```

**🔒 Security Note**: Use the `Jokalala: Set API Key` command for secure credential storage via VS Code's encrypted SecretStorage.

## Usage

### Commands

Access commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

**Code Analysis:**
- `Jokalala: Analyze Current File` - Analyze the currently open file
- `Jokalala: Analyze Selection` - Analyze the selected code
- `Jokalala: Analyze Entire Project` - Analyze the entire workspace
- `Jokalala: Clear Analysis Cache` - Clear the analysis cache

**CVE Database:**
- `Jokalala: Search CVE/CWE Database` - Search known vulnerabilities
- `Jokalala: Scan Current File for CVEs` - Find CVEs in current file
- `Jokalala: Clear CVE Results` - Clear CVE scan results

**Refactoring:**
- `Jokalala: Analyze for Refactoring` - Get AI refactoring suggestions
- `Jokalala: Quick Fix Issue` - Apply quick fixes
- `Jokalala: Apply All Safe Fixes` - Batch apply fixes
- `Jokalala: Clear Refactoring Results` - Clear refactoring data

**Dependencies (SCA):**
- `Jokalala: Scan Dependencies (SCA)` - Scan project dependencies
- `Jokalala: Generate SBOM` - Generate Software Bill of Materials
- `Jokalala: Check License Compliance` - Check dependency licenses
- `Jokalala: Clear SCA Results` - Clear SCA data

**Container & IaC Security:**
- `Jokalala: Scan Container/IaC Files` - Scan all infrastructure files
- `Jokalala: Scan Dockerfiles` - Scan only Dockerfile configurations
- `Jokalala: Scan Kubernetes Manifests` - Scan Kubernetes YAML files
- `Jokalala: Scan Terraform Files` - Scan Terraform configurations
- `Jokalala: Scan Current Container/IaC File` - Scan currently open file
- `Jokalala: Clear Container/IaC Results` - Clear infrastructure scan data

**Settings:**
- `Jokalala: Open Settings` - Open extension settings
- `Jokalala: Set API Key` - Securely store API key

### Keyboard Shortcuts

- `Ctrl+Alt+A` / `Cmd+Alt+A` - Analyze current file
- `Ctrl+Alt+S` / `Cmd+Alt+S` - Analyze selection

### Tree Views

The extension adds seven tree views to the sidebar:

1. **Issues** - Detected security issues organized by severity
2. **CVE Database** - Search and browse known vulnerabilities
3. **Recommendations** - AI-powered code improvement suggestions
4. **Code Metrics** - Quality and security risk metrics
5. **Refactoring** - AI-powered refactoring opportunities with one-click fixes
6. **Dependencies (SCA)** - Vulnerable dependencies with severity indicators
7. **Container & IaC Security** - Infrastructure security issues organized by type or severity

### Code Actions

When issues are detected, the extension provides quick fixes:

- **Apply Suggestion** - Apply the recommended fix
- **Preview Diff** - Preview changes before applying
- **Mark as False Positive** - Report incorrect detections
- **Mark as Helpful** - Provide positive feedback

## Supported Languages

| Category | Languages | Features |
|----------|-----------|----------|
| **Web** | JavaScript, TypeScript | XSS, SQL injection, DOM-based attacks |
| **Frontend Frameworks** | Vue.js, Svelte | v-html XSS, @html directive, SSR security |
| **Backend** | Python, Java, Go, PHP, Ruby | Injection, deserialization, auth issues |
| **JVM** | Kotlin, Scala | Play Framework, Akka, Spark security |
| **Systems** | C, C++, Rust | Buffer overflow, memory safety |
| **Mobile** | Swift, Objective-C, Dart | Keychain security, ATS compliance, WebView |
| **Enterprise** | C# | .NET-specific vulnerabilities |
| **Blockchain** | Solidity | Reentrancy, overflow, access control (30+ patterns) |

## Infrastructure Security

### Dockerfile Security (CIS Docker Benchmark)

- Insecure base image detection (`latest` tag)
- Root user warnings
- Exposed secrets in ENV/ARG
- Missing HEALTHCHECK
- Unnecessary ADD usage
- Shell form CMD detection

### Kubernetes Security (CIS Benchmark + NSA/CISA Guide)

- Privileged container detection
- Missing security contexts
- Host namespace sharing
- Dangerous capabilities
- Missing resource limits
- Default service accounts

### Terraform Security

- Open security groups (0.0.0.0/0)
- Public S3 buckets
- Disabled encryption
- Hardcoded secrets
- Missing logging

### CloudFormation Security

- Misconfigured IAM policies
- Public resources
- Missing encryption settings
- Security group misconfigurations

## Development

### Prerequisites

- Node.js 16.x or higher
- npm 7.x or higher
- VS Code 1.85.0 or higher

### Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Run tests
npm test

# Package extension
npm run package
```

## Architecture

### Core Services

- **CodeAnalysisService** - API communication and request management
- **ContainerIaCService** - Infrastructure security scanning
- **RefactoringService** - AI-powered code improvements
- **ConfigurationService** - Settings management with validation
- **Logger** - Centralized logging with PII anonymization
- **SecurityService** - Secure credential storage and input sanitization

### Tree Providers

- **IssueTreeProvider** - Security issues view
- **CVETreeProvider** - CVE database view
- **RefactoringTreeProvider** - Refactoring suggestions view
- **SCATreeProvider** - Dependencies view
- **ContainerIaCTreeProvider** - Infrastructure security view

### Project Structure

```text
src/
├── commands/           # Command implementations
├── interfaces/         # TypeScript interfaces
├── providers/          # Tree view and code action providers
│   ├── issue-tree-provider.ts
│   ├── cve-tree-provider.ts
│   ├── refactoring-tree-provider.ts
│   ├── sca-tree-provider.ts
│   └── container-iac-tree-provider.ts
├── services/           # Core business logic
│   ├── code-analysis-service.ts
│   ├── container-iac-service.ts
│   └── refactoring-service.ts
├── test/               # Test suites
├── utils/              # Utility functions
└── extension.ts        # Extension entry point
```

## Troubleshooting

### Common Issues

#### Extension Not Activating

**Problem**: Extension doesn't activate when opening code files

**Solution**:

1. Check that you're working with supported languages (see language support section)
2. Reload VS Code window (`Developer: Reload Window`)
3. Check Output panel (`View → Output → Jokalala Code Analysis`) for errors

#### API Connection Errors

**Problem**: "Failed to connect to API endpoint" error

**Solution**:

1. Verify API endpoint is correct in settings
2. Check that API endpoint uses HTTPS (HTTP will show a warning)
3. Verify API key is set correctly (`Jokalala: Show Settings`)
4. Check network connectivity and firewall settings
5. Review circuit breaker status in logs

#### No Issues Detected

**Problem**: Analysis completes but no issues are shown

**Solution**:

1. Check that the file size is within limits (default: 200KB)
2. Verify the analysis mode is set to 'full' for comprehensive analysis
3. Check the Output panel for API response details
4. Clear cache and re-analyze (`Jokalala: Clear Cache`)

### Debug Mode

Enable debug logging to troubleshoot issues:

```json
{
  "jokalala.logLevel": "debug"
}
```

Then check the Output panel: `View → Output → Jokalala Code Analysis`

## Privacy & Security

### Data Collection

The extension collects minimal telemetry data (if enabled):

- Extension version and VS Code version
- Analysis request counts and response times
- Error rates and types
- **PII is automatically anonymized** (file paths, emails, tokens)

### Secure Storage

- API keys are stored using VS Code's SecretStorage API
- Credentials are encrypted at rest
- No sensitive data is logged or transmitted in telemetry

### Network Security

- All API communication should use HTTPS
- HTTP endpoints trigger security warnings
- Request/response validation prevents injection attacks

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linter (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Quality Standards

- TypeScript strict mode enabled
- 90%+ test coverage required
- ESLint and Prettier for code formatting
- Comprehensive JSDoc comments for public APIs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [https://docs.jokalala.com](https://docs.jokalala.com)
- **Issues**: [GitHub Issues](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues)
- **Email**: <support@jokalala.com>
- **Discord**: [Join our community](https://discord.gg/jokalala)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each version.

## Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Powered by Jokalala AI Code Analysis Platform
- Security patterns based on OWASP, CWE, SWC Registry, CIS Benchmarks
- Icons from [VS Code Codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html)

---

Made with ❤️ by the Jokalala Team
