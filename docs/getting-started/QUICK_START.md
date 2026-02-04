# ⚡ Quick Start Guide - Jokalala Code Analysis Extension

Get up and running in 5 minutes!

---

## 🚀 **5-Minute Setup**

### **1. Get Your API Key** (2 minutes)

1. **Login**: https://www.jokalala.com/login
2. **Navigate**: Click profile dropdown → "API Keys"
3. **Create**: Click "+ Create New API Key"
4. **Name it**: e.g., "VS Code Extension"
5. **Copy**: Click "Copy to Clipboard" ⚠️ (shown only once!)

---

### **2. Install Extension** (1 minute)

**Option A - From VSIX:**
```bash
code --install-extension jokalala-code-analysis-1.0.0.vsix
```

**Option B - Manual:**
1. Open VS Code
2. Press `Ctrl+Shift+P`
3. Type: "Extensions: Install from VSIX..."
4. Select the `.vsix` file

---

### **3. Configure** (1 minute)

1. Press `Ctrl+,` to open Settings
2. Search for "Jokalala"
3. Paste your API key in **"Jokalala: Api Key"**

**Or add to `settings.json`:**
```json
{
  "jokalala.apiKey": "jkl_free_abc123...",
  "jokalala.apiEndpoint": "https://www.jokalala.com/api/analyze",
  "jokalala.autoAnalyze": true,
  "jokalala.analysisMode": "quick"
}
```

---

### **4. Test** (1 minute)

1. Open any code file
2. Press `Ctrl+Shift+P`
3. Type: "Jokalala: Analyze Current File"
4. View results in sidebar panels

---

## 📊 **What You Get**

### **3 Sidebar Panels:**

1. **📋 Issues** - Code problems and warnings
2. **💡 Recommendations** - AI-powered suggestions
3. **📊 Metrics** - Code quality metrics

### **Analysis Modes:**

- **Quick** (default): Fast analysis, basic checks (~2-3 seconds)
- **Full**: Comprehensive analysis (~5-10 seconds)
- **Deep**: In-depth AI analysis (~15-30 seconds)

---

## 🎯 **Common Commands**

| Command | Shortcut | Description |
|---------|----------|-------------|
| Analyze Current File | `Ctrl+Shift+P` → "Jokalala: Analyze..." | Run analysis on active file |
| Clear Results | `Ctrl+Shift+P` → "Jokalala: Clear..." | Clear all analysis results |
| View Issues | Click "Issues" panel | See all detected issues |
| View Recommendations | Click "Recommendations" panel | See AI suggestions |
| View Metrics | Click "Metrics" panel | See code quality metrics |

---

## ⚙️ **Essential Settings**

```json
{
  // Required
  "jokalala.apiKey": "YOUR_API_KEY",
  
  // Optional (with defaults)
  "jokalala.autoAnalyze": true,           // Auto-analyze on save
  "jokalala.analysisMode": "quick",       // quick | full | deep
  "jokalala.enableSecurityChecks": true,  // Security analysis
  "jokalala.enablePerformanceChecks": true, // Performance analysis
  "jokalala.maxIssuesPerFile": 100        // Max issues to show
}
```

---

## 🔧 **Troubleshooting**

### **"Unauthorized" Error**
- ✅ Check API key is correct (starts with `jkl_`)
- ✅ No extra spaces before/after key
- ✅ Account is approved

### **"Quota Exceeded" Error**
- ✅ Check usage: https://www.jokalala.com/dashboard/user/api-keys
- ✅ Upgrade to Pro for 10,000 requests/month

### **No Results**
- ✅ Check Output panel: View → Output → "Jokalala Code Analysis"
- ✅ Reload VS Code: `Ctrl+Shift+P` → "Reload Window"

---

## 💳 **Subscription Tiers**

| Tier | Quota | Price |
|------|-------|-------|
| **Free** | 100/month | $0 |
| **Pro** | 10,000/month | $9 |
| **Enterprise** | Unlimited | Custom |

**Upgrade**: https://www.jokalala.com/dashboard/user/subscription

---

## 📚 **Learn More**

- **Full Setup Guide**: `API_KEY_SETUP_GUIDE.md`
- **Configuration Examples**: `CONFIGURATION_EXAMPLES.md`
- **Getting Started**: `GETTING_STARTED.md`
- **README**: `README.md`

---

## 🎉 **You're Ready!**

Start analyzing your code with AI-powered insights!

**Next Steps:**
1. Open a code file
2. Save it (auto-analyze triggers)
3. View results in sidebar
4. Apply recommendations
5. Improve code quality! 🚀

---

**Need Help?**
- 📧 Email: support@jokalala.com
- 🌐 Docs: https://www.jokalala.com/docs
- 💬 Issues: https://github.com/jkalala/jokalala/issues

