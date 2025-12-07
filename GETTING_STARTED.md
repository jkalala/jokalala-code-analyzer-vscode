# Getting Started with Jokalala Code Analysis

Welcome! This guide will help you set up and start using the Jokalala Code Analysis extension in VS Code.

## 📋 Prerequisites

Before you begin, you'll need:

1. **VS Code** version 1.85.0 or higher
2. **Jokalala API Key** - Get yours at [https://jokalala.com/api-keys](https://jokalala.com/api-keys)
3. **Supported Language Files** - JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, C#, PHP, or Ruby

## 🚀 Quick Start (5 Minutes)

### Step 1: Install the Extension

#### Option A: From VS Code Marketplace (Recommended)

1. Open VS Code
2. Click the Extensions icon in the sidebar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Jokalala Code Analysis"
4. Click **Install**

#### Option B: From VSIX File

1. Download the `.vsix` file from [releases](https://github.com/jokalala/vscode-extension/releases)
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
4. Click the `...` menu (top-right) → **Install from VSIX...**
5. Select the downloaded `.vsix` file

### Step 2: Configure API Settings

#### Method 1: Using the Settings Command (Easiest)

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type and select: **Jokalala: Show Settings**
3. Enter your API endpoint and API key when prompted

#### Method 2: Using VS Code Settings UI

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "jokalala"
3. Configure the following:

   **Required Settings:**
   - **API Endpoint**: `https://api.jokalala.com/analyze` (or your custom endpoint)
   - **API Key**: Your personal API key from Jokalala dashboard

   **Optional Settings:**
   - **Analysis Mode**: `full` (comprehensive) or `quick` (faster)
   - **Auto Analyze**: Enable/disable automatic analysis on file save
   - **Show Inline Warnings**: Display warnings directly in the editor

#### Method 3: Using settings.json (Advanced)

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type and select: **Preferences: Open User Settings (JSON)**
3. Add the following configuration:

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "your-api-key-here",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true
}
```

**⚠️ Security Note**: API keys in `settings.json` will be automatically migrated to secure storage on first use.

### Step 3: Verify Installation

1. Open a code file (e.g., JavaScript, Python, etc.)
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run: **Jokalala: Analyze Current File**
4. Check the **Jokalala Issues** tree view in the Explorer sidebar

If you see analysis results, you're all set! 🎉

## 🔑 Getting Your API Key

### For Individual Developers

1. Visit [https://jokalala.com/signup](https://jokalala.com/signup)
2. Create a free account
3. Navigate to **Dashboard** → **API Keys**
4. Click **Generate New API Key**
5. Copy the key and paste it into VS Code settings

### For Teams & Organizations

1. Contact [sales@jokalala.com](mailto:sales@jokalala.com) for team licenses
2. Your organization admin will provide:
   - Custom API endpoint (if using private deployment)
   - Team API key or individual keys
3. Configure the extension with your team's endpoint and key

### For Self-Hosted Deployments

If you're running your own Jokalala backend:

1. Set your custom API endpoint:
   ```json
   {
     "jokalala.apiEndpoint": "https://your-domain.com/api/analyze"
   }
   ```

2. Generate API keys from your admin dashboard
3. Ensure your endpoint supports HTTPS (HTTP will trigger security warnings)

## ⚙️ Configuration Options

### Essential Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `jokalala.apiEndpoint` | *(required)* | Backend API endpoint URL |
| `jokalala.apiKey` | *(required)* | Your API authentication key |
| `jokalala.analysisMode` | `full` | Analysis depth: `quick` or `full` |
| `jokalala.autoAnalyze` | `true` | Auto-analyze files on save |

### Performance Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `jokalala.cacheEnabled` | `true` | Enable result caching |
| `jokalala.cacheTTL` | `3600000` | Cache lifetime (1 hour in ms) |
| `jokalala.maxCacheSize` | `100` | Maximum cached results |
| `jokalala.requestTimeout` | `30000` | API timeout (30 seconds) |

### Display Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `jokalala.showInlineWarnings` | `true` | Show warnings in editor |
| `jokalala.enableDiagnostics` | `true` | VS Code diagnostics integration |
| `jokalala.logLevel` | `info` | Logging: `debug`, `info`, `warn`, `error` |

### File Size Limits

| Setting | Default | Description |
|---------|---------|-------------|
| `jokalala.maxFileSize` | `200000` | Max file size (200KB) |
| `jokalala.maxProjectFiles` | `40` | Max files in project analysis |
| `jokalala.maxProjectFileSize` | `120000` | Max file size in project (120KB) |

### Advanced Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `jokalala.retryEnabled` | `true` | Retry failed requests |
| `jokalala.maxRetries` | `3` | Maximum retry attempts |
| `jokalala.retryDelay` | `1000` | Delay between retries (ms) |
| `jokalala.circuitBreakerEnabled` | `true` | Enable circuit breaker |
| `jokalala.circuitBreakerThreshold` | `5` | Failures before circuit opens |
| `jokalala.enableTelemetry` | `true` | Anonymous usage analytics |

## 🎯 Usage Examples

### Example 1: Analyze a Single File

1. Open a JavaScript file
2. Press `Ctrl+Alt+A` (or `Cmd+Alt+A` on Mac)
3. View results in the **Jokalala Issues** panel

### Example 2: Analyze Selected Code

1. Select a code block
2. Press `Ctrl+Alt+S` (or `Cmd+Alt+S` on Mac)
3. Review issues specific to your selection

### Example 3: Analyze Entire Project

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: **Jokalala: Analyze Project**
3. Wait for analysis to complete
4. Browse issues organized by severity

### Example 4: Apply Quick Fixes

1. Click on an issue in the **Jokalala Issues** panel
2. Click the lightbulb icon in the editor
3. Select **Apply suggestion**
4. The fix is automatically applied!

## 🌍 For Developers Worldwide

### Language Support

The extension analyzes code in multiple languages:
- JavaScript / TypeScript
- Python
- Java
- Go
- Rust
- C / C++
- C#
- PHP
- Ruby

### Localization

Currently available in English. More languages coming soon!

### Community & Support

- **Documentation**: [https://docs.jokalala.com](https://docs.jokalala.com)
- **GitHub**: [https://github.com/jokalala/vscode-extension](https://github.com/jokalala/vscode-extension)
- **Discord**: [Join our community](https://discord.gg/jokalala)
- **Stack Overflow**: Tag your questions with `jokalala`

## 🆓 Free Tier & Pricing

### Free Tier
- ✅ 100 analyses per month
- ✅ All supported languages
- ✅ Basic security checks
- ✅ Community support

### Pro Tier ($9/month)
- ✅ Unlimited analyses
- ✅ Advanced AI recommendations
- ✅ Priority support
- ✅ Team collaboration features

### Enterprise
- ✅ Self-hosted deployment
- ✅ Custom rules and policies
- ✅ SSO integration
- ✅ Dedicated support

Visit [https://jokalala.com/pricing](https://jokalala.com/pricing) for details.

## 🔒 Privacy & Security

- **Secure Storage**: API keys stored using VS Code's encrypted SecretStorage
- **HTTPS Only**: All API communication encrypted
- **No Code Storage**: Your code is analyzed in real-time, never stored
- **PII Anonymization**: File paths and sensitive data redacted from telemetry
- **Opt-out Telemetry**: Disable with `"jokalala.enableTelemetry": false`

## ❓ Troubleshooting

### "API Key Invalid" Error

**Solution**: Verify your API key is correct
1. Go to [https://jokalala.com/dashboard](https://jokalala.com/dashboard)
2. Copy your API key
3. Update in VS Code settings

### "Connection Failed" Error

**Solution**: Check your network and endpoint
1. Verify you have internet connectivity
2. Ensure API endpoint is correct
3. Check firewall/proxy settings
4. Try: `curl https://api.jokalala.com/health`

### Extension Not Activating

**Solution**: Check supported languages
1. Ensure you're editing a supported file type
2. Reload VS Code: `Developer: Reload Window`
3. Check Output panel: `View → Output → Jokalala Code Analysis`

### No Issues Detected

**Solution**: Adjust analysis settings
1. Set `"jokalala.analysisMode": "full"`
2. Clear cache: Run **Jokalala: Clear Cache**
3. Re-analyze the file

## 📚 Next Steps

- Read the [Full Documentation](README.md)
- Join our [Discord Community](https://discord.gg/jokalala)
- Star us on [GitHub](https://github.com/jokalala/vscode-extension)
- Share feedback: <feedback@jokalala.com>

---

**Happy Coding! 🚀**

