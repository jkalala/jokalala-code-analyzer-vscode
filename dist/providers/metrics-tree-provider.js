"use strict";
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
exports.MetricsTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class MetricsTreeProvider {
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
        Object.defineProperty(this, "metrics", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
    }
    updateMetrics(metrics) {
        console.log('MetricsTreeProvider: updateMetrics called with:', JSON.stringify(metrics, null, 2));
        this.metrics = metrics;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        console.log('MetricsTreeProvider: getChildren called');
        if (!this.metrics || Object.keys(this.metrics).length === 0) {
            console.log('MetricsTreeProvider: No metrics available');
            return Promise.resolve([]);
        }
        const items = [
            new MetricTreeItem(`Overall Score: ${this.metrics.overallScore ?? 0}/100`, 'overall'),
            new MetricTreeItem(`Total Issues: ${this.metrics.totalIssues ?? 0}`, 'issues'),
            new MetricTreeItem(`Critical Issues: ${this.metrics.criticalIssues ?? 0}`, 'critical'),
        ];
        // Only add these if they exist and are numbers
        if (typeof this.metrics.securityScore === 'number') {
            items.push(new MetricTreeItem(`Security Score: ${this.metrics.securityScore}/100`, 'security'));
        }
        if (typeof this.metrics.qualityScore === 'number') {
            items.push(new MetricTreeItem(`Quality Score: ${this.metrics.qualityScore}/100`, 'quality'));
        }
        if (typeof this.metrics.performanceScore === 'number') {
            items.push(new MetricTreeItem(`Performance Score: ${this.metrics.performanceScore}/100`, 'performance'));
        }
        // Add severity breakdown
        if (this.metrics.highSeverityIssues !== undefined) {
            items.push(new MetricTreeItem(`High Severity: ${this.metrics.highSeverityIssues}`, 'issues'));
        }
        if (this.metrics.mediumSeverityIssues !== undefined) {
            items.push(new MetricTreeItem(`Medium Severity: ${this.metrics.mediumSeverityIssues}`, 'issues'));
        }
        if (this.metrics.lowSeverityIssues !== undefined) {
            items.push(new MetricTreeItem(`Low Severity: ${this.metrics.lowSeverityIssues}`, 'issues'));
        }
        // Add code quality if available
        if (this.metrics.codeQuality) {
            items.push(new MetricTreeItem(`Code Quality: ${this.metrics.codeQuality}`, 'quality'));
        }
        if (this.metrics.securityRisk) {
            items.push(new MetricTreeItem(`Security Risk: ${this.metrics.securityRisk}`, 'security'));
        }
        console.log('MetricsTreeProvider: Returning', items.length, 'metric items');
        return Promise.resolve(items);
    }
}
exports.MetricsTreeProvider = MetricsTreeProvider;
class MetricTreeItem extends vscode.TreeItem {
    constructor(label, type) {
        super(label, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: type
        });
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "collapsibleState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.label = label;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this.iconPath = new vscode.ThemeIcon(this.getIcon(type));
    }
    getIcon(type) {
        switch (type) {
            case 'overall':
                return 'dashboard';
            case 'issues':
                return 'bug';
            case 'critical':
                return 'error';
            case 'security':
                return 'shield';
            case 'quality':
                return 'check';
            case 'performance':
                return 'zap';
            default:
                return 'circle-outline';
        }
    }
}
//# sourceMappingURL=metrics-tree-provider.js.map