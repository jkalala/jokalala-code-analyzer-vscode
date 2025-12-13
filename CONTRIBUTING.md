# Contributing to Jokalala Code Analyzer

First off, thank you for considering contributing to Jokalala Code Analyzer! It's people like you that make this tool better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@jokalala.com](mailto:conduct@jokalala.com).

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **VS Code** 1.85.0 or higher
- **Git** for version control

### Development Setup

1. **Fork the repository**

   Click the "Fork" button on GitHub to create your own copy.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/jokalala-code-analyzer-vscode.git
   cd jokalala-code-analyzer-vscode
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Compile the extension**

   ```bash
   npm run compile
   ```

5. **Open in VS Code**

   ```bash
   code .
   ```

6. **Start debugging**

   Press `F5` to open a new VS Code window with the extension loaded.

### Project Structure

```
src/
├── commands/           # Command implementations
├── interfaces/         # TypeScript interfaces and types
├── providers/          # Tree view and code action providers
├── services/           # Core business logic
├── test/               # Test suites
├── utils/              # Utility functions and helpers
└── extension.ts        # Extension entry point
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When filing a bug report, include:**

- Your environment (OS, VS Code version, extension version)
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Error messages from the Output panel

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) for structured reports.

### Suggesting Features

We love feature suggestions! Please use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and provide:

- Clear description of the problem it solves
- Proposed solution
- Alternative approaches considered
- Use cases

### Your First Code Contribution

Not sure where to start? Look for issues labeled:

- `good first issue` - Simple issues for newcomers
- `help wanted` - Issues that need assistance
- `documentation` - Help improve our docs

### Making Changes

1. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**

   Follow our [coding standards](#coding-standards).

3. **Test your changes**

   ```bash
   npm test
   npm run lint
   ```

4. **Commit your changes**

   Follow conventional commits:

   ```bash
   git commit -m "feat: add new vulnerability detection"
   git commit -m "fix: resolve false positive in SQL injection"
   git commit -m "docs: update configuration guide"
   ```

5. **Push and create PR**

   ```bash
   git push origin feature/your-feature-name
   ```

## Pull Request Process

1. **Before submitting:**
   - Ensure all tests pass
   - Run linting (`npm run lint`)
   - Update documentation if needed
   - Add tests for new features

2. **PR requirements:**
   - Clear description of changes
   - Link to related issue(s)
   - Passes all CI checks
   - At least one approval from maintainers

3. **Review process:**
   - Maintainers will review within 3 business days
   - Address feedback promptly
   - Keep PRs focused and small when possible

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Document public APIs with JSDoc

```typescript
/**
 * Analyzes code for security vulnerabilities
 * @param code - The source code to analyze
 * @param language - The programming language
 * @returns Analysis results with detected vulnerabilities
 */
async function analyzeCode(code: string, language: Language): Promise<AnalysisResult> {
  // Implementation
}
```

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- No trailing commas in function parameters
- Max line length: 100 characters

We use ESLint and Prettier - run `npm run lint` and `npm run format` before committing.

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions/Methods**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (prefix with `I` only if needed for clarity)

### Error Handling

- Always handle errors gracefully
- Use typed error classes when appropriate
- Log errors with context
- Never swallow errors silently

```typescript
try {
  await analyzeFile(path)
} catch (error) {
  logger.error('Analysis failed', { path, error: error instanceof Error ? error.message : error })
  throw new AnalysisError(`Failed to analyze ${path}`, { cause: error })
}
```

## Testing Guidelines

### Test Structure

- Place tests in `src/test/` directory
- Name test files `*.test.ts`
- Group related tests with `describe`
- Use clear test names

```typescript
describe('VulnerabilityDetector', () => {
  describe('detectSQLInjection', () => {
    it('should detect parameterized query vulnerability', () => {
      // Test implementation
    })

    it('should not flag prepared statements as vulnerable', () => {
      // Test implementation
    })
  })
})
```

### Test Coverage

- Aim for 90%+ coverage on new code
- Critical paths require 100% coverage
- Test edge cases and error conditions

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "SecurityService"

# Run in watch mode
npm run test:watch
```

## Documentation

### Code Documentation

- Document all public APIs with JSDoc
- Include parameter descriptions and return types
- Add examples for complex functions

### README Updates

Update the README when:

- Adding new features
- Changing configuration options
- Modifying installation steps
- Adding new commands

### Changelog

Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- Modified behavior description

### Fixed
- Bug fix description
```

## Community

### Getting Help

- **GitHub Discussions**: Ask questions and share ideas
- **Discord**: Real-time chat with the community
- **Stack Overflow**: Tag questions with `jokalala`

### Recognition

Contributors are recognized in:

- Our README contributors section
- Release notes
- Annual contributor spotlight

### Maintainers

Questions? Contact the maintainers:

- [@maintainer1](https://github.com/maintainer1)
- [@maintainer2](https://github.com/maintainer2)

---

Thank you for contributing to Jokalala Code Analyzer!
