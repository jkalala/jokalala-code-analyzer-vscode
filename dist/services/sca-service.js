"use strict";
/**
 * Software Composition Analysis (SCA) Service
 *
 * Provides dependency scanning, vulnerability detection, license compliance,
 * and SBOM generation capabilities for the VS Code extension.
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
exports.SCAService = void 0;
const vscode = __importStar(require("vscode"));
// =============================================================================
// SCA Service
// =============================================================================
class SCAService {
    constructor(configService, logger) {
        Object.defineProperty(this, "configService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "logger", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lastResult", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.configService = configService;
        this.logger = logger;
    }
    /**
     * Scan dependencies in the current workspace
     */
    async scanDependencies() {
        const startTime = Date.now();
        this.logger.info('[SCA] Starting dependency scan');
        try {
            // Find package manifest files
            const files = await this.findPackageFiles();
            if (files.length === 0) {
                return {
                    success: false,
                    ecosystem: 'unknown',
                    totalPackages: 0,
                    directPackages: 0,
                    transitivePackages: 0,
                    vulnerabilities: [],
                    vulnerabilitySummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0, fixable: 0 },
                    licenses: { total: 0, unique: [], risks: [], copyleftCount: 0 },
                    riskScore: 100,
                    dependencies: [],
                    scanDuration: Date.now() - startTime,
                    error: 'No package manifest files found (package.json, requirements.txt, pom.xml, etc.)',
                };
            }
            // Read file contents
            const fileContents = await Promise.all(files.map(async (uri) => ({
                path: uri.fsPath,
                content: (await vscode.workspace.fs.readFile(uri)).toString(),
            })));
            // Send to API for analysis
            const result = await this.callSCAApi(fileContents);
            this.lastResult = result;
            this.logger.info(`[SCA] Scan complete: ${result.totalPackages} packages, ${result.vulnerabilitySummary.total} vulnerabilities`);
            return result;
        }
        catch (error) {
            this.logger.error('[SCA] Scan failed', error);
            return {
                success: false,
                ecosystem: 'unknown',
                totalPackages: 0,
                directPackages: 0,
                transitivePackages: 0,
                vulnerabilities: [],
                vulnerabilitySummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0, fixable: 0 },
                licenses: { total: 0, unique: [], risks: [], copyleftCount: 0 },
                riskScore: 0,
                dependencies: [],
                scanDuration: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Generate SBOM (Software Bill of Materials)
     */
    async generateSBOM(format = 'cyclonedx') {
        this.logger.info(`[SCA] Generating SBOM in ${format} format`);
        try {
            const files = await this.findPackageFiles();
            if (files.length === 0) {
                return {
                    success: false,
                    format,
                    content: '',
                    filename: '',
                    error: 'No package manifest files found',
                };
            }
            const fileContents = await Promise.all(files.map(async (uri) => ({
                path: uri.fsPath,
                content: (await vscode.workspace.fs.readFile(uri)).toString(),
            })));
            const result = await this.callSBOMApi(fileContents, format);
            return result;
        }
        catch (error) {
            this.logger.error('[SCA] SBOM generation failed', error);
            return {
                success: false,
                format,
                content: '',
                filename: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Check licenses for compliance
     */
    async checkLicenses() {
        this.logger.info('[SCA] Checking license compliance');
        try {
            // Use cached result if available, otherwise scan
            if (!this.lastResult) {
                await this.scanDependencies();
            }
            if (!this.lastResult || !this.lastResult.success) {
                return {
                    success: false,
                    licenses: [],
                    compliant: true,
                    error: 'No scan results available',
                };
            }
            return {
                success: true,
                licenses: this.lastResult.licenses.risks,
                compliant: this.lastResult.licenses.risks.filter(r => r.risk === 'high').length === 0,
            };
        }
        catch (error) {
            return {
                success: false,
                licenses: [],
                compliant: true,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Get the last scan result
     */
    getLastResult() {
        return this.lastResult;
    }
    /**
     * Clear cached results
     */
    clearCache() {
        this.lastResult = null;
        this.logger.info('[SCA] Cache cleared');
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    async findPackageFiles() {
        const patterns = [
            // JavaScript/TypeScript
            '**/package.json',
            '**/package-lock.json',
            '**/yarn.lock',
            '**/pnpm-lock.yaml',
            // Python
            '**/requirements.txt',
            '**/requirements-*.txt',
            '**/Pipfile',
            '**/Pipfile.lock',
            '**/pyproject.toml',
            '**/poetry.lock',
            '**/setup.py',
            // Java
            '**/pom.xml',
            '**/build.gradle',
            '**/build.gradle.kts',
            '**/gradle.lockfile',
            // Go
            '**/go.mod',
            '**/go.sum',
            // Rust
            '**/Cargo.toml',
            '**/Cargo.lock',
            // Ruby
            '**/Gemfile',
            '**/Gemfile.lock',
            // PHP
            '**/composer.json',
            '**/composer.lock',
            // .NET
            '**/*.csproj',
            '**/packages.config',
        ];
        const excludePatterns = [
            '**/node_modules/**',
            '**/vendor/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/target/**',
        ];
        const allFiles = [];
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`, 10 // Limit to 10 files per pattern
            );
            allFiles.push(...files);
        }
        // Remove duplicates
        const uniquePaths = new Set();
        return allFiles.filter((uri) => {
            if (uniquePaths.has(uri.fsPath)) {
                return false;
            }
            uniquePaths.add(uri.fsPath);
            return true;
        });
    }
    async callSCAApi(files) {
        const settings = this.configService.getSettings();
        const apiEndpoint = `${settings.apiEndpoint}/sca-scan`;
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Jokalala-VSCode-Extension',
            },
            body: JSON.stringify({
                files,
                options: {
                    includeDevDependencies: true,
                    includeTransitive: true,
                    checkOutdated: false,
                    checkLicenses: true,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'SCA scan failed');
        }
        const result = data.data;
        return {
            success: true,
            ecosystem: result.ecosystem,
            totalPackages: result.totalPackages,
            directPackages: result.directPackages,
            transitivePackages: result.transitivePackages,
            vulnerabilities: result.vulnerabilities.map((v) => ({
                id: v.id,
                severity: v.severity,
                title: v.title,
                description: v.description,
                packageName: v.package.name,
                packageVersion: v.package.version,
                fixVersion: v.fixVersion,
                fixAvailable: v.fixAvailable,
                cvssScore: v.cvssScore,
                cwe: v.cwe,
                references: v.references || [],
                cisaKev: v.cisaKev,
            })),
            vulnerabilitySummary: result.vulnerabilitySummary,
            licenses: {
                total: result.licenses.total,
                unique: result.licenses.unique,
                risks: result.licenses.risks.high.map((l) => ({
                    license: l.spdxId || l.name,
                    risk: 'high',
                    packages: [],
                    issue: 'Copyleft license may require source disclosure',
                })),
                copyleftCount: result.licenses.copyleftPackages?.length || 0,
            },
            riskScore: result.riskScore,
            dependencies: result.dependencies.map((d) => ({
                name: d.name,
                version: d.version,
                ecosystem: d.ecosystem,
                type: d.type,
                license: d.license,
                deprecated: d.deprecated,
                purl: d.purl,
            })),
            scanDuration: result.duration,
        };
    }
    async callSBOMApi(files, format) {
        const settings = this.configService.getSettings();
        const apiEndpoint = `${settings.apiEndpoint}/sca-scan`;
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Jokalala-VSCode-Extension',
            },
            body: JSON.stringify({
                files,
                sbomOnly: true,
                sbomFormat: format,
                outputFormat: 'json',
            }),
        });
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'SBOM generation failed');
        }
        const extension = format === 'cyclonedx' ? 'cdx.json' : 'spdx.json';
        const workspaceName = vscode.workspace.name || 'project';
        return {
            success: true,
            format,
            content: data.sbom,
            filename: `${workspaceName}.${extension}`,
        };
    }
    /**
     * Show vulnerability details in a webview panel
     */
    showVulnerabilityDetails(vulnerability) {
        const panel = vscode.window.createWebviewPanel('scaVulnerability', `Vulnerability: ${vulnerability.id}`, vscode.ViewColumn.Two, { enableScripts: false });
        const severityColors = {
            critical: '#dc2626',
            high: '#ea580c',
            medium: '#ca8a04',
            low: '#16a34a',
            info: '#2563eb',
        };
        panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          h1 { color: ${severityColors[vulnerability.severity]}; }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            color: white;
            background: ${severityColors[vulnerability.severity]};
            font-weight: bold;
          }
          .section { margin: 20px 0; }
          .label { font-weight: bold; color: var(--vscode-foreground); }
          pre { background: var(--vscode-editor-background); padding: 10px; border-radius: 4px; overflow-x: auto; }
          a { color: var(--vscode-textLink-foreground); }
          .kev-warning { background: #fef2f2; border: 1px solid #dc2626; padding: 10px; border-radius: 4px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>${vulnerability.id}</h1>
        <span class="badge">${vulnerability.severity.toUpperCase()}</span>
        ${vulnerability.cvssScore ? `<span style="margin-left: 10px;">CVSS: ${vulnerability.cvssScore}</span>` : ''}
        ${vulnerability.cisaKev ? '<div class="kev-warning">⚠️ This vulnerability is in the CISA Known Exploited Vulnerabilities catalog</div>' : ''}

        <div class="section">
          <div class="label">Package</div>
          <p>${vulnerability.packageName}@${vulnerability.packageVersion}</p>
        </div>

        <div class="section">
          <div class="label">Title</div>
          <p>${vulnerability.title}</p>
        </div>

        <div class="section">
          <div class="label">Description</div>
          <p>${vulnerability.description}</p>
        </div>

        ${vulnerability.fixVersion ? `
        <div class="section">
          <div class="label">Fix Available</div>
          <p>Update to version <strong>${vulnerability.fixVersion}</strong></p>
        </div>
        ` : ''}

        ${vulnerability.cwe && vulnerability.cwe.length > 0 ? `
        <div class="section">
          <div class="label">CWE</div>
          <p>${vulnerability.cwe.join(', ')}</p>
        </div>
        ` : ''}

        ${vulnerability.references.length > 0 ? `
        <div class="section">
          <div class="label">References</div>
          <ul>
            ${vulnerability.references.slice(0, 5).map(r => `<li><a href="${r}">${r}</a></li>`).join('')}
          </ul>
        </div>
        ` : ''}
      </body>
      </html>
    `;
    }
}
exports.SCAService = SCAService;
//# sourceMappingURL=sca-service.js.map