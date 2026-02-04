# 🌟 Jokalala Code Analyzer - Contributors Guide

Welcome to the Jokalala Code Analyzer project! This guide is designed to help developers get up and running quickly.

## 🎯 Why Contribute?

Your contributions help improve security analysis for thousands of developers. By contributing, you:
- 🔒 Enhance security detection capabilities
- 🐛 Fix bugs and improve performance
- 📚 Improve documentation for the community
- 🌍 Make code security more accessible to everyone
- 💼 Grow your portfolio with a high-impact project

## 🚀 Quick Start for Developers

### Prerequisites

- Node.js 18.x or higher
- pnpm (package manager)
- VS Code 1.85.0 or higher
- Git

### Development Environment Setup

```bash
# 1. Fork the repository on GitHub
# Navigate to: https://github.com/jkalala/jokalala-code-analyzer-vscode

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/jokalala-code-analyzer-vscode.git
cd jokalala-code-analyzer-vscode

# 3. Add upstream remote
git remote add upstream https://github.com/jkalala/jokalala-code-analyzer-vscode.git

# 4. Install dependencies
pnpm install

# 5. Build the extension
pnpm run compile

# 6. Run tests
pnpm test

# 7. Open in VS Code
code .
```

## 🏗️ Project Architecture

```
src/
├── core/              # Core analysis engines
│   ├── incremental-analyzer.ts
│   ├── offline-analyzer.ts
│   ├── streaming-analyzer.ts
│   ├── secrets-detector.ts
│   └── worker-pool.ts
├── services/          # Service implementations
│   ├── code-analysis-service.ts
│   ├── security-service.ts
│   ├── cache-service.ts
│   └── telemetry-service.ts
├── providers/         # VS Code UI providers
│   ├── code-action-provider.ts
│   ├── issues-tree-provider.ts
│   └── other tree providers
├── interfaces/        # TypeScript interfaces
├── utils/             # Utility functions
├── commands/          # Command implementations
├── test/              # Test files
└── extension.ts       # Entry point
```

### Key Modules

- **Code Analysis Service** - Main analysis orchestration
- **Secrets Detector** - 150+ pattern detection engine
- **Security Service** - Secure API key storage and sanitization
- **Cache Manager** - Performance optimization
- **Worker Pool** - Parallel analysis processing

## 🔍 Finding Issues to Work On

### For Beginners
Look for issues labeled:
- `good first issue` - Perfect for first contributions
- `help wanted` - Need community assistance
- `documentation` - Improve docs

### For Experienced Developers
- `bug` - Fix identified issues
- `enhancement` - Add new features
- `refactor` - Code quality improvements

[Browse Issues →](https://github.com/jkalala/jokalala-code-analyzer-vscode/issues)

## 🛠️ Making Your First Contribution

### Step 1: Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/bug-description
```

### Step 2: Make Your Changes

Follow the [coding standards](docs/community/CONTRIBUTING.md#coding-standards):
- Use TypeScript with proper types
- Add JSDoc comments for public APIs
- Follow the existing code style
- Write unit tests for new features

### Step 3: Test Your Changes

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- src/services/my-service.test.ts

# Run with coverage
pnpm test -- --coverage
```

### Step 4: Commit Your Changes

Use conventional commits:
```bash
git add .
git commit -m "feat: add new security pattern detection"
# or
git commit -m "fix: resolve cache invalidation issue"
# or
git commit -m "docs: update API configuration guide"
```

**Commit Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting, semicolons, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Tests
- `chore:` - Build process, dependencies, etc.

### Step 5: Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:
- Clear title describing the change
- Description of what changed and why
- Reference to related issues (fixes #123)
- Screenshots if UI changes

## 📋 Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass (`pnpm test`)
- [ ] New tests added for new features
- [ ] Documentation updated or added
- [ ] Commit messages follow conventions
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets or credentials
- [ ] Changes work with latest VS Code version

## 🧪 Testing Guidelines

### Writing Tests

```typescript
// src/services/my-service.test.ts
import * as assert from 'assert'
import { MyService } from './my-service'

suite('MyService Test Suite', () => {
  let service: MyService

  setup(() => {
    service = new MyService()
  })

  test('should handle valid input', () => {
    const result = service.process('input')
    assert.strictEqual(result, 'expected-output')
  })

  test('should throw on invalid input', () => {
    assert.throws(() => {
      service.process(null)
    })
  })
})
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test -- --watch

# Coverage report
pnpm test -- --coverage
```

## 🔐 Security Considerations

When contributing:
- ❌ Never commit API keys, tokens, or secrets
- ✅ Use VS Code's SecretStorage API for credentials
- ✅ Validate and sanitize all user input
- ✅ Use HTTPS for all external connections
- ✅ Review security implications of changes

See [SECURITY.md](docs/security/SECURITY.md) for details.

## 📚 Documentation

If you add a new feature or change existing behavior:
1. Update relevant `.md` files in `/docs`
2. Add JSDoc comments to functions
3. Include code examples if applicable
4. Update README if major feature

## 🤔 Getting Help

### Questions?
- [GitHub Discussions](https://github.com/jkalala/jokalala-code-analyzer-vscode/discussions)
- Open an issue with `question` label
- Check existing issues and discussions

### Need Guidance?
- Review [CONTRIBUTING.md](docs/community/CONTRIBUTING.md)
- Look at similar existing code
- Ask in PR comments
- Ping maintainers if stuck

## 🎉 Your First PR Gets Merged

When your PR is merged:
- You'll be added to the contributors list
- Your work helps improve security for thousands
- You're part of the community!

## 🏆 Recognition

All contributors are recognized:
- Listed in [repository contributors](https://github.com/jkalala/jokalala-code-analyzer-vscode/graphs/contributors)
- Mentioned in release notes for significant contributions
- Community spotlight for major features

## 📖 Code of Conduct

Please review our [Code of Conduct](CODE_OF_CONDUCT.md). We're committed to creating a welcoming community where everyone can contribute safely and respectfully.

## 🔗 Useful Resources

- [Development Guide](../guides/DEVELOPMENT_GUIDE.md)
- [Architecture Documentation](../architecture/PROJECT_STRUCTURE.md)
- [Security Guidelines](../security/SECURITY.md)
- [Main Contributing Guide](CONTRIBUTING.md)

---

**Thank you for considering contributing to Jokalala Code Analyzer!** 🙏

Together, we're making code security better for everyone. Let's build something amazing! 🚀

