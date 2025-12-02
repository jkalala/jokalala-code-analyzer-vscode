# VS Code Marketplace Release Guide

This document provides step-by-step instructions for publishing and managing the Jokalala Code Analyzer extension on the VS Code Marketplace.

## Prerequisites

### 1. Azure DevOps Account

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Sign in with your Microsoft account (or create one)
3. Create an organization if you don't have one

### 2. Personal Access Token (PAT)

1. In Azure DevOps, click on **User Settings** (top right) → **Personal Access Tokens**
2. Click **+ New Token**
3. Configure:
   - **Name**: `vsce-publish`
   - **Organization**: All accessible organizations
   - **Expiration**: Set appropriate duration (max 1 year)
   - **Scopes**: Select **Custom defined** → **Marketplace** → Check **Acquire** and **Manage**
4. Click **Create** and **copy the token immediately** (it won't be shown again)

### 3. Publisher Account

1. Go to [Visual Studio Marketplace Management](https://marketplace.visualstudio.com/manage)
2. Sign in with the same Microsoft account
3. Click **+ Create publisher**
4. Fill in:
   - **ID**: `jokalala` (must match `publisher` in package.json)
   - **Name**: `Jokalala`
   - **Description**: Security-focused code analysis tools
5. Complete verification if required

## First-Time Setup

### Install vsce CLI

```bash
npm install -g @vscode/vsce
```

### Login to Publisher

```bash
vsce login jokalala
# Enter your Personal Access Token when prompted
```

### Verify Setup

```bash
vsce ls-publishers
# Should show 'jokalala' in the list
```

## Publishing Process

### 1. Pre-publish Checklist

- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated with new version
- [ ] All tests passing (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Compiled successfully (`npm run compile`)
- [ ] README.md is up to date
- [ ] Icon exists at `images/icon.png` (128x128 PNG recommended)

### 2. Package the Extension

```bash
# From packages/vscode-code-analysis directory
npm run package
# or
vsce package
```

This creates `jokalala-code-analysis-X.X.X.vsix`

### 3. Test the Package

```bash
# Install locally to test
code --install-extension jokalala-code-analysis-X.X.X.vsix

# Test all features work correctly
# Then uninstall if needed
code --uninstall-extension jokalala.jokalala-code-analysis
```

### 4. Publish to Marketplace

```bash
# Publish directly
vsce publish

# Or publish a specific version
vsce publish 1.0.1

# Or publish with patch/minor/major bump
vsce publish patch  # 1.0.0 → 1.0.1
vsce publish minor  # 1.0.0 → 1.1.0
vsce publish major  # 1.0.0 → 2.0.0
```

### 5. Verify Publication

1. Visit [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis)
2. Verify all information displays correctly
3. Test installation from marketplace

## Automated Publishing (CI/CD)

### GitHub Actions Setup

1. Add secrets to your GitHub repository:
   - `VSCE_PAT`: Your Personal Access Token
   - `OVSX_PAT`: Open VSX token (optional, for Open VSX Registry)

2. The release workflow (`.github/workflows/release.yml`) will:
   - Build and test the extension
   - Create a GitHub Release
   - Publish to VS Code Marketplace
   - Publish to Open VSX Registry (optional)

### Triggering a Release

```bash
# Create and push a version tag
git tag v1.0.1
git push origin v1.0.1
```

Or use the GitHub Actions workflow dispatch to manually trigger a release.

## Version Management

### Semantic Versioning

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Pre-release Versions

```bash
# Publish as pre-release
vsce publish --pre-release

# Users can opt-in to pre-release versions in VS Code
```

## Marketplace Optimization

### Search Keywords

The `keywords` in package.json help users find your extension:
- security, vulnerability, code-analysis, static-analysis
- sast, sql-injection, xss, owasp
- ai, machine-learning, devsecops, secure-coding

### Categories

- **Linters**: Primary category for code analysis
- **Programming Languages**: Language-specific analysis
- **Machine Learning**: AI-powered features
- **Other**: General utility

### Gallery Banner

```json
"galleryBanner": {
  "color": "#1e1e1e",
  "theme": "dark"
}
```

### Badges

Display build status, version, and downloads on marketplace page.

## Troubleshooting

### Common Issues

#### "Invalid publisher name"
- Ensure `publisher` in package.json matches your marketplace publisher ID exactly

#### "Personal Access Token has expired"
- Generate a new PAT from Azure DevOps and run `vsce login` again

#### "Extension manifest is invalid"
- Run `vsce ls` to check for issues
- Ensure all referenced files exist (icon, README, etc.)

#### "Failed to verify PAT"
- Verify the token has Marketplace scope
- Check organization access settings

### Checking Extension Status

```bash
# Show extension info
vsce show jokalala.jokalala-code-analysis

# List all your published extensions
vsce ls-publishers
```

## Open VSX Registry (Optional)

For users not using VS Code but compatible editors (VSCodium, Gitpod, etc.):

### Setup

1. Create account at [Open VSX](https://open-vsx.org/)
2. Generate an access token
3. Add to GitHub secrets as `OVSX_PAT`

### Manual Publishing

```bash
npm install -g ovsx
ovsx publish jokalala-code-analysis-X.X.X.vsix -p <token>
```

## Unpublishing / Deprecating

### Hide from Search (Soft Deprecate)

1. Go to [Marketplace Management](https://marketplace.visualstudio.com/manage)
2. Select your extension
3. Use options to hide or mark as deprecated

### Full Unpublish

```bash
vsce unpublish jokalala.jokalala-code-analysis
```

**Warning**: This permanently removes the extension. Users won't be able to install it.

## Resources

- [VS Code Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Reference](https://github.com/microsoft/vsce)
- [Marketplace Management Portal](https://marketplace.visualstudio.com/manage)
- [Azure DevOps PAT Documentation](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

---

## Quick Reference

```bash
# Login
vsce login jokalala

# Package
vsce package

# Publish
vsce publish [patch|minor|major]

# Show info
vsce show jokalala.jokalala-code-analysis

# Unpublish (careful!)
vsce unpublish jokalala.jokalala-code-analysis
```
