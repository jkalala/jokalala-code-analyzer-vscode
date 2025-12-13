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
exports.RecommendationsTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class RecommendationsTreeProvider {
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
        Object.defineProperty(this, "recommendations", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    updateRecommendations(recommendations) {
        this.recommendations = recommendations;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return Promise.resolve(this.recommendations.map(rec => new RecommendationTreeItem(rec)));
    }
}
exports.RecommendationsTreeProvider = RecommendationsTreeProvider;
class RecommendationTreeItem extends vscode.TreeItem {
    constructor(recommendation) {
        super(recommendation.title, vscode.TreeItemCollapsibleState.None);
        Object.defineProperty(this, "recommendation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: recommendation
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
        this.label = recommendation.title;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this.tooltip = `${recommendation.title}\n\n${recommendation.description}`;
        this.description = recommendation.category;
        this.iconPath = new vscode.ThemeIcon('lightbulb');
    }
}
//# sourceMappingURL=recommendations-tree-provider.js.map