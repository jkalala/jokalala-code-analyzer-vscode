# 🔑 API Key Setup Guide for Jokalala Code Analysis Extension

Complete guide to generating and using API keys with the Jokalala VS Code Extension.

---

## 📋 **Table of Contents**

1. [Prerequisites](#prerequisites)
2. [Generate Your API Key](#generate-your-api-key)
3. [Install the Extension](#install-the-extension)
4. [Configure the Extension](#configure-the-extension)
5. [Verify Installation](#verify-installation)
6. [Troubleshooting](#troubleshooting)
7. [Subscription Tiers](#subscription-tiers)

---

## ✅ **Prerequisites**

Before you begin, make sure you have:

- ✅ **Jokalala Account**: Register at https://www.jokalala.com/register
- ✅ **Account Approval**: Wait for admin approval (you'll receive an email)
- ✅ **VS Code**: Version 1.85.0 or higher
- ✅ **Internet Connection**: Required for API communication

---

## 🔑 **Generate Your API Key**

### **Step 1: Log In**

1. Go to **https://www.jokalala.com/login**
2. Enter your email and password
3. Click **"Sign In"**

### **Step 2: Navigate to API Keys Page**

**Option A - Via Dropdown Menu:**
1. Click your **profile dropdown** (top right corner)
2. Click **"API Keys"**

**Option B - Direct URL:**
- Go to: **https://www.jokalala.com/dashboard/user/api-keys**

### **Step 3: Create API Key**

1. Click the **"+ Create New API Key"** button (top right)
2. A dialog will open with a form:
   - **Name** (required): Give your key a descriptive name
     - Example: "My Development Key" or "VS Code Extension"
   - **Description** (optional): Add notes about the key's purpose
     - Example: "For my personal projects" or "Work laptop"
3. Click **"Create Key"** button

### **Step 4: Copy Your API Key**

⚠️ **IMPORTANT: This is the only time you'll see the full API key!**

1. The dialog will show your generated API key
2. Click the **"Copy to Clipboard"** button
3. **Save it securely** (password manager, secure notes, etc.)
4. Click **"Done"** when finished

**API Key Format:**
```
jkl_free_abc123def456ghi789...
```

---

## 📦 **Install the Extension**

### **Option 1: Install from VSIX File**

1. Download the extension file: `jokalala-code-analysis-1.0.0.vsix`
2. Open VS Code
3. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
4. Type: **"Extensions: Install from VSIX..."**
5. Select the downloaded `.vsix` file
6. Click **"Install"**
7. Reload VS Code when prompted

### **Option 2: Install via Command Line**

```bash
code --install-extension jokalala-code-analysis-1.0.0.vsix
```

### **Option 3: Use Install Script**

**Windows (PowerShell):**
```powershell
cd packages/vscode-code-analysis
.\install.ps1
```

**Linux/Mac:**
```bash
cd packages/vscode-code-analysis
chmod +x install.sh
./install.sh
```

---

## ⚙️ **Configure the Extension**

### **Step 1: Open VS Code Settings**

**Option A - UI:**
1. Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)
2. Search for **"Jokalala"**

**Option B - JSON:**
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: **"Preferences: Open User Settings (JSON)"**
3. Add the configuration below

### **Step 2: Add Your API Key**

Add this to your `settings.json`:

```json
{
  "jokalala.apiKey": "YOUR_API_KEY_HERE",
  "jokalala.apiEndpoint": "https://www.jokalala.com/api/analyze",
  "jokalala.autoAnalyze": true,
  "jokalala.analysisMode": "quick"
}
```

**Replace `YOUR_API_KEY_HERE` with your actual API key!**

### **Configuration Options**

| Setting | Description | Default | Options |
|---------|-------------|---------|---------|
| `jokalala.apiKey` | Your API key | `""` | Your generated key |
| `jokalala.apiEndpoint` | API endpoint URL | Production URL | Custom URL |
| `jokalala.autoAnalyze` | Auto-analyze on save | `true` | `true` / `false` |
| `jokalala.analysisMode` | Analysis depth | `"quick"` | `"quick"` / `"full"` / `"deep"` |
| `jokalala.enableSecurityChecks` | Security analysis | `true` | `true` / `false` |
| `jokalala.enablePerformanceChecks` | Performance analysis | `true` | `true` / `false` |
| `jokalala.maxIssuesPerFile` | Max issues to show | `100` | Any number |

---

## ✅ **Verify Installation**

### **Step 1: Check Extension is Active**

1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac)
3. Search for **"Jokalala Code Analysis"**
4. Verify it shows **"Enabled"**

### **Step 2: Test Analysis**

1. Open any code file (JavaScript, TypeScript, Python, etc.)
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type: **"Jokalala: Analyze Current File"**
4. Press Enter

**Expected Result:**
- Analysis starts (you'll see a progress notification)
- Results appear in the **Jokalala** panels (sidebar)
- Issues, recommendations, and metrics are displayed

### **Step 3: View Results**

The extension adds 3 panels to your sidebar:

1. **📋 Issues** - Code issues and warnings
2. **💡 Recommendations** - AI-powered suggestions
3. **📊 Metrics** - Code quality metrics

---

## 🔧 **Troubleshooting**

### **"Unauthorized" Error**

**Problem:** API key is invalid or missing

**Solutions:**
1. Verify you copied the entire API key (starts with `jkl_`)
2. Check for extra spaces before/after the key
3. Regenerate a new API key if the old one was revoked
4. Make sure your account is approved

### **"Quota Exceeded" Error**

**Problem:** You've used all your monthly requests

**Solutions:**
1. Check your usage at: https://www.jokalala.com/dashboard/user/api-keys
2. Wait until your quota resets (shown on the page)
3. Upgrade to Pro/Enterprise for higher limits

### **"Connection Failed" Error**

**Problem:** Cannot reach the API endpoint

**Solutions:**
1. Check your internet connection
2. Verify the API endpoint URL is correct
3. Check if firewall is blocking the connection
4. Try disabling VPN temporarily

### **No Results Showing**

**Problem:** Analysis completes but no results appear

**Solutions:**
1. Check the **Output** panel (View → Output → Jokalala Code Analysis)
2. Look for error messages in the logs
3. Try reloading VS Code (`Ctrl+Shift+P` → "Reload Window")
4. Verify the file type is supported

---

## 💳 **Subscription Tiers**

| Tier | Monthly Quota | Price | Best For |
|------|---------------|-------|----------|
| **Free** | 100 requests | $0/month | Personal projects, testing |
| **Pro** | 10,000 requests | $9/month | Professional developers |
| **Enterprise** | Unlimited | Custom | Teams and organizations |

### **Upgrade Your Subscription**

1. Go to: https://www.jokalala.com/dashboard/user/subscription
2. Click **"Upgrade to Pro"** or **"Contact Sales"** for Enterprise
3. Complete payment via Paddle (supports 200+ countries)
4. Your new quota is active immediately

---

## 📚 **Additional Resources**

- **Extension README**: `packages/vscode-code-analysis/README.md`
- **Getting Started Guide**: `packages/vscode-code-analysis/GETTING_STARTED.md`
- **Configuration Examples**: `packages/vscode-code-analysis/CONFIGURATION_EXAMPLES.md`
- **API Documentation**: https://www.jokalala.com/docs/api
- **Support**: support@jokalala.com

---

## 🎉 **You're All Set!**

Your Jokalala Code Analysis extension is now configured and ready to use!

**Quick Start:**
1. Open a code file
2. Save it (if auto-analyze is enabled)
3. View results in the Jokalala sidebar panels

**Happy Coding! 🚀**

