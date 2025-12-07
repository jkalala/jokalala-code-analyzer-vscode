/**
 * Container and IaC Security Service
 *
 * Provides security scanning for:
 * - Dockerfiles
 * - Docker Compose files
 * - Kubernetes manifests
 * - Terraform configurations
 * - CloudFormation templates
 * - Helm charts
 */

import * as vscode from 'vscode'
import * as path from 'path'
import type { ConfigurationService } from './configuration-service'
import type { Logger } from './logger'

// =============================================================================
// Types
// =============================================================================

export type ScanType = 'dockerfile' | 'docker-compose' | 'kubernetes' | 'terraform' | 'cloudformation' | 'helm'
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface ContainerIaCIssue {
  id: string
  type: ScanType
  title: string
  description: string
  severity: IssueSeverity
  line: number
  column?: number
  filePath: string
  cwe?: string
  fix?: string
  compliance?: string[]
  codeSnippet?: string
}

export interface ContainerIaCScanResult {
  success: boolean
  issues: ContainerIaCIssue[]
  scannedFiles: number
  scanType: ScanType | 'all'
  duration: number
  error?: string
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
}

export interface FileTypeInfo {
  type: ScanType
  pattern: string
  extensions: string[]
  displayName: string
  icon: string
}

// =============================================================================
// Constants
// =============================================================================

const FILE_TYPE_INFO: FileTypeInfo[] = [
  {
    type: 'dockerfile',
    pattern: '**/Dockerfile*',
    extensions: [],
    displayName: 'Dockerfile',
    icon: 'docker'
  },
  {
    type: 'docker-compose',
    pattern: '**/docker-compose*.{yml,yaml}',
    extensions: ['.yml', '.yaml'],
    displayName: 'Docker Compose',
    icon: 'docker-compose'
  },
  {
    type: 'kubernetes',
    pattern: '**/*.{yml,yaml}',
    extensions: ['.yml', '.yaml'],
    displayName: 'Kubernetes',
    icon: 'kubernetes'
  },
  {
    type: 'terraform',
    pattern: '**/*.tf',
    extensions: ['.tf'],
    displayName: 'Terraform',
    icon: 'terraform'
  },
  {
    type: 'cloudformation',
    pattern: '**/*.{yml,yaml,json}',
    extensions: ['.yml', '.yaml', '.json'],
    displayName: 'CloudFormation',
    icon: 'aws'
  },
  {
    type: 'helm',
    pattern: '**/templates/*.{yml,yaml}',
    extensions: ['.yml', '.yaml'],
    displayName: 'Helm Chart',
    icon: 'helm'
  }
]

// =============================================================================
// Service Implementation
// =============================================================================

export class ContainerIaCService {
  private configService: ConfigurationService
  private logger: Logger
  private cache: Map<string, ContainerIaCScanResult> = new Map()

  constructor(configService: ConfigurationService, logger: Logger) {
    this.configService = configService
    this.logger = logger
  }

  /**
   * Scan all container and IaC files in the workspace
   */
  async scanAll(): Promise<ContainerIaCScanResult> {
    const startTime = Date.now()
    const allIssues: ContainerIaCIssue[] = []
    let scannedFiles = 0

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (!workspaceFolders) {
        return this.createEmptyResult('all', 'No workspace folder open')
      }

      // Scan each file type
      for (const fileType of FILE_TYPE_INFO) {
        const result = await this.scanByType(fileType.type)
        if (result.success) {
          allIssues.push(...result.issues)
          scannedFiles += result.scannedFiles
        }
      }

      return this.createResult(allIssues, scannedFiles, 'all', startTime)
    } catch (error: any) {
      this.logger.error('Container/IaC scan failed', error)
      return this.createEmptyResult('all', error.message)
    }
  }

  /**
   * Scan specific file type
   */
  async scanByType(type: ScanType): Promise<ContainerIaCScanResult> {
    const startTime = Date.now()
    const issues: ContainerIaCIssue[] = []

    try {
      const files = await this.findFilesByType(type)

      for (const file of files) {
        const fileIssues = await this.analyzeFile(file, type)
        issues.push(...fileIssues)
      }

      return this.createResult(issues, files.length, type, startTime)
    } catch (error: any) {
      this.logger.error(`${type} scan failed`, error)
      return this.createEmptyResult(type, error.message)
    }
  }

  /**
   * Scan the current active file
   */
  async scanCurrentFile(): Promise<ContainerIaCScanResult> {
    const startTime = Date.now()
    const editor = vscode.window.activeTextEditor

    if (!editor) {
      return this.createEmptyResult('dockerfile', 'No active editor')
    }

    const filePath = editor.document.uri.fsPath
    const type = this.detectFileType(filePath, editor.document.getText())

    if (!type) {
      return this.createEmptyResult('dockerfile', 'File is not a recognized container/IaC file')
    }

    try {
      const issues = await this.analyzeFile(editor.document.uri, type)
      return this.createResult(issues, 1, type, startTime)
    } catch (error: any) {
      this.logger.error('Current file scan failed', error)
      return this.createEmptyResult(type, error.message)
    }
  }

  /**
   * Find files of a specific type
   */
  private async findFilesByType(type: ScanType): Promise<vscode.Uri[]> {
    const fileTypeInfo = FILE_TYPE_INFO.find(f => f.type === type)
    if (!fileTypeInfo) return []

    const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}'
    const files = await vscode.workspace.findFiles(fileTypeInfo.pattern, excludePattern, 100)

    // Additional filtering for types that need content inspection
    const filtered: vscode.Uri[] = []

    for (const file of files) {
      const content = await this.getFileContent(file)
      if (this.isFileOfType(file.fsPath, content, type)) {
        filtered.push(file)
      }
    }

    return filtered
  }

  /**
   * Detect the type of container/IaC file
   */
  private detectFileType(filePath: string, content: string): ScanType | null {
    const fileName = path.basename(filePath).toLowerCase()
    const ext = path.extname(filePath).toLowerCase()

    // Dockerfile detection
    if (fileName.startsWith('dockerfile') || fileName === 'dockerfile') {
      return 'dockerfile'
    }

    // Docker Compose detection
    if (fileName.startsWith('docker-compose') || fileName.startsWith('compose')) {
      return 'docker-compose'
    }

    // Terraform detection
    if (ext === '.tf') {
      return 'terraform'
    }

    // Content-based detection for YAML files
    if (ext === '.yml' || ext === '.yaml') {
      // Kubernetes detection
      if (/apiVersion:\s*(?:v1|apps\/v1|networking\.k8s\.io|batch\/v1)/i.test(content) ||
          /kind:\s*(?:Pod|Deployment|Service|ConfigMap|Secret|Ingress)/i.test(content)) {
        return 'kubernetes'
      }

      // CloudFormation detection
      if (/AWSTemplateFormatVersion|Resources:/i.test(content)) {
        return 'cloudformation'
      }

      // Helm chart detection
      if (filePath.includes('/templates/') && /\{\{.*\}\}/.test(content)) {
        return 'helm'
      }

      // Docker Compose (services key)
      if (/^services:/m.test(content)) {
        return 'docker-compose'
      }
    }

    // JSON CloudFormation
    if (ext === '.json') {
      if (/AWSTemplateFormatVersion|Resources/i.test(content)) {
        return 'cloudformation'
      }
    }

    return null
  }

  /**
   * Check if file content matches the expected type
   */
  private isFileOfType(filePath: string, content: string, type: ScanType): boolean {
    const detectedType = this.detectFileType(filePath, content)
    return detectedType === type
  }

  /**
   * Analyze a file for security issues
   */
  private async analyzeFile(uri: vscode.Uri, type: ScanType): Promise<ContainerIaCIssue[]> {
    const content = await this.getFileContent(uri)
    const filePath = uri.fsPath
    const relativePath = vscode.workspace.asRelativePath(uri)

    switch (type) {
      case 'dockerfile':
        return this.analyzeDockerfile(content, relativePath)
      case 'docker-compose':
        return this.analyzeDockerCompose(content, relativePath)
      case 'kubernetes':
        return this.analyzeKubernetes(content, relativePath)
      case 'terraform':
        return this.analyzeTerraform(content, relativePath)
      case 'cloudformation':
        return this.analyzeCloudFormation(content, relativePath)
      case 'helm':
        return this.analyzeHelm(content, relativePath)
      default:
        return []
    }
  }

  /**
   * Analyze Dockerfile for security issues
   */
  private analyzeDockerfile(content: string, filePath: string): ContainerIaCIssue[] {
    const issues: ContainerIaCIssue[] = []
    const lines = content.split('\n')

    const patterns = [
      {
        pattern: /^FROM\s+\S+:latest/i,
        title: 'Using latest tag',
        description: 'Using the :latest tag makes builds non-reproducible',
        severity: 'medium' as const,
        cwe: 'CWE-1188',
        fix: 'Pin to a specific version tag'
      },
      {
        pattern: /^USER\s+root\s*$/i,
        title: 'Running as root',
        description: 'Container runs as root user which increases attack surface',
        severity: 'high' as const,
        cwe: 'CWE-250',
        fix: 'Create and use a non-root user'
      },
      {
        pattern: /^ADD\s+http/i,
        title: 'ADD with remote URL',
        description: 'ADD with URLs is insecure; use RUN curl/wget with verification',
        severity: 'high' as const,
        cwe: 'CWE-494',
        fix: 'Use RUN with curl/wget and verify checksums'
      },
      {
        pattern: /^COPY\s+\.\s+/i,
        title: 'Copying entire context',
        description: 'Copying entire build context may include sensitive files',
        severity: 'medium' as const,
        cwe: 'CWE-200',
        fix: 'Use .dockerignore and copy only needed files'
      },
      {
        pattern: /apt-get\s+install(?!.*--no-install-recommends)/i,
        title: 'Installing recommended packages',
        description: 'apt-get installs recommended packages by default, increasing image size',
        severity: 'low' as const,
        cwe: 'CWE-1104',
        fix: 'Add --no-install-recommends flag'
      },
      {
        pattern: /apt-get\s+(?!.*&& rm -rf \/var\/lib\/apt\/lists)/i,
        title: 'APT cache not cleaned',
        description: 'APT cache increases image size unnecessarily',
        severity: 'low' as const,
        cwe: 'CWE-1104',
        fix: 'Add && rm -rf /var/lib/apt/lists/* after apt-get'
      },
      {
        pattern: /^ENV\s+\w*(?:PASSWORD|SECRET|KEY|TOKEN)\s*=/i,
        title: 'Secrets in environment variables',
        description: 'Hardcoded secrets in Dockerfile are exposed in image layers',
        severity: 'critical' as const,
        cwe: 'CWE-798',
        fix: 'Use Docker secrets or build-time args with --secret'
      },
      {
        pattern: /^EXPOSE\s+22\s*$/i,
        title: 'SSH port exposed',
        description: 'Exposing SSH port in container is usually unnecessary',
        severity: 'medium' as const,
        cwe: 'CWE-284',
        fix: 'Use docker exec for container access instead of SSH'
      },
      {
        pattern: /--privileged/i,
        title: 'Privileged flag usage',
        description: 'Privileged containers have full host access',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Use specific capabilities instead of --privileged'
      },
      {
        pattern: /HEALTHCHECK\s+NONE/i,
        title: 'Health check disabled',
        description: 'Disabling health checks prevents container orchestration from detecting failures',
        severity: 'low' as const,
        cwe: 'CWE-778',
        fix: 'Configure appropriate health check'
      }
    ]

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const p of patterns) {
        if (p.pattern.test(line)) {
          issues.push({
            id: `dockerfile-${p.cwe}-${i + 1}`,
            type: 'dockerfile',
            title: p.title,
            description: p.description,
            severity: p.severity,
            line: i + 1,
            filePath,
            cwe: p.cwe,
            fix: p.fix,
            codeSnippet: line.trim(),
            compliance: ['CIS Docker Benchmark']
          })
        }
      }
    }

    // Check for missing USER instruction
    if (!content.match(/^USER\s+\S+/im) || content.match(/^USER\s+root\s*$/im)) {
      const lastFrom = lines.findIndex(l => /^FROM\s/i.test(l))
      issues.push({
        id: 'dockerfile-CWE-250-user',
        type: 'dockerfile',
        title: 'No non-root USER specified',
        description: 'Container may run as root by default',
        severity: 'high',
        line: lastFrom + 1 || 1,
        filePath,
        cwe: 'CWE-250',
        fix: 'Add USER instruction with non-root user',
        compliance: ['CIS Docker Benchmark 4.1']
      })
    }

    return issues
  }

  /**
   * Analyze Docker Compose for security issues
   */
  private analyzeDockerCompose(content: string, filePath: string): ContainerIaCIssue[] {
    const issues: ContainerIaCIssue[] = []
    const lines = content.split('\n')

    const patterns = [
      {
        pattern: /privileged:\s*true/i,
        title: 'Privileged container',
        description: 'Privileged containers have full host access',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Remove privileged: true or use specific capabilities'
      },
      {
        pattern: /network_mode:\s*["']?host/i,
        title: 'Host network mode',
        description: 'Using host network bypasses container network isolation',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Use bridge network or custom networks'
      },
      {
        pattern: /pid:\s*["']?host/i,
        title: 'Host PID namespace',
        description: 'Sharing host PID namespace allows seeing all host processes',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Remove pid: host unless absolutely necessary'
      },
      {
        pattern: /cap_add:\s*\n\s*-\s*ALL/i,
        title: 'All capabilities added',
        description: 'Adding all capabilities defeats container isolation',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Add only specific required capabilities'
      },
      {
        pattern: /\/var\/run\/docker\.sock/i,
        title: 'Docker socket mounted',
        description: 'Mounting Docker socket allows container escape',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Avoid mounting Docker socket or use read-only with caution'
      },
      {
        pattern: /environment:\s*\n[^:]*(?:PASSWORD|SECRET|KEY|TOKEN):/i,
        title: 'Secrets in environment',
        description: 'Plaintext secrets in compose file',
        severity: 'high' as const,
        cwe: 'CWE-798',
        fix: 'Use Docker secrets or external secret management'
      },
      {
        pattern: /ports:\s*\n\s*-\s*["']?\d+:\d+["']?/i,
        title: 'Port exposed to all interfaces',
        description: 'Ports exposed without IP restriction bind to 0.0.0.0',
        severity: 'medium' as const,
        cwe: 'CWE-284',
        fix: 'Specify IP like 127.0.0.1:8080:8080 for local-only access'
      },
      {
        pattern: /read_only:\s*false/i,
        title: 'Writable root filesystem',
        description: 'Container has writable root filesystem',
        severity: 'low' as const,
        cwe: 'CWE-732',
        fix: 'Set read_only: true and use volumes for writable paths'
      }
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.pattern.test(lines[i])) {
          issues.push({
            id: `compose-${p.cwe}-${i + 1}`,
            type: 'docker-compose',
            title: p.title,
            description: p.description,
            severity: p.severity,
            line: i + 1,
            filePath,
            cwe: p.cwe,
            fix: p.fix,
            codeSnippet: lines[i].trim(),
            compliance: ['CIS Docker Benchmark']
          })
        }
      }
    }

    return issues
  }

  /**
   * Analyze Kubernetes manifests for security issues
   */
  private analyzeKubernetes(content: string, filePath: string): ContainerIaCIssue[] {
    const issues: ContainerIaCIssue[] = []
    const lines = content.split('\n')

    const patterns = [
      {
        pattern: /privileged:\s*true/i,
        title: 'Privileged container',
        description: 'Privileged containers have full node access',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Set privileged: false in securityContext'
      },
      {
        pattern: /runAsUser:\s*0/i,
        title: 'Running as root user',
        description: 'Container runs as UID 0 (root)',
        severity: 'high' as const,
        cwe: 'CWE-250',
        fix: 'Set runAsUser to non-zero value'
      },
      {
        pattern: /allowPrivilegeEscalation:\s*true/i,
        title: 'Privilege escalation allowed',
        description: 'Container can gain additional privileges',
        severity: 'high' as const,
        cwe: 'CWE-250',
        fix: 'Set allowPrivilegeEscalation: false'
      },
      {
        pattern: /hostNetwork:\s*true/i,
        title: 'Host network namespace',
        description: 'Pod uses host network namespace',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Remove hostNetwork or set to false'
      },
      {
        pattern: /hostPID:\s*true/i,
        title: 'Host PID namespace',
        description: 'Pod shares host PID namespace',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Remove hostPID or set to false'
      },
      {
        pattern: /hostIPC:\s*true/i,
        title: 'Host IPC namespace',
        description: 'Pod shares host IPC namespace',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Remove hostIPC or set to false'
      },
      {
        pattern: /capabilities:\s*\n\s*add:\s*\n\s*-\s*(?:ALL|SYS_ADMIN)/i,
        title: 'Dangerous capabilities added',
        description: 'Adding ALL or SYS_ADMIN capabilities is highly privileged',
        severity: 'critical' as const,
        cwe: 'CWE-250',
        fix: 'Add only specific required capabilities'
      },
      {
        pattern: /readOnlyRootFilesystem:\s*false/i,
        title: 'Writable root filesystem',
        description: 'Container filesystem is writable',
        severity: 'medium' as const,
        cwe: 'CWE-732',
        fix: 'Set readOnlyRootFilesystem: true'
      },
      {
        pattern: /kind:\s*Secret[\s\S]*?stringData:/i,
        title: 'Unencrypted Secret',
        description: 'Secret data should be encrypted at rest',
        severity: 'medium' as const,
        cwe: 'CWE-312',
        fix: 'Use sealed-secrets or external secret management'
      },
      {
        pattern: /resources:\s*\n\s*limits:\s*\n\s*(?!.*cpu|memory)/i,
        title: 'Missing resource limits',
        description: 'Container without CPU/memory limits can cause resource starvation',
        severity: 'medium' as const,
        cwe: 'CWE-770',
        fix: 'Set CPU and memory limits in resources.limits'
      },
      {
        pattern: /automountServiceAccountToken:\s*true/i,
        title: 'Service account token auto-mounted',
        description: 'Auto-mounting service account token may be unnecessary',
        severity: 'low' as const,
        cwe: 'CWE-732',
        fix: 'Set automountServiceAccountToken: false if not needed'
      }
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.pattern.test(lines.slice(i).join('\n'))) {
          if (p.pattern.test(lines[i]) ||
              (i > 0 && p.pattern.test(lines.slice(Math.max(0, i-5), i+5).join('\n')))) {
            issues.push({
              id: `k8s-${p.cwe}-${i + 1}`,
              type: 'kubernetes',
              title: p.title,
              description: p.description,
              severity: p.severity,
              line: i + 1,
              filePath,
              cwe: p.cwe,
              fix: p.fix,
              codeSnippet: lines[i].trim(),
              compliance: ['CIS Kubernetes Benchmark', 'NSA/CISA Kubernetes Hardening']
            })
            break // Only report once per pattern
          }
        }
      }
    }

    return issues
  }

  /**
   * Analyze Terraform configurations for security issues
   */
  private analyzeTerraform(content: string, filePath: string): ContainerIaCIssue[] {
    const issues: ContainerIaCIssue[] = []
    const lines = content.split('\n')

    const patterns = [
      {
        pattern: /cidr_blocks\s*=\s*\[\s*["']0\.0\.0\.0\/0["']\s*\]/i,
        title: 'Security group open to world',
        description: 'Security group allows access from any IP address',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Restrict CIDR blocks to specific IP ranges'
      },
      {
        pattern: /publicly_accessible\s*=\s*true/i,
        title: 'Resource publicly accessible',
        description: 'Database or resource is publicly accessible',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Set publicly_accessible = false'
      },
      {
        pattern: /encrypted\s*=\s*false/i,
        title: 'Encryption disabled',
        description: 'Resource encryption is explicitly disabled',
        severity: 'high' as const,
        cwe: 'CWE-311',
        fix: 'Set encrypted = true'
      },
      {
        pattern: /enable_key_rotation\s*=\s*false/i,
        title: 'Key rotation disabled',
        description: 'KMS key rotation is disabled',
        severity: 'medium' as const,
        cwe: 'CWE-320',
        fix: 'Set enable_key_rotation = true'
      },
      {
        pattern: /logging\s*{\s*}/i,
        title: 'Empty logging configuration',
        description: 'Logging may not be properly configured',
        severity: 'medium' as const,
        cwe: 'CWE-778',
        fix: 'Configure proper logging settings'
      },
      {
        pattern: /skip_final_snapshot\s*=\s*true/i,
        title: 'Final snapshot skipped',
        description: 'No final snapshot will be created on deletion',
        severity: 'low' as const,
        cwe: 'CWE-1188',
        fix: 'Set skip_final_snapshot = false for production'
      },
      {
        pattern: /password\s*=\s*["'][^"']+["']/i,
        title: 'Hardcoded password',
        description: 'Password is hardcoded in Terraform configuration',
        severity: 'critical' as const,
        cwe: 'CWE-798',
        fix: 'Use variables or secret management'
      },
      {
        pattern: /acl\s*=\s*["']public-read/i,
        title: 'Public S3 bucket',
        description: 'S3 bucket ACL allows public read access',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Set acl = "private" and use bucket policies'
      },
      {
        pattern: /versioning\s*{\s*enabled\s*=\s*false/i,
        title: 'Versioning disabled',
        description: 'S3 bucket versioning is disabled',
        severity: 'medium' as const,
        cwe: 'CWE-1188',
        fix: 'Enable versioning for data protection'
      }
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.pattern.test(lines[i])) {
          issues.push({
            id: `tf-${p.cwe}-${i + 1}`,
            type: 'terraform',
            title: p.title,
            description: p.description,
            severity: p.severity,
            line: i + 1,
            filePath,
            cwe: p.cwe,
            fix: p.fix,
            codeSnippet: lines[i].trim(),
            compliance: ['CIS AWS Benchmark', 'AWS Well-Architected']
          })
        }
      }
    }

    return issues
  }

  /**
   * Analyze CloudFormation templates for security issues
   */
  private analyzeCloudFormation(content: string, filePath: string): ContainerIaCIssue[] {
    const issues: ContainerIaCIssue[] = []
    const lines = content.split('\n')

    const patterns = [
      {
        pattern: /CidrIp:\s*["']?0\.0\.0\.0\/0/i,
        title: 'Security group open to world',
        description: 'Security group ingress allows any source IP',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Restrict CidrIp to specific IP ranges'
      },
      {
        pattern: /PubliclyAccessible:\s*["']?true/i,
        title: 'Resource publicly accessible',
        description: 'RDS or similar resource is publicly accessible',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Set PubliclyAccessible to false'
      },
      {
        pattern: /StorageEncrypted:\s*["']?false/i,
        title: 'Storage encryption disabled',
        description: 'Storage encryption is explicitly disabled',
        severity: 'high' as const,
        cwe: 'CWE-311',
        fix: 'Set StorageEncrypted to true'
      },
      {
        pattern: /AccessControl:\s*["']?PublicRead/i,
        title: 'Public S3 bucket',
        description: 'S3 bucket allows public read access',
        severity: 'high' as const,
        cwe: 'CWE-284',
        fix: 'Set AccessControl to Private'
      },
      {
        pattern: /VersioningConfiguration:\s*\n\s*Status:\s*["']?Suspended/i,
        title: 'S3 versioning suspended',
        description: 'S3 bucket versioning is suspended',
        severity: 'medium' as const,
        cwe: 'CWE-1188',
        fix: 'Set Status to Enabled'
      },
      {
        pattern: /\{\{resolve:ssm-secure:/i,
        title: 'Using SSM secure parameter',
        description: 'Good practice using SSM secure parameters',
        severity: 'info' as const,
        cwe: 'CWE-798',
        fix: 'Informational: This is a security best practice'
      }
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.pattern.test(lines[i])) {
          issues.push({
            id: `cfn-${p.cwe}-${i + 1}`,
            type: 'cloudformation',
            title: p.title,
            description: p.description,
            severity: p.severity,
            line: i + 1,
            filePath,
            cwe: p.cwe,
            fix: p.fix,
            codeSnippet: lines[i].trim(),
            compliance: ['CIS AWS Benchmark', 'AWS Security Best Practices']
          })
        }
      }
    }

    return issues
  }

  /**
   * Analyze Helm charts for security issues
   */
  private analyzeHelm(content: string, filePath: string): ContainerIaCIssue[] {
    // Helm templates are essentially Kubernetes manifests with Go templating
    // Apply Kubernetes checks plus Helm-specific checks
    const k8sIssues = this.analyzeKubernetes(content, filePath)

    // Change type to helm
    return k8sIssues.map(issue => ({
      ...issue,
      id: issue.id.replace('k8s-', 'helm-'),
      type: 'helm' as const
    }))
  }

  /**
   * Show vulnerability details in a webview
   */
  showIssueDetails(issue: ContainerIaCIssue): void {
    const panel = vscode.window.createWebviewPanel(
      'containerIaCIssue',
      `${issue.type.toUpperCase()}: ${issue.title}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false }
    )

    panel.webview.html = this.getIssueDetailsHtml(issue)
  }

  /**
   * Generate HTML for issue details
   */
  private getIssueDetailsHtml(issue: ContainerIaCIssue): string {
    const severityColor = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#17a2b8',
      info: '#6c757d'
    }[issue.severity]

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${issue.title}</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
        .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; font-weight: bold; background: ${severityColor}; }
        .section { margin: 20px 0; }
        .section-title { font-size: 14px; font-weight: bold; color: var(--vscode-textLink-foreground); margin-bottom: 8px; }
        .code { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; font-family: monospace; overflow-x: auto; }
        .compliance { display: flex; flex-wrap: wrap; gap: 8px; }
        .compliance-tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    </style>
</head>
<body>
    <h1>${issue.title}</h1>
    <p class="severity">${issue.severity.toUpperCase()}</p>

    <div class="section">
        <div class="section-title">Description</div>
        <p>${issue.description}</p>
    </div>

    <div class="section">
        <div class="section-title">Location</div>
        <p>${issue.filePath}:${issue.line}</p>
    </div>

    ${issue.codeSnippet ? `
    <div class="section">
        <div class="section-title">Code</div>
        <pre class="code">${issue.codeSnippet}</pre>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">Remediation</div>
        <p>${issue.fix || 'No specific fix available'}</p>
    </div>

    ${issue.cwe ? `
    <div class="section">
        <div class="section-title">CWE Reference</div>
        <p><a href="https://cwe.mitre.org/data/definitions/${issue.cwe.replace('CWE-', '')}.html">${issue.cwe}</a></p>
    </div>
    ` : ''}

    ${issue.compliance && issue.compliance.length > 0 ? `
    <div class="section">
        <div class="section-title">Compliance</div>
        <div class="compliance">
            ${issue.compliance.map(c => `<span class="compliance-tag">${c}</span>`).join('')}
        </div>
    </div>
    ` : ''}
</body>
</html>`
  }

  /**
   * Get file content
   */
  private async getFileContent(uri: vscode.Uri): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(uri)
      return document.getText()
    } catch {
      return ''
    }
  }

  /**
   * Create scan result object
   */
  private createResult(
    issues: ContainerIaCIssue[],
    scannedFiles: number,
    scanType: ScanType | 'all',
    startTime: number
  ): ContainerIaCScanResult {
    return {
      success: true,
      issues,
      scannedFiles,
      scanType,
      duration: Date.now() - startTime,
      summary: {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length,
        info: issues.filter(i => i.severity === 'info').length,
        total: issues.length
      }
    }
  }

  /**
   * Create empty/error result
   */
  private createEmptyResult(scanType: ScanType | 'all', error: string): ContainerIaCScanResult {
    return {
      success: false,
      issues: [],
      scannedFiles: 0,
      scanType,
      duration: 0,
      error,
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}
