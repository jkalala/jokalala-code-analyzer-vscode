# Configuration Examples

This guide provides real-world configuration examples for different use cases.

## 🎯 Quick Configuration Scenarios

### Scenario 1: Individual Developer (Free Tier)

**Use Case**: Personal projects, learning, open-source contributions

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "jkl_free_your_key_here",
  "jokalala.analysisMode": "quick",
  "jokalala.autoAnalyze": true,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 7200000,
  "jokalala.maxFileSize": 1048576,
  "jokalala.enableTelemetry": true
}
```

**Why this works:**
- ✅ `quick` mode for faster results
- ✅ Auto-analyze on save for immediate feedback
- ✅ Caching enabled to stay within free tier limits
- ✅ 2-hour cache TTL reduces API calls

---

### Scenario 2: Professional Developer (Pro Tier)

**Use Case**: Commercial projects, unlimited analyses, advanced features

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "jkl_pro_your_key_here",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 3600000,
  "jokalala.maxCacheSize": 200,
  "jokalala.maxFileSize": 5242880,
  "jokalala.requestTimeout": 60000,
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 5,
  "jokalala.circuitBreakerEnabled": true,
  "jokalala.logLevel": "info"
}
```

**Why this works:**
- ✅ `full` mode for comprehensive analysis
- ✅ Larger file size limit (5MB)
- ✅ More retries for reliability
- ✅ Larger cache for better performance

---

### Scenario 3: Team/Enterprise (Self-Hosted)

**Use Case**: Custom deployment, private network, compliance requirements

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "https://jokalala.yourcompany.com/api/analyze",
  "jokalala.apiKey": "jkl_enterprise_team_key",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": false,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 86400000,
  "jokalala.maxCacheSize": 500,
  "jokalala.maxFileSize": 10485760,
  "jokalala.maxProjectFiles": 500,
  "jokalala.requestTimeout": 120000,
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 3,
  "jokalala.retryDelay": 2000,
  "jokalala.circuitBreakerEnabled": true,
  "jokalala.circuitBreakerThreshold": 10,
  "jokalala.enableTelemetry": false,
  "jokalala.logLevel": "debug"
}
```

**Why this works:**
- ✅ Custom API endpoint for private deployment
- ✅ Manual analysis (auto-analyze off) for control
- ✅ 24-hour cache for internal network
- ✅ Larger limits for enterprise projects
- ✅ Telemetry disabled for privacy
- ✅ Debug logging for troubleshooting

---

### Scenario 4: Performance-Focused (Large Projects)

**Use Case**: Monorepos, large codebases, performance-critical environments

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "jkl_your_key_here",
  "jokalala.analysisMode": "quick",
  "jokalala.autoAnalyze": false,
  "jokalala.showInlineWarnings": false,
  "jokalala.enableDiagnostics": false,
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 86400000,
  "jokalala.maxCacheSize": 1000,
  "jokalala.maxFileSize": 2097152,
  "jokalala.maxProjectFiles": 50,
  "jokalala.requestTimeout": 30000,
  "jokalala.retryEnabled": false,
  "jokalala.circuitBreakerEnabled": true,
  "jokalala.logLevel": "warn"
}
```

**Why this works:**
- ✅ Manual analysis only (no auto-analyze)
- ✅ Diagnostics disabled for performance
- ✅ Large cache with 24-hour TTL
- ✅ Limited project files to avoid overload
- ✅ Retries disabled for faster failures
- ✅ Minimal logging

---

### Scenario 5: Security-Focused (Maximum Detection)

**Use Case**: Security audits, compliance, critical applications

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "https://api.jokalala.com/analyze",
  "jokalala.apiKey": "jkl_your_key_here",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.cacheEnabled": false,
  "jokalala.maxFileSize": 10485760,
  "jokalala.requestTimeout": 120000,
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 5,
  "jokalala.retryDelay": 3000,
  "jokalala.circuitBreakerEnabled": false,
  "jokalala.logLevel": "debug"
}
```

**Why this works:**
- ✅ `full` mode for maximum detection
- ✅ Cache disabled for fresh analysis every time
- ✅ Large file size limit
- ✅ Extended timeout for thorough analysis
- ✅ Multiple retries for reliability
- ✅ Circuit breaker disabled (never skip analysis)
- ✅ Debug logging for audit trail

---

### Scenario 6: Development/Testing

**Use Case**: Extension development, testing, debugging

**Configuration:**

```json
{
  "jokalala.apiEndpoint": "http://localhost:3000/api/analyze",
  "jokalala.apiKey": "jkl_dev_test_key",
  "jokalala.analysisMode": "quick",
  "jokalala.autoAnalyze": false,
  "jokalala.showInlineWarnings": true,
  "jokalala.enableDiagnostics": true,
  "jokalala.cacheEnabled": false,
  "jokalala.maxFileSize": 524288,
  "jokalala.requestTimeout": 10000,
  "jokalala.retryEnabled": false,
  "jokalala.circuitBreakerEnabled": false,
  "jokalala.enableTelemetry": false,
  "jokalala.logLevel": "debug"
}
```

**Why this works:**
- ✅ Local endpoint for development
- ✅ Cache disabled for testing changes
- ✅ Manual analysis for controlled testing
- ✅ Short timeout for quick feedback
- ✅ No retries (fail fast)
- ✅ Debug logging for troubleshooting
- ✅ Telemetry disabled

---

## 🔧 Configuration by Language

### JavaScript/TypeScript Projects

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.maxFileSize": 2097152,
  "jokalala.autoAnalyze": true
}
```

### Python Projects

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.maxFileSize": 1048576,
  "jokalala.autoAnalyze": true
}
```

### Java Projects

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.maxFileSize": 5242880,
  "jokalala.maxProjectFiles": 200,
  "jokalala.requestTimeout": 60000
}
```

### Go Projects

```json
{
  "jokalala.analysisMode": "quick",
  "jokalala.maxFileSize": 1048576,
  "jokalala.autoAnalyze": true
}
```

---

## 🌐 Multi-Workspace Configuration

### Workspace-Specific Settings

Create `.vscode/settings.json` in your project root:

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": true,
  "jokalala.maxFileSize": 2097152
}
```

This overrides user settings for this workspace only.

### Team Settings (Shared)

Commit `.vscode/settings.json` to version control:

```json
{
  "jokalala.apiEndpoint": "https://team.jokalala.com/analyze",
  "jokalala.analysisMode": "full",
  "jokalala.autoAnalyze": false,
  "jokalala.showInlineWarnings": true
}
```

**Note**: Don't commit API keys! Use environment variables or user settings.

---

## 🔐 Secure API Key Management

### Method 1: User Settings (Recommended)

Store API key in user settings (auto-migrated to SecretStorage):

```json
{
  "jokalala.apiKey": "jkl_your_key_here"
}
```

### Method 2: Environment Variable

Set environment variable before launching VS Code:

```bash
# Linux/Mac
export JOKALALA_API_KEY="jkl_your_key_here"
code .

# Windows PowerShell
$env:JOKALALA_API_KEY="jkl_your_key_here"
code .
```

### Method 3: Command Palette

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: **Jokalala: Show Settings**
3. Enter API key when prompted (stored securely)

---

## 📊 Performance Tuning

### Optimize for Speed

```json
{
  "jokalala.analysisMode": "quick",
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 86400000,
  "jokalala.maxCacheSize": 500,
  "jokalala.requestTimeout": 15000
}
```

### Optimize for Accuracy

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.cacheEnabled": false,
  "jokalala.requestTimeout": 120000,
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 5
}
```

### Balance Speed and Accuracy

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 3600000,
  "jokalala.requestTimeout": 30000,
  "jokalala.retryEnabled": true,
  "jokalala.maxRetries": 3
}
```

---

## 🆘 Troubleshooting Configurations

### Issue: Too Many API Calls

**Solution**: Enable caching with longer TTL

```json
{
  "jokalala.cacheEnabled": true,
  "jokalala.cacheTTL": 7200000,
  "jokalala.autoAnalyze": false
}
```

### Issue: Slow Analysis

**Solution**: Use quick mode and reduce file size

```json
{
  "jokalala.analysisMode": "quick",
  "jokalala.maxFileSize": 524288,
  "jokalala.requestTimeout": 15000
}
```

### Issue: Missing Issues

**Solution**: Use full mode and disable cache

```json
{
  "jokalala.analysisMode": "full",
  "jokalala.cacheEnabled": false
}
```

---

**Need help? Check [GETTING_STARTED.md](GETTING_STARTED.md) or contact <support@jokalala.com>**

