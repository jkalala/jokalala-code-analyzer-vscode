# Repository Organization Guide

## 📁 Project Structure

This document provides an overview of the organized repository structure for the Jokalala Code Analyzer VS Code Extension.

### Root Level Files

```
/
├── package.json              # Project metadata and dependencies
├── tsconfig.json            # TypeScript configuration
├── tsconfig.test.json       # TypeScript test configuration
├── pnpm-lock.yaml          # Dependency lock file (pnpm)
├── .gitignore              # Git ignore patterns
├── .npmignore              # NPM publish ignore patterns
├── .vscodeignore           # VS Code extension package ignore patterns
├── LICENSE                 # MIT License
├── README.md               # Quick start guide (moved to docs/getting-started/)
└── .github/                # GitHub configuration
```

## 📚 Documentation Structure (`/docs`)

All documentation is organized by category for easy navigation:

### `/docs/getting-started/`
- **GETTING_STARTED.md** - Quick start guide
- **QUICK_START.md** - Rapid setup instructions
- **README.md** - Main project overview (replaces root README)
- **SETUP_SUMMARY.md** - Complete setup walkthrough

### `/docs/guides/`
- **DEVELOPMENT_GUIDE.md** - Development setup and architecture
- **VSCODE_PLUGIN_DEVELOPMENT_GUIDE.md** - Extension development guide
- **API_KEY_SETUP_GUIDE.md** - API key configuration
- **CONFIGURATION_EXAMPLES.md** - Configuration examples

### `/docs/architecture/`
- **ARCHITECTURE_ASSESSMENT.md** - System architecture overview
- **PROJECT_STRUCTURE.md** - Detailed project structure
- **PROJECT_STRUCTURE_VISUAL.md** - Visual structure diagrams

### `/docs/security/`
- **SECURITY.md** - Security best practices
- **AUDIT.md** - Security audit report
- **COMPREHENSIVE_AUDIT_2025.md** - Detailed audit findings

### `/docs/publishing/`
- **PUBLISHING.md** - Publishing guidelines
- **VSCODE-MARKETPLACE-RELEASE.md** - Marketplace release process
- **EXTENSION_PACKAGING_COMPLETE.md** - Packaging documentation

### `/docs/community/`
- **CONTRIBUTING.md** - Contribution guidelines
- **CODE_OF_CONDUCT.md** - Community code of conduct

### `/docs/releases/`
- **CHANGELOG.md** - Version history and changes

### `/docs/tasks/`
- **TASK_*.md** - Project task tracking and completion records

## 🔧 Source Code (`/src`)

```
src/
├── extension.ts              # Main extension entry point
├── constants.ts             # Application constants
├── commands/                # Command implementations
├── core/                    # Core analysis engines
├── interfaces/              # TypeScript interfaces
├── providers/               # VS Code tree view providers
├── services/                # Service implementations
├── test/                    # Test files
├── types/                   # Type definitions
└── utils/                   # Utility functions
```

## 📦 Distribution (`/dist`)

```
dist/
└── releases/                # VSIX package releases
    ├── jokalala-code-analysis-1.0.2.vsix
    ├── jokalala-code-analysis-1.0.3.vsix
    ├── jokalala-code-analysis-1.0.4.vsix
    ├── jokalala-code-analysis-1.0.5.vsix
    ├── jokalala-code-analysis-1.1.0.vsix
    ├── jokalala-code-analysis-1.2.0.vsix
    └── jokalala-code-analysis-2.2.0.vsix
```

## 🔧 Scripts (`/scripts`)

Installation and setup scripts:
- **install.ps1** - PowerShell installation script
- **install-simple.ps1** - Simple PowerShell setup
- **install.sh** - Bash/Shell installation script

## 🖼️ Assets (`/images`)

Brand assets and extension icons used in documentation and marketplace.

## 🔌 Plugins (`/plugins`)

Third-party and custom plugin integrations:
- **github-integration/** - GitHub integration plugin

## 🔒 Security & Configuration

### .gitignore
Excludes sensitive files and build artifacts:
- Environment variables (.env files)
- Dependencies (node_modules)
- Build outputs (dist/, out/, build/)
- IDE files (.vscode/, .idea/)
- Logs and temporary files
- System files (.DS_Store, Thumbs.db)

### .npmignore
Controls what files are included in npm package publication:
- Source TypeScript files (not needed in package)
- Test files and coverage
- Development documentation
- Configuration and CI files

### .vscodeignore
Controls what files are bundled in VSIX package:
- Development files and configs
- Test files
- Documentation
- Build artifacts

## 🚀 Key Improvements Made

### Organization
- ✅ Moved all 28 markdown files to `/docs` with logical categorization
- ✅ Moved 7 VSIX releases to `/dist/releases/`
- ✅ Moved 3 install scripts to `/scripts/`
- ✅ Cleaned up root directory (removed 13 unnecessary payload/base64 files)

### Package Management
- ✅ Removed `package-lock.json` (standardized on pnpm)
- ✅ Verified single lock file (`pnpm-lock.yaml`)

### Security
- ✅ Enhanced `.gitignore` with comprehensive security patterns
- ✅ Created `.npmignore` for safe package publishing
- ✅ Verified no hardcoded secrets in codebase
- ✅ Confirmed SecretStorage usage for API keys

### Files Removed
1. **Payload/Config Files** (testing/CI artifacts):
   - ci-payload.json, ci_b64.txt, rl-payload.json, rl_b64.txt
   - pkg-payload.json, pkg-payload-full.json, pkg_v21_payload.json, pkg_v211_payload.json
   - pkg_b64.txt, pkg_v21_b64.txt

2. **Source Files** (should be in /src):
   - rate-limiter.ts (utility function)
   - telemetry-service-v2.ts (service class)

3. **CI Files** (duplicate in .github/workflows):
   - ci.yml (moved to .github/workflows/)

4. **Package Manager Conflicts**:
   - package-lock.json (replaced by pnpm-lock.yaml)

## 📋 Best Practices Implemented

### Commit Guidelines
- Never commit `node_modules/`, lock files, or `.env` files
- Always use pnpm for dependency management
- Keep build artifacts out of version control

### Publication Guidelines
- Use `.npmignore` to exclude unnecessary files from npm package
- Use `.vscodeignore` to optimize VSIX file size
- Maintain security with proper secret handling

### Documentation
- Keep documentation in `/docs` organized by function
- Maintain README at project root (via docs/getting-started/README.md reference)
- Use consistent formatting and structure

---

**Last Updated:** February 4, 2026
**Repository:** jokalala/jokalala-code-analyzer-vscode
