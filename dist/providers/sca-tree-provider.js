"use strict";
/**
 * SCA Tree Provider
 *
 * Displays Software Composition Analysis results in the VS Code sidebar,
 * including dependencies, vulnerabilities, and license information.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCATreeProvider = void 0;
exports.registerSCATreeView = registerSCATreeView;
const vscode = __importStar(require("vscode"));
// =============================================================================
// Tree Item Classes
// =============================================================================
class CategoryItem extends vscode.TreeItem {
    constructor(label, itemCount, category) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        Object.defineProperty(this, "itemCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "category", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.itemCount = itemCount;
        this.category = category;
        this.description = `(${itemCount})`;
        this.contextValue = `sca-category-${category}`;
        switch (category) {
            case 'vulnerabilities':
                this.iconPath = new vscode.ThemeIcon('shield');
                break;
            case 'dependencies':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'licenses':
                this.iconPath = new vscode.ThemeIcon('law');
                break;
            case 'summary':
                this.iconPath = new vscode.ThemeIcon('graph');
                break;
        }
    }
}
class SummaryItem extends vscode.TreeItem {
    constructor(label, value, severity) {
        super(label, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.value = value;
        this.description = value;
        this.contextValue = 'sca-summary';
        if (severity) {
            const colors = {
                critical: 'errorForeground',
                high: 'errorForeground',
                medium: 'warningForeground',
                low: 'foreground',
                info: 'foreground',
            };
            const iconName = severity === 'critical' || severity === 'high' ? 'error' : 'info';
            const colorName = colors[severity];
            this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(colorName));
        }
    }
}
class VulnerabilityItem extends vscode.TreeItem {
    constructor(vulnerability) {
        super(vulnerability.id, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "vulnerability", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: vulnerability
        });
        this.description = `${vulnerability.packageName}@${vulnerability.packageVersion}`;
        this.tooltip = new vscode.MarkdownString(`**${vulnerability.title}**\n\n` +
            `**Severity:** ${vulnerability.severity.toUpperCase()}\n\n` +
            `**Package:** ${vulnerability.packageName}@${vulnerability.packageVersion}\n\n` +
            `${vulnerability.description.substring(0, 200)}...`);
        this.contextValue = vulnerability.fixAvailable
            ? 'sca-vulnerability-fixable'
            : 'sca-vulnerability';
        // Set icon based on severity
        const icons = {
            critical: ['error', 'errorForeground'],
            high: ['warning', 'errorForeground'],
            medium: ['warning', 'warningForeground'],
            low: ['info', 'foreground'],
            info: ['info', 'foreground'],
        };
        const [icon, color] = icons[vulnerability.severity] || ['info', 'foreground'];
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
        // Add CISA KEV badge
        if (vulnerability.cisaKev) {
            this.description += ' 🚨 KEV';
        }
        // Command to show details
        this.command = {
            command: 'jokalala.showSCAVulnerabilityDetails',
            title: 'Show Details',
            arguments: [vulnerability],
        };
    }
}
class DependencyItem extends vscode.TreeItem {
    constructor(dependency) {
        super(dependency.name, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "dependency", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: dependency
        });
        this.description = dependency.version;
        this.tooltip = new vscode.MarkdownString(`**${dependency.name}@${dependency.version}**\n\n` +
            `**Type:** ${dependency.type}\n` +
            `**Ecosystem:** ${dependency.ecosystem}\n` +
            (dependency.license ? `**License:** ${dependency.license}\n` : '') +
            (dependency.deprecated ? '\n⚠️ **Deprecated**' : ''));
        this.contextValue = dependency.deprecated
            ? 'sca-dependency-deprecated'
            : 'sca-dependency';
        // Icon based on type
        const icons = {
            direct: 'package',
            dev: 'beaker',
            transitive: 'references',
            optional: 'question',
            peer: 'link',
        };
        this.iconPath = new vscode.ThemeIcon(icons[dependency.type] || 'package');
        // Mark deprecated packages
        if (dependency.deprecated) {
            this.description += ' ⚠️ deprecated';
        }
    }
}
class LicenseItem extends vscode.TreeItem {
    constructor(license) {
        super(license.license, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "license", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: license
        });
        this.description = `${license.risk} risk`;
        this.tooltip = new vscode.MarkdownString(`**${license.license}**\n\n` +
            `**Risk Level:** ${license.risk.toUpperCase()}\n\n` +
            (license.issue ? `**Issue:** ${license.issue}` : ''));
        this.contextValue = `sca-license-${license.risk}`;
        // Icon based on risk
        const icons = {
            high: ['warning', 'errorForeground'],
            medium: ['info', 'warningForeground'],
            low: ['check', 'foreground'],
            unknown: ['question', 'foreground'],
        };
        const [icon, color] = icons[license.risk] || ['question', 'foreground'];
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    }
}
// =============================================================================
// Tree Data Provider
// =============================================================================
class SCATreeProvider {
    constructor() {
        Object.defineProperty(this, "_onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new vscode.EventEmitter()
        });
        Object.defineProperty(this, "onDidChangeTreeData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this._onDidChangeTreeData.event
        });
        Object.defineProperty(this, "result", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "isLoading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "error", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
    }
    setLoading(loading) {
        this.isLoading = loading;
        this.error = null;
        this._onDidChangeTreeData.fire();
    }
    setError(error) {
        this.error = error;
        this.isLoading = false;
        this._onDidChangeTreeData.fire();
    }
    updateResult(result) {
        this.result = result;
        this.isLoading = false;
        this.error = null;
        this._onDidChangeTreeData.fire();
    }
    clear() {
        this.result = null;
        this.error = null;
        this.isLoading = false;
        this._onDidChangeTreeData.fire();
    }
    getResult() {
        return this.result;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (this.isLoading) {
            return [new SummaryItem('Scanning dependencies...', '', undefined)];
        }
        if (this.error) {
            return [new SummaryItem('Error', this.error, 'high')];
        }
        if (!this.result) {
            return [
                new SummaryItem('No scan results', 'Run "Jokalala: Scan Dependencies" to start', undefined),
            ];
        }
        // Root level - show categories
        if (!element) {
            return [
                new CategoryItem('Summary', 5, 'summary'),
                new CategoryItem('Vulnerabilities', this.result.vulnerabilitySummary.total, 'vulnerabilities'),
                new CategoryItem('Dependencies', this.result.totalPackages, 'dependencies'),
                new CategoryItem('Licenses', this.result.licenses.unique.length, 'licenses'),
            ];
        }
        // Category children
        if (element instanceof CategoryItem) {
            switch (element.category) {
                case 'summary':
                    return this.getSummaryItems();
                case 'vulnerabilities':
                    return this.getVulnerabilityItems();
                case 'dependencies':
                    return this.getDependencyItems();
                case 'licenses':
                    return this.getLicenseItems();
            }
        }
        return [];
    }
    getSummaryItems() {
        if (!this.result)
            return [];
        const items = [
            new SummaryItem('Risk Score', `${this.result.riskScore}/100`, undefined),
            new SummaryItem('Ecosystem', this.result.ecosystem, undefined),
            new SummaryItem('Total Packages', `${this.result.totalPackages} (${this.result.directPackages} direct)`, undefined),
        ];
        const { critical, high, medium, low } = this.result.vulnerabilitySummary;
        if (critical > 0) {
            items.push(new SummaryItem('Critical Vulnerabilities', critical.toString(), 'critical'));
        }
        if (high > 0) {
            items.push(new SummaryItem('High Vulnerabilities', high.toString(), 'high'));
        }
        if (medium > 0) {
            items.push(new SummaryItem('Medium Vulnerabilities', medium.toString(), 'medium'));
        }
        if (low > 0) {
            items.push(new SummaryItem('Low Vulnerabilities', low.toString(), 'low'));
        }
        if (this.result.licenses.copyleftCount > 0) {
            items.push(new SummaryItem('Copyleft Licenses', this.result.licenses.copyleftCount.toString(), 'medium'));
        }
        return items;
    }
    getVulnerabilityItems() {
        if (!this.result)
            return [];
        // Sort by severity (critical first)
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return this.result.vulnerabilities
            .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
            .map((v) => new VulnerabilityItem(v));
    }
    getDependencyItems() {
        if (!this.result)
            return [];
        // Sort: direct first, then by name
        const typeOrder = { direct: 0, dev: 1, peer: 2, optional: 3, transitive: 4 };
        return this.result.dependencies
            .sort((a, b) => {
            const typeDiff = typeOrder[a.type] - typeOrder[b.type];
            if (typeDiff !== 0)
                return typeDiff;
            return a.name.localeCompare(b.name);
        })
            .slice(0, 100) // Limit to 100 dependencies for performance
            .map((d) => new DependencyItem(d));
    }
    getLicenseItems() {
        if (!this.result)
            return [];
        // Create license items from unique licenses and risks
        const riskLicenses = this.result.licenses.risks;
        // Add unknown risk items for other licenses
        const knownLicenses = new Set(riskLicenses.map((r) => r.license));
        const unknownLicenses = this.result.licenses.unique
            .filter((l) => !knownLicenses.has(l))
            .map((l) => ({ license: l, risk: 'unknown', packages: [] }));
        return [...riskLicenses, ...unknownLicenses]
            .sort((a, b) => {
            const riskOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
            return riskOrder[a.risk] - riskOrder[b.risk];
        })
            .map((l) => new LicenseItem(l));
    }
}
exports.SCATreeProvider = SCATreeProvider;
// =============================================================================
// Registration Helper
// =============================================================================
function registerSCATreeView(context, provider) {
    const treeView = vscode.window.createTreeView('jokalala-sca', {
        treeDataProvider: provider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    return treeView;
}
//# sourceMappingURL=sca-tree-provider.js.map