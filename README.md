# Jokalala Code Analyzer

**AI-Powered Security Vulnerability Detection for VS Code**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/jokalala.jokalala-code-analysis)](https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/jokalala.jokalala-code-analysis)](https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis)

Detect security vulnerabilities, code quality issues, and best practice violations across 10+ programming languages with AI-powered analysis.

## 🚀 Quick Start

### 1. Install
- Open VS Code
- Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
- Search for "Jokalala Code Analyzer"
- Click Install

### 2. Get API Key
Visit [jokalala.com](https://jokalala.com) to generate your free API key.

### 3. Configure
Open Command Palette (`Ctrl+Shift+P`) → **Jokalala: Show Settings** → Enter your API key

### 4. Analyze
Right-click any file → **Analyze with Jokalala**

## ✨ Features

- **150+ Security Patterns** - SQL injection, XSS, command injection, and more
- **10+ Languages** - JavaScript, TypeScript, Python, Java, C#, PHP, Ruby, Go, Rust, and more
- **Two-Stage Analysis** - Fast offline + detailed cloud analysis
- **Secret Detection** - Finds API keys, tokens, passwords, and sensitive data
- **Smart Caching** - Intelligent caching for improved performance
- **Real-time Reports** - Comprehensive vulnerability reports with remediation steps

## 📚 Documentation

For detailed information, see the `/docs` directory:

- **[Getting Started](docs/getting-started/)** - Setup and quick start guides
- **[Development Guide](docs/guides/DEVELOPMENT_GUIDE.md)** - Development setup and architecture
- **[API Configuration](docs/guides/API_KEY_SETUP_GUIDE.md)** - API key setup instructions
- **[Security](docs/security/SECURITY.md)** - Security best practices
- **[Contributing](docs/community/CONTRIBUTING.md)** - Contribution guidelines
- **[Architecture](docs/architecture/PROJECT_STRUCTURE.md)** - Project structure overview

## 🔒 Security

✅ **Secure API Key Storage** - Uses VS Code's encrypted SecretStorage  
✅ **No Code Exposure** - Code is never sent without your approval  
✅ **HTTPS Only** - All communication is encrypted  
✅ **Input Validation** - Comprehensive input sanitization  

See [SECURITY.md](docs/security/SECURITY.md) for details.

## 🛠️ Installation

### From Marketplace (Recommended)
Install directly from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis)

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

We welcome contributions! See [CONTRIBUTING.md](docs/community/CONTRIBUTING.md) for:
- Development setup
- Code guidelines
- Testing requirements
- Submission process

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 🐛 Support

- **Issues**: [GitHub Issues](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jkalala/jokalala-code-analyzer-vscode/discussions)
- **Email**: support@jokalala.com

## 📖 More Information

- [Full Getting Started Guide](docs/getting-started/GETTING_STARTED.md)
- [Repository Structure](docs/architecture/REPOSITORY_ORGANIZATION.md)
- [Security Audit Report](docs/security/SECURITY_AUDIT_CLEANUP_REPORT.md)

---

**Ready to get started?** See [Getting Started Guide](docs/getting-started/GETTING_STARTED.md)
