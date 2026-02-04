⚠️ **IMPORTANT: This is a copy of the original README. For the latest documentation, see:** [`docs/getting-started/README.md`](docs/getting-started/README.md)

---

# Jokalala Code Analyzer - VS Code Extension

**AI-Powered Security Vulnerability Detection**

A professional VS Code extension for detecting security vulnerabilities, code quality issues, and best practice violations across 10+ programming languages.

## 🚀 Quick Start

1. **Install from Marketplace**: Search for "Jokalala Code Analyzer" in VS Code Extensions
2. **Get API Key**: Visit [jokalala.com](https://jokalala.com) to generate your free API key
3. **Configure**: Open Command Palette (`Ctrl+Shift+P`) → **Jokalala: Show Settings**
4. **Paste API Key**: Enter your API key in the secure prompt
5. **Start Analysis**: Right-click any file → **Analyze with Jokalala**

## 📚 Documentation

All documentation is organized in the `/docs` directory:

- **Getting Started**: [`docs/getting-started/`](docs/getting-started/)
  - [GETTING_STARTED.md](docs/getting-started/GETTING_STARTED.md) - Quick setup
  - [API_KEY_SETUP_GUIDE.md](docs/guides/API_KEY_SETUP_GUIDE.md) - API configuration

- **Development**: [`docs/guides/`](docs/guides/)
  - [DEVELOPMENT_GUIDE.md](docs/guides/DEVELOPMENT_GUIDE.md) - Development setup
  - [VSCODE_PLUGIN_DEVELOPMENT_GUIDE.md](docs/guides/VSCODE_PLUGIN_DEVELOPMENT_GUIDE.md) - Extension development

- **Architecture**: [`docs/architecture/`](docs/architecture/)
  - [PROJECT_STRUCTURE.md](docs/architecture/PROJECT_STRUCTURE.md) - Code structure overview

- **Security**: [`docs/security/`](docs/security/)
  - [SECURITY.md](docs/security/SECURITY.md) - Security best practices
  - [SECURITY_AUDIT_CLEANUP_REPORT.md](docs/security/SECURITY_AUDIT_CLEANUP_REPORT.md) - Audit report

- **Community**: [`docs/community/`](docs/community/)
  - [CONTRIBUTING.md](docs/community/CONTRIBUTING.md) - Contribution guidelines
  - [CODE_OF_CONDUCT.md](docs/community/CODE_OF_CONDUCT.md) - Code of conduct

## ✨ Features

- **150+ Security Patterns**: Detects SQL injection, XSS, command injection, and more
- **Multiple Languages**: JavaScript, TypeScript, Python, Java, C#, PHP, Ruby, Go, Rust, and more
- **Two-Stage Analysis**: Fast offline + detailed cloud analysis
- **Secret Detection**: Finds API keys, tokens, passwords, and other sensitive data
- **Smart Caching**: Intelligent caching for improved performance
- **Real-time Analysis**: Analyze code as you type
- **Detailed Reports**: Comprehensive vulnerability reports with remediation steps

## 🔒 Security

- API keys stored securely in VS Code's SecretStorage
- No code sent without user approval
- HTTPS-only communication
- Input validation and sanitization
- See [SECURITY.md](docs/security/SECURITY.md) for details

## 📋 Repository Structure

```
.
├── src/                 # Source code
│   ├── core/           # Analysis engines
│   ├── services/       # Service implementations
│   ├── providers/      # VS Code UI providers
│   └── extension.ts    # Entry point
├── docs/               # Documentation (8 categories)
├── dist/releases/      # VSIX package releases
├── scripts/            # Installation scripts
├── images/             # Brand assets
└── plugins/            # Plugin integrations
```

For detailed structure, see [REPOSITORY_ORGANIZATION.md](REPOSITORY_ORGANIZATION.md)

## 🛠️ Installation

### From VS Code Marketplace (Recommended)
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Jokalala Code Analyzer"
4. Click Install

### Manual Installation
```bash
# Clone repository
git clone https://github.com/jkalala/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode

# Install dependencies (requires pnpm)
pnpm install

# Build
pnpm run compile

# Package (requires vsce)
npm install -g @vscode/vsce
vsce package

# Install the generated .vsix file in VS Code
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/community/CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Testing requirements
- Submission process

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🐛 Issues & Support

- **Report Issues**: [GitHub Issues](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jkalala/jokalala-code-analyzer-vscode/discussions)
- **Email**: support@jokalala.com

## 🙋 Community Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. See [CODE_OF_CONDUCT.md](docs/community/CODE_OF_CONDUCT.md) for details.

## 📊 Project Status

- ✅ Actively Maintained
- ✅ Comprehensive Test Coverage
- ✅ Security Audited
- ✅ Production Ready

---

**Ready to dive deeper?** Start with [docs/getting-started/GETTING_STARTED.md](docs/getting-started/GETTING_STARTED.md)
