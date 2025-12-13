# Changelog

All notable changes to the Jokalala Code Analyzer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.0] - 2025-12-13

### Added

#### Plugin System Architecture
- **Plugin Manager Service**: Enterprise-grade plugin system for extending the analyzer with custom rules, language support, and result enrichers
  - Plugin discovery from workspace, global, and custom paths
  - Plugin lifecycle management (load/unload/enable/disable)
  - Plugin dependency resolution
  - Event-driven architecture for plugin communication
  - Plugin validation and schema enforcement

#### Custom Rule Framework Integration
- **Plugins & Custom Rules Tree View**: New dedicated panel for managing plugins and custom security rules
  - Visual plugin management with enable/disable controls
  - Rule browsing organized by category (Security, Quality, Performance, Style, Best Practice, Compliance)
  - Severity-based icons for quick identification
  - Rule testing with built-in test runner
  - Detailed rule information panel with CWE/OWASP references

#### New Commands
- `Jokalala: Create New Plugin` - Scaffold a new plugin with manifest and example rules
- `Jokalala: Import Custom Rules` - Import rules from JSON files
- `Jokalala: Export Custom Rules` - Export rules to shareable JSON format
- `Jokalala: Reload Plugins` - Hot-reload plugins without restarting VS Code
- `Jokalala: Open Plugins Folder` - Quick access to workspace plugins directory
- Enable/Disable Plugin - Toggle individual plugins
- Enable/Disable Rule - Toggle individual rules
- Show Rule Details - View comprehensive rule documentation
- Test Rule - Run test cases against a rule

#### Configuration Options
- `jokalala.plugins.enabled` - Enable/disable the plugin system
- `jokalala.plugins.additionalPaths` - Add custom plugin search paths
- `jokalala.plugins.autoUpdate` - Enable automatic plugin updates
- `jokalala.plugins.trustedPublishers` - Configure trusted plugin publishers

### Plugin Development Support
- JSON-based plugin manifest (`jokalala-plugin.json`)
- Support for pattern plugins (custom security rules)
- Support for language plugins (new language analyzers)
- Support for enricher plugins (result enhancement)
- Support for hook plugins (lifecycle extensions)
- Built-in rule validation and testing framework
- Rule pack support for bundling multiple rules

### Developer Experience
- Plugin scaffold generator with example rules
- Rule import/export for sharing custom rules
- Comprehensive plugin documentation
- Event-driven plugin communication

## [2.2.0] - 2025-12-13

### Added

#### Enterprise-Scale Architecture
- **Worker Pool Architecture**: Parallel processing across multiple CPU cores with priority-based task scheduling (CRITICAL/HIGH/NORMAL/LOW/BACKGROUND), auto-scaling workers, and circuit breaker pattern for resilience - ~10x faster project analysis
- **Incremental Analysis Engine**: AST-aware scope detection for JS/TS/Python/Java/Go/Rust/C# with diff-based change detection using LCS algorithm - sub-100ms response time for single-line changes
- **Offline Analysis Mode**: 15+ built-in security rules bundled locally with OWASP Top 10 and CWE coverage, zero network dependency for core analysis
- **Multi-Tier Caching System**: L1 memory cache with smart eviction (LRU/LFU/ARC/Smart), L2 persistent cache with TTL, stale-while-revalidate pattern, and compression - 100MB+ capacity

#### Advanced Features
- **Result Streaming Architecture**: Real-time streaming of analysis results with priority-based delivery (critical issues first), backpressure handling, and progress updates with phase tracking
- **Secrets Detection Engine**: 30+ secret patterns (AWS, GCP, Azure, GitHub, OpenAI, etc.) with entropy-based detection, context-aware false positive filtering, and provider-specific remediation
- **Custom Rule Framework**: JSON/YAML rule definitions with schema validation, versioning, built-in test runner, and import/export functionality
- **Advanced Reporting Engine**: SARIF, HTML dashboard, Markdown, CSV, JUnit XML, and Code Climate JSON formats for CI/CD integration

#### Performance Monitoring
- Real-time performance metrics with histogram-based analysis
- Throughput monitoring (files/lines/issues per second)
- Alert thresholds with cooldown
- Memory usage tracking and SLA monitoring

### Performance
- 10x faster project analysis via parallel processing
- Sub-100ms incremental analysis for single-line changes
- 100MB+ caching capacity with smart eviction
- Zero-latency offline mode for core security checks

## [1.1.0] - 2024-12-07

### Added

#### Container & Infrastructure-as-Code Security Scanning
- **Dockerfile Security Analysis**: Detect insecure base images, root user usage, exposed secrets, missing health checks, and 10+ security patterns following CIS Docker Benchmark
- **Docker Compose Security**: Identify privileged containers, host network/PID sharing, Docker socket mounts, exposed secrets in environment variables
- **Kubernetes Manifest Scanning**: Find privileged pods, missing security contexts, host namespace sharing, dangerous capabilities, missing resource limits (CIS Kubernetes Benchmark compliant)
- **Terraform Security Analysis**: Detect open security groups, public resources, disabled encryption, hardcoded secrets, public S3 buckets
- **CloudFormation Template Analysis**: Identify security misconfigurations in AWS infrastructure templates
- **Helm Chart Security**: Analyze Helm templates for Kubernetes security issues

#### New Language Support (8 Additional Languages)
- **Scala**: Security analysis for Play Framework, Akka, and Spark applications including SQL injection, XXE, serialization, and cryptographic vulnerabilities
- **Dart/Flutter**: Mobile security analysis including HTTP/HTTPS security, secure storage, WebView vulnerabilities, and Flutter-specific patterns
- **Vue.js SFC**: XSS detection via v-html, dynamic component injection, event handler security, and Nuxt.js SSR considerations
- **Svelte/SvelteKit**: @html directive security, store security, SSR-specific checks, and form action security
- **Solidity**: Smart contract security with 30+ vulnerability patterns including reentrancy, integer overflow, access control, front-running, flash loan attacks (SWC Registry compliant)
- **Objective-C**: iOS/macOS security including Keychain security, cryptographic issues, format string vulnerabilities, ATS compliance

#### Software Composition Analysis (SCA) Enhancements
- **Multi-ecosystem dependency scanning**: Python (requirements.txt, Pipfile, poetry.lock), Java (pom.xml, build.gradle), Go, Rust, Ruby, PHP, .NET
- **NVD (National Vulnerability Database) integration**: Real-time CVE lookups with CVSS scores
- **SBOM Generation**: CycloneDX 1.5 and SPDX 2.3 format support
- **License Compliance Checking**: Detect high-risk (GPL, AGPL) and medium-risk licenses

#### New Tree Views
- **Container & IaC Security View**: Dedicated panel for Docker, Kubernetes, Terraform, and CloudFormation issues organized by file type or severity
- **Dependencies (SCA) View**: Visualize vulnerable dependencies with severity indicators

#### New Commands
- `Jokalala: Scan Container/IaC Files` - Scan all container and infrastructure files
- `Jokalala: Scan Dockerfiles` - Scan only Dockerfile configurations
- `Jokalala: Scan Kubernetes Manifests` - Scan Kubernetes YAML files
- `Jokalala: Scan Terraform Files` - Scan Terraform configurations
- `Jokalala: Scan Dependencies (SCA)` - Scan project dependencies for vulnerabilities
- `Jokalala: Generate SBOM` - Generate Software Bill of Materials
- `Jokalala: Check License Compliance` - Check dependency licenses

### Changed
- Upgraded supported languages from 10+ to 19 languages
- Enhanced activation events to include Dockerfile, YAML, Terraform, and JSON files
- Improved file type detection for container and IaC configurations

### Security
- Added compliance mapping for CIS Docker Benchmark, CIS Kubernetes Benchmark, NSA/CISA Kubernetes Hardening Guide, and AWS Well-Architected Framework

## [1.0.5] - 2024-12-05

### Added
- CVE Database tree view with search and scan capabilities
- Refactoring tree view with AI-powered code improvement suggestions
- One-click fix support for auto-fixable issues
- Batch refactoring for applying multiple fixes at once
- Diff preview for refactoring changes

### Changed
- Improved issue tree view with file grouping and project-wide analysis
- Enhanced code action provider with context-aware fixes

## [1.0.1] - 2024-12-03

### Added
- Intelligence prioritizer for CISA KEV and EPSS vulnerability prioritization
- Enhanced code action provider with one-click fixes
- Quality gate for V2 analysis reports
- Context-aware confidence scoring
- False positive detection system
- User feedback service for accuracy improvement

### Changed
- Improved language detection in backend analyzer
- Enhanced misclassification detection

### Deprecated

- `jokalala.apiKey` setting - Use the 'Jokalala: Set API Key' command instead for secure storage

### Fixed
- False positive reduction in SQL injection detection
- Improved accuracy for command injection detection
- Added clear deprecation message for apiKey configuration

## [1.0.0] - 2024-12-02

### Added
- Initial release of Jokalala Code Analyzer
- Real-time code analysis for security vulnerabilities
- Support for 10+ programming languages
- VS Code tree views for issues, recommendations, and metrics
- AI-powered recommendations
- Secure API key storage using VS Code SecretStorage
- Configurable caching with TTL and size limits
- Circuit breaker pattern for fault tolerance
- Retry logic with exponential backoff
- Priority-based request queue
- PII anonymization in telemetry
- HTTPS validation for API endpoints
- Keyboard shortcuts for common actions
- Code actions for quick fixes

### Security
- Secure credential storage using VS Code's SecretStorage API
- XSS prevention with HTML escaping
- Input validation and sanitization
- HTTPS enforcement with warnings for HTTP

## [0.9.0] - 2024-11-15

### Added
- Beta release for early adopters
- Basic vulnerability detection
- Issue tree view
- Configuration UI

### Changed
- Improved API response handling
- Enhanced error messages

### Fixed
- Memory leak in long-running sessions
- Cache invalidation issues

## Types of Changes

- **Added** for new features.
- **Changed** for changes in existing functionality.
- **Deprecated** for soon-to-be removed features.
- **Removed** for now removed features.
- **Fixed** for any bug fixes.
- **Security** for vulnerability fixes.

---

[Unreleased]: https://github.com/jkalala/jokalala-code-analyzer-vscode/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v2.2.0
[1.1.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v1.1.0
[1.0.5]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v1.0.5
[1.0.1]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v1.0.1
[1.0.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v1.0.0
[0.9.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v0.9.0
