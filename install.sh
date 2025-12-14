#!/bin/bash

# VS Code Extension Installation Script
# This script builds and installs the Jokalala Code Analysis extension

set -e

echo "🔧 Building Jokalala Code Analysis VS Code Extension..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this from packages/vscode-code-analysis/"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
pnpm compile

# Package extension
echo "📦 Packaging extension..."
pnpm package

# Install extension
echo "🚀 Installing extension in VS Code..."
code --install-extension jokalala-code-analysis-1.0.0.vsix

echo ""
echo "✅ Installation complete!"
echo ""
echo "📖 Next steps:"
echo "  1. Reload VS Code (Ctrl+Shift+P → 'Developer: Reload Window')"
echo "  2. Configure API endpoint in Settings:"
echo "     - Search for 'Jokalala' in settings"
echo "     - Set API Endpoint to: http://localhost:3000/api/agents/dev-assistant"
echo "  3. Start your API service: pnpm dev"
echo "  4. Test: Ctrl+Shift+P → 'Jokalala: Analyze Current File'"
echo ""
