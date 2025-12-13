/**
 * Software Composition Analysis (SCA) Service
 *
 * Provides dependency scanning, vulnerability detection, license compliance,
 * and SBOM generation capabilities for the VS Code extension.
 */

import * as vscode from 'vscode'
import { ConfigurationService } from './configuration-service'
import { Logger } from './logger'

// =============================================================================
// Types
// =============================================================================

export interface SCADependency {
  name: string
  version: string
  ecosystem: string
  type: 'direct' | 'dev' | 'transitive' | 'optional' | 'peer'
  license?: string
  deprecated?: boolean
  purl?: string
}

export interface SCAVulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string
  packageName: string
  packageVersion: string
  fixVersion?: string
  fixAvailable: boolean
  cvssScore?: number
  cwe?: string[]
  references: string[]
  cisaKev?: boolean
}

export interface LicenseRisk {
  license: string
  risk: 'high' | 'medium' | 'low' | 'unknown'
  packages: string[]
  issue?: string
}

export interface SCAScanResult {
  success: boolean
  ecosystem: string
  totalPackages: number
  directPackages: number
  transitivePackages: number
  vulnerabilities: SCAVulnerability[]
  vulnerabilitySummary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
    fixable: number
  }
  licenses: {
    total: number
    unique: string[]
    risks: LicenseRisk[]
    copyleftCount: number
  }
  riskScore: number
  dependencies: SCADependency[]
  scanDuration: number
  error?: string
}

export interface SBOMResult {
  success: boolean
  format: 'cyclonedx' | 'spdx'
  content: string
  filename: string
  error?: string
}

// =============================================================================
// SCA Service
// =============================================================================

export class SCAService {
  private configService: ConfigurationService
  private logger: Logger
  private lastResult: SCAScanResult | null = null

  constructor(configService: ConfigurationService, logger: Logger) {
    this.configService = configService
    this.logger = logger
  }

  /**
   * Scan dependencies in the current workspace
   */
  async scanDependencies(): Promise<SCAScanResult> {
    const startTime = Date.now()
    this.logger.info('[SCA] Starting dependency scan')

    try {
      // Find package manifest files
      const files = await this.findPackageFiles()

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
        }
      }

      // Read file contents
      const fileContents = await Promise.all(
        files.map(async (uri) => ({
          path: uri.fsPath,
          content: (await vscode.workspace.fs.readFile(uri)).toString(),
        }))
      )

      // Send to API for analysis
      const result = await this.callSCAApi(fileContents)
      this.lastResult = result

      this.logger.info(
        `[SCA] Scan complete: ${result.totalPackages} packages, ${result.vulnerabilitySummary.total} vulnerabilities`
      )

      return result
    } catch (error) {
      this.logger.error('[SCA] Scan failed', error as Error)
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
      }
    }
  }

  /**
   * Generate SBOM (Software Bill of Materials)
   */
  async generateSBOM(format: 'cyclonedx' | 'spdx' = 'cyclonedx'): Promise<SBOMResult> {
    this.logger.info(`[SCA] Generating SBOM in ${format} format`)

    try {
      const files = await this.findPackageFiles()

      if (files.length === 0) {
        return {
          success: false,
          format,
          content: '',
          filename: '',
          error: 'No package manifest files found',
        }
      }

      const fileContents = await Promise.all(
        files.map(async (uri) => ({
          path: uri.fsPath,
          content: (await vscode.workspace.fs.readFile(uri)).toString(),
        }))
      )

      const result = await this.callSBOMApi(fileContents, format)
      return result
    } catch (error) {
      this.logger.error('[SCA] SBOM generation failed', error as Error)
      return {
        success: false,
        format,
        content: '',
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Check licenses for compliance
   */
  async checkLicenses(): Promise<{
    success: boolean
    licenses: LicenseRisk[]
    compliant: boolean
    error?: string
  }> {
    this.logger.info('[SCA] Checking license compliance')

    try {
      // Use cached result if available, otherwise scan
      if (!this.lastResult) {
        await this.scanDependencies()
      }

      if (!this.lastResult || !this.lastResult.success) {
        return {
          success: false,
          licenses: [],
          compliant: true,
          error: 'No scan results available',
        }
      }

      return {
        success: true,
        licenses: this.lastResult.licenses.risks,
        compliant: this.lastResult.licenses.risks.filter(r => r.risk === 'high').length === 0,
      }
    } catch (error) {
      return {
        success: false,
        licenses: [],
        compliant: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get the last scan result
   */
  getLastResult(): SCAScanResult | null {
    return this.lastResult
  }

  /**
   * Clear cached results
   */
  clearCache(): void {
    this.lastResult = null
    this.logger.info('[SCA] Cache cleared')
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async findPackageFiles(): Promise<vscode.Uri[]> {
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
    ]

    const excludePatterns = [
      '**/node_modules/**',
      '**/vendor/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
    ]

    const allFiles: vscode.Uri[] = []

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        `{${excludePatterns.join(',')}}`,
        10 // Limit to 10 files per pattern
      )
      allFiles.push(...files)
    }

    // Remove duplicates
    const uniquePaths = new Set<string>()
    return allFiles.filter((uri) => {
      if (uniquePaths.has(uri.fsPath)) {
        return false
      }
      uniquePaths.add(uri.fsPath)
      return true
    })
  }

  private async callSCAApi(
    files: { path: string; content: string }[]
  ): Promise<SCAScanResult> {
    const settings = this.configService.getSettings()
    const apiEndpoint = `${settings.apiEndpoint}/sca-scan`

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
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error?.message || 'SCA scan failed')
    }

    const result = data.data
    return {
      success: true,
      ecosystem: result.ecosystem,
      totalPackages: result.totalPackages,
      directPackages: result.directPackages,
      transitivePackages: result.transitivePackages,
      vulnerabilities: result.vulnerabilities.map((v: any) => ({
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
        risks: result.licenses.risks.high.map((l: any) => ({
          license: l.spdxId || l.name,
          risk: 'high' as const,
          packages: [],
          issue: 'Copyleft license may require source disclosure',
        })),
        copyleftCount: result.licenses.copyleftPackages?.length || 0,
      },
      riskScore: result.riskScore,
      dependencies: result.dependencies.map((d: any) => ({
        name: d.name,
        version: d.version,
        ecosystem: d.ecosystem,
        type: d.type,
        license: d.license,
        deprecated: d.deprecated,
        purl: d.purl,
      })),
      scanDuration: result.duration,
    }
  }

  private async callSBOMApi(
    files: { path: string; content: string }[],
    format: 'cyclonedx' | 'spdx'
  ): Promise<SBOMResult> {
    const settings = this.configService.getSettings()
    const apiEndpoint = `${settings.apiEndpoint}/sca-scan`

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
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error?.message || 'SBOM generation failed')
    }

    const extension = format === 'cyclonedx' ? 'cdx.json' : 'spdx.json'
    const workspaceName = vscode.workspace.name || 'project'

    return {
      success: true,
      format,
      content: data.sbom,
      filename: `${workspaceName}.${extension}`,
    }
  }

  /**
   * Show vulnerability details in a webview panel
   */
  showVulnerabilityDetails(vulnerability: SCAVulnerability): void {
    const panel = vscode.window.createWebviewPanel(
      'scaVulnerability',
      `Vulnerability: ${vulnerability.id}`,
      vscode.ViewColumn.Two,
      { enableScripts: false }
    )

    const severityColors: Record<string, string> = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
      info: '#2563eb',
    }

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
    `
  }
}
