# VS Code Extension Installation Script (PowerShell)
# This script builds and installs the Jokalala Code Analysis extension

$ErrorActionPreference = "Stop"

Write-Host "🔧 Building Jokalala Code Analysis VS Code Extension..." -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found. Please run this from packages/vscode-code-analysis/" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

# Compile TypeScript
Write-Host "🔨 Compiling TypeScript..." -ForegroundColor Yellow
pnpm compile

# Package extension
Write-Host "📦 Packaging extension..." -ForegroundColor Yellow
pnpm package

# Install extension
Write-Host "🚀 Installing extension in VS Code..." -ForegroundColor Yellow
code --install-extension jokalala-code-analysis-1.0.0.vsix

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Reload VS Code (Ctrl+Shift+P -> Developer: Reload Window)"
Write-Host "  2. Configure API endpoint in Settings:"
Write-Host "     - Search for 'Jokalala' in settings"
Write-Host "     - Set API Endpoint to: http://localhost:3000/api/agents/dev-assistant"
Write-Host "  3. Start your API service: pnpm dev"
Write-Host "  4. Test: Ctrl+Shift+P -> Jokalala: Analyze Current File"
Write-Host ""
