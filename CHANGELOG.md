# Changelog

All notable changes to the Jokalala Code Analyzer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-12-06

### Added
- Intelligence prioritizer for CISA KEV and EPSS vulnerability prioritization
- Enhanced code action provider with one-click fixes
- Quality gate for V2 analysis reports
- Context-aware confidence scoring
- False positive detection system
- User feedback service for accuracy improvement
- **Cache encryption using AES-256-GCM** for secure data at rest
- Path traversal validation utility for secure file handling

### Changed
- Improved language detection in backend analyzer
- Enhanced misclassification detection
- **HTTPS is now required** for API endpoints (HTTP only allowed for localhost)
- **Telemetry is now opt-in** (disabled by default for privacy)
- API endpoint default changed to production HTTPS URL

### Fixed
- False positive reduction in SQL injection detection
- Improved accuracy for command injection detection
- **Memory leak in cache service** - accessOrder array now bounded
- Type safety improvements - replaced `error: any` with proper types

### Security

- **[CRITICAL] Path traversal vulnerability fixed** - file paths now validated against workspace boundary
- **[CRITICAL] HTTPS enforcement** - non-localhost HTTP endpoints now rejected
- **[HIGH] Plaintext API key storage blocked** - must use SecretStorage
- **[MEDIUM] Cache data encryption** - sensitive cached data now encrypted at rest
- **[MEDIUM] Telemetry opt-out** - changed to opt-in for better privacy
- **[LOW] Memory safety** - fixed unbounded array growth in LRU cache
- **[LOW] Type safety** - eliminated unsafe `any` type usage

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

[2.0.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v1.0.0
[0.9.0]: https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v0.9.0
