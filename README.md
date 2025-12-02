# Jokalala Code Analysis - VS Code Extension

A powerful VS Code extension that provides real-time code analysis, security vulnerability detection, and intelligent recommendations powered by AI.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jkalala/jokalala-code-analyzer-vscode)
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

### 🛡️ Security & Quality

- **Vulnerability Detection**: Identify security vulnerabilities including SQL injection, XSS, path traversal, and more
- **Code Quality Metrics**: Track code quality, maintainability, and security risk scores
- **Best Practice Recommendations**: Get actionable recommendations to improve your code

### 📊 Interactive Views

- **Issues Tree View**: Browse and navigate issues organized by severity (Critical, High, Medium, Low)
- **Recommendations Tree View**: View AI-powered recommendations with detailed descriptions
- **Metrics Tree View**: Monitor code quality metrics and security risk scores

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

### From VSIX (Recommended)

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
   - **Analysis Mode**: `full` or `quick`
   - **Auto Analyze**: Enable/disable auto-analysis on save

#### Method 3: settings.json (Advanced)

1. Open Command Palette → **Preferences: Open User Settings (JSON)**
2. Add configuration:

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "jkl_your_api_key_here",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true
}
```

**🔒 Security Note**: API keys in `settings.json` are automatically migrated to VS Code's encrypted SecretStorage on first use.

### Optional Settings

```json
{
  // Analysis mode: 'quick' or 'full'
  "jokalala.analysisMode": "full",

  // Auto-analyze on file save
  "jokalala.autoAnalyze": true,

  // Show inline warnings in editor
  "jokalala.showInlineWarnings": true,

  // Enable VS Code diagnostics integration
  "jokalala.enableDiagnostics": true,

  // Maximum file size for analysis (bytes)
  "jokalala.maxFileSize": 1048576,

  // Request timeout (milliseconds)
  "jokalala.requestTimeout": 30000,

  // Enable telemetry
  "jokalala.enableTelemetry": true,

  // Cache settings
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 3600000,
  "jokalala.maxCacheSize": 100,

  // Retry settings
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 3,
  "jokalala.retryDelay": 1000,

  // Circuit breaker settings
  "jokalala.circuitBreakerEnabled": true,
  "jokalala.circuitBreakerThreshold": 5,

  // Logging level
  "jokalala.logLevel": "info"
}
```

## Usage

### Commands

Access commands via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Jokalala: Analyze Current File** - Analyze the currently open file
- **Jokalala: Analyze Selection** - Analyze the selected code
- **Jokalala: Analyze Project** - Analyze the entire workspace
- **Jokalala: Clear Cache** - Clear the analysis cache
- **Jokalala: Show Settings** - Open extension settings

### Keyboard Shortcuts

- `Ctrl+Alt+A` / `Cmd+Alt+A` - Analyze current file
- `Ctrl+Alt+S` / `Cmd+Alt+S` - Analyze selection

### Tree Views

The extension adds three tree views to the Explorer sidebar:

1. **Jokalala Issues** - View all detected issues organized by severity
2. **Jokalala Recommendations** - Browse AI-powered recommendations
3. **Jokalala Metrics** - Monitor code quality and security metrics

### Code Actions

When issues are detected, the extension provides quick fixes:

- **Apply Suggestion** - Apply the recommended fix
- **Mark as False Positive** - Report incorrect detections
- **Mark as Helpful** - Provide positive feedback
- **Mark as Not Helpful** - Report unhelpful suggestions

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

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Package extension
npm run package
```

### Testing

The extension includes comprehensive test coverage:

- Unit tests for all services
- Integration tests for VS Code API
- Mock implementations for testing without backend

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "ConfigurationService"

# Run with coverage
npm run test:coverage
```

## Architecture

### Core Services

- **CodeAnalysisService** - API communication and request management
- **ConfigurationService** - Settings management with validation
- **Logger** - Centralized logging with PII anonymization
- **SecurityService** - Secure credential storage and input sanitization
- **TelemetryService** - Privacy-aware usage analytics

### Design Patterns

- **Circuit Breaker** - Prevents cascading failures
- **Priority Queue** - FIFO ordering within same priority
- **Retry Logic** - Exponential backoff with configurable attempts
- **Debouncing** - 300ms debounce for diagnostic updates

### Project Structure

```text
src/
├── commands/           # Command implementations
├── interfaces/         # TypeScript interfaces
├── providers/          # Tree view and code action providers
├── services/          # Core business logic
├── test/              # Test suites
├── utils/             # Utility functions
└── extension.ts       # Extension entry point
```

## Troubleshooting

### Common Issues

#### Extension Not Activating

**Problem**: Extension doesn't activate when opening code files

**Solution**:

1. Check that you're working with supported languages (JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, C#, PHP, Ruby)
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

1. Check that the file size is within limits (default: 1MB)
2. Verify the analysis mode is set to 'full' for comprehensive analysis
3. Check the Output panel for API response details
4. Clear cache and re-analyze (`Jokalala: Clear Cache`)

#### Performance Issues

**Problem**: Extension is slow or unresponsive

**Solution**:

1. Enable caching to reduce API calls
2. Increase cache TTL for longer-lived results
3. Use 'quick' analysis mode for faster results
4. Reduce `maxProjectFiles` for large projects
5. Disable auto-analyze and analyze manually

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
- Icons from [VS Code Codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html)

---

Made with ❤️ by the Jokalala Team
