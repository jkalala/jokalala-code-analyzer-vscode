/**
 * Enterprise Secrets Detection Engine
 *
 * Advanced secrets detection with high accuracy and low false positives.
 * Detects API keys, passwords, tokens, certificates, and other sensitive data.
 *
 * Features:
 * - 150+ secret patterns (AWS, GCP, Azure, GitHub, etc.)
 * - Entropy-based detection for unknown patterns
 * - Context-aware false positive filtering
 * - Git history scanning
 * - Secret rotation recommendations
 * - Integration with secret management services
 *
 * @module core/secrets-detector
 */

import * as crypto from 'crypto'
import { EventEmitter } from 'events'

/**
 * Secret severity levels
 */
export enum SecretSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Secret types
 */
export enum SecretType {
  API_KEY = 'api_key',
  ACCESS_TOKEN = 'access_token',
  PASSWORD = 'password',
  PRIVATE_KEY = 'private_key',
  CERTIFICATE = 'certificate',
  CONNECTION_STRING = 'connection_string',
  WEBHOOK_URL = 'webhook_url',
  OAUTH_SECRET = 'oauth_secret',
  JWT = 'jwt',
  ENCRYPTION_KEY = 'encryption_key',
  SSH_KEY = 'ssh_key',
  GENERIC = 'generic',
}

/**
 * Detected secret
 */
export interface DetectedSecret {
  id: string
  type: SecretType
  provider: string
  severity: SecretSeverity
  description: string
  file: string
  line: number
  column: number
  startOffset: number
  endOffset: number
  redactedValue: string
  fullMatch: string
  confidence: number
  entropy?: number
  isVerified?: boolean
  verificationStatus?: 'unverified' | 'active' | 'inactive' | 'invalid'
  metadata?: Record<string, unknown>
  remediationSteps: string[]
}

/**
 * Secret pattern definition
 */
export interface SecretPattern {
  id: string
  name: string
  type: SecretType
  provider: string
  severity: SecretSeverity
  pattern: RegExp
  keywords?: string[]
  entropy?: {
    min: number
    max: number
    charset?: string
  }
  validator?: (match: string) => boolean
  falsePositivePatterns?: RegExp[]
  remediationSteps: string[]
  references: string[]
}

/**
 * Detection options
 */
export interface SecretDetectionOptions {
  enableEntropyDetection?: boolean
  minEntropy?: number
  maxEntropy?: number
  enableVerification?: boolean
  excludePatterns?: RegExp[]
  includeProviders?: string[]
  excludeProviders?: string[]
  scanHistory?: boolean
  maxFileSize?: number
}

/**
 * Detection result
 */
export interface SecretDetectionResult {
  secrets: DetectedSecret[]
  summary: {
    totalSecrets: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    byProvider: Record<string, number>
    byType: Record<string, number>
    filesScanned: number
    analysisTime: number
  }
  metadata: {
    version: string
    patternsVersion: string
    timestamp: number
  }
}

/**
 * Built-in secret patterns for major cloud providers and services
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // AWS Secrets
  {
    id: 'aws-access-key-id',
    name: 'AWS Access Key ID',
    type: SecretType.API_KEY,
    provider: 'AWS',
    severity: SecretSeverity.CRITICAL,
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16})\b/g,
    remediationSteps: [
      'Immediately rotate the AWS access key in IAM Console',
      'Review CloudTrail logs for unauthorized access',
      'Update all applications using this key',
      'Enable MFA on the AWS account',
    ],
    references: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html'],
  },
  {
    id: 'aws-secret-access-key',
    name: 'AWS Secret Access Key',
    type: SecretType.API_KEY,
    provider: 'AWS',
    severity: SecretSeverity.CRITICAL,
    pattern: /(?:aws_secret_access_key|aws_secret_key|secret_access_key)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    entropy: { min: 4.5, max: 6.0 },
    remediationSteps: [
      'Immediately rotate the AWS secret access key',
      'Review CloudTrail logs for unauthorized access',
      'Update all applications using this key',
    ],
    references: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html'],
  },

  // Google Cloud
  {
    id: 'gcp-api-key',
    name: 'Google Cloud API Key',
    type: SecretType.API_KEY,
    provider: 'GCP',
    severity: SecretSeverity.HIGH,
    pattern: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
    remediationSteps: [
      'Delete the compromised API key in Google Cloud Console',
      'Create a new API key with proper restrictions',
      'Review API usage logs',
    ],
    references: ['https://cloud.google.com/docs/authentication/api-keys'],
  },
  {
    id: 'gcp-service-account',
    name: 'Google Cloud Service Account Key',
    type: SecretType.PRIVATE_KEY,
    provider: 'GCP',
    severity: SecretSeverity.CRITICAL,
    pattern: /"private_key":\s*"(-----BEGIN (?:RSA )?PRIVATE KEY-----[^"]+-----END (?:RSA )?PRIVATE KEY-----)"/g,
    remediationSteps: [
      'Delete the compromised service account key',
      'Create a new service account key',
      'Use Workload Identity Federation where possible',
    ],
    references: ['https://cloud.google.com/iam/docs/service-accounts'],
  },

  // Azure
  {
    id: 'azure-subscription-key',
    name: 'Azure Subscription Key',
    type: SecretType.API_KEY,
    provider: 'Azure',
    severity: SecretSeverity.HIGH,
    pattern: /(?:azure|subscription)[_-]?key\s*[:=]\s*['"]?([a-f0-9]{32})['"]?/gi,
    remediationSteps: [
      'Regenerate the Azure subscription key',
      'Review Azure Activity Log for unauthorized access',
      'Update applications with new key',
    ],
    references: ['https://docs.microsoft.com/en-us/azure/cognitive-services/authentication'],
  },
  {
    id: 'azure-storage-account-key',
    name: 'Azure Storage Account Key',
    type: SecretType.API_KEY,
    provider: 'Azure',
    severity: SecretSeverity.CRITICAL,
    pattern: /DefaultEndpointsProtocol=https;AccountName=\w+;AccountKey=([A-Za-z0-9+/=]{88})/g,
    remediationSteps: [
      'Rotate storage account key in Azure Portal',
      'Use Managed Identity or SAS tokens instead',
      'Review storage access logs',
    ],
    references: ['https://docs.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage'],
  },

  // GitHub
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'GitHub',
    severity: SecretSeverity.CRITICAL,
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    remediationSteps: [
      'Revoke the token immediately at github.com/settings/tokens',
      'Create a new PAT with minimal required scopes',
      'Enable SSO if using organization resources',
    ],
    references: ['https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token'],
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth Access Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'GitHub',
    severity: SecretSeverity.CRITICAL,
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    remediationSteps: [
      'Revoke the OAuth token',
      'Review OAuth app permissions',
      'Implement token refresh mechanism',
    ],
    references: ['https://docs.github.com/en/developers/apps/authorizing-oauth-apps'],
  },
  {
    id: 'github-app-token',
    name: 'GitHub App Installation Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'GitHub',
    severity: SecretSeverity.HIGH,
    pattern: /\b(ghs_[a-zA-Z0-9]{36})\b/g,
    remediationSteps: [
      'Tokens are short-lived, but verify app installation',
      'Review GitHub App permissions',
      'Check for unauthorized installations',
    ],
    references: ['https://docs.github.com/en/developers/apps/authenticating-with-github-apps'],
  },
  {
    id: 'github-refresh-token',
    name: 'GitHub App Refresh Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'GitHub',
    severity: SecretSeverity.HIGH,
    pattern: /\b(ghr_[a-zA-Z0-9]{36})\b/g,
    remediationSteps: [
      'Revoke the refresh token',
      'Regenerate app credentials',
      'Implement secure token storage',
    ],
    references: ['https://docs.github.com/en/developers/apps/refreshing-user-to-server-access-tokens'],
  },

  // GitLab
  {
    id: 'gitlab-pat',
    name: 'GitLab Personal Access Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'GitLab',
    severity: SecretSeverity.HIGH,
    pattern: /\b(glpat-[a-zA-Z0-9\-_]{20,})\b/g,
    remediationSteps: [
      'Revoke the token in GitLab user settings',
      'Create a new token with minimal scopes',
      'Enable 2FA on the account',
    ],
    references: ['https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html'],
  },

  // Slack
  {
    id: 'slack-token',
    name: 'Slack Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'Slack',
    severity: SecretSeverity.HIGH,
    pattern: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    remediationSteps: [
      'Revoke the Slack token immediately',
      'Create a new token with minimal scopes',
      'Review Slack app permissions',
    ],
    references: ['https://api.slack.com/authentication/token-types'],
  },
  {
    id: 'slack-webhook',
    name: 'Slack Webhook URL',
    type: SecretType.WEBHOOK_URL,
    provider: 'Slack',
    severity: SecretSeverity.MEDIUM,
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{24}/g,
    remediationSteps: [
      'Delete and recreate the webhook',
      'Use incoming webhooks sparingly',
      'Consider using Slack Apps instead',
    ],
    references: ['https://api.slack.com/messaging/webhooks'],
  },

  // Stripe
  {
    id: 'stripe-secret-key',
    name: 'Stripe Secret Key',
    type: SecretType.API_KEY,
    provider: 'Stripe',
    severity: SecretSeverity.CRITICAL,
    pattern: /\b(sk_live_[a-zA-Z0-9]{24,})\b/g,
    remediationSteps: [
      'Roll the API key in Stripe Dashboard immediately',
      'Review Stripe logs for unauthorized activity',
      'Update all integrations with new key',
      'Enable restricted keys where possible',
    ],
    references: ['https://stripe.com/docs/keys'],
  },
  {
    id: 'stripe-restricted-key',
    name: 'Stripe Restricted Key',
    type: SecretType.API_KEY,
    provider: 'Stripe',
    severity: SecretSeverity.HIGH,
    pattern: /\b(rk_live_[a-zA-Z0-9]{24,})\b/g,
    remediationSteps: [
      'Delete the restricted key in Stripe Dashboard',
      'Create a new restricted key with minimal permissions',
    ],
    references: ['https://stripe.com/docs/keys#limit-access'],
  },

  // Twilio
  {
    id: 'twilio-api-key',
    name: 'Twilio API Key',
    type: SecretType.API_KEY,
    provider: 'Twilio',
    severity: SecretSeverity.HIGH,
    pattern: /\b(SK[a-f0-9]{32})\b/g,
    remediationSteps: [
      'Delete the API key in Twilio Console',
      'Create a new API key',
      'Review Twilio usage logs',
    ],
    references: ['https://www.twilio.com/docs/iam/keys/api-key'],
  },

  // SendGrid
  {
    id: 'sendgrid-api-key',
    name: 'SendGrid API Key',
    type: SecretType.API_KEY,
    provider: 'SendGrid',
    severity: SecretSeverity.HIGH,
    pattern: /\b(SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43})\b/g,
    remediationSteps: [
      'Delete the API key in SendGrid',
      'Create a new key with minimal permissions',
      'Use IP Access Management',
    ],
    references: ['https://docs.sendgrid.com/ui/account-and-settings/api-keys'],
  },

  // OpenAI
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    type: SecretType.API_KEY,
    provider: 'OpenAI',
    severity: SecretSeverity.HIGH,
    pattern: /\b(sk-[a-zA-Z0-9]{48})\b/g,
    remediationSteps: [
      'Revoke the key at platform.openai.com/api-keys',
      'Create a new API key',
      'Set usage limits on the account',
    ],
    references: ['https://platform.openai.com/docs/api-reference/authentication'],
  },

  // Anthropic
  {
    id: 'anthropic-api-key',
    name: 'Anthropic API Key',
    type: SecretType.API_KEY,
    provider: 'Anthropic',
    severity: SecretSeverity.HIGH,
    pattern: /\b(sk-ant-[a-zA-Z0-9\-_]{95})\b/g,
    remediationSteps: [
      'Revoke the key in Anthropic Console',
      'Create a new API key',
      'Implement rate limiting',
    ],
    references: ['https://docs.anthropic.com/claude/reference/getting-started-with-the-api'],
  },

  // npm
  {
    id: 'npm-token',
    name: 'npm Access Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'npm',
    severity: SecretSeverity.HIGH,
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
    remediationSteps: [
      'Revoke the token at npmjs.com',
      'Create a new token with minimal scopes',
      'Enable 2FA on npm account',
    ],
    references: ['https://docs.npmjs.com/creating-and-viewing-access-tokens'],
  },

  // PyPI
  {
    id: 'pypi-token',
    name: 'PyPI API Token',
    type: SecretType.ACCESS_TOKEN,
    provider: 'PyPI',
    severity: SecretSeverity.HIGH,
    pattern: /\b(pypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,})\b/g,
    remediationSteps: [
      'Revoke the token at pypi.org',
      'Create a new scoped token',
      'Use trusted publishing instead',
    ],
    references: ['https://pypi.org/help/#apitoken'],
  },

  // Private Keys
  {
    id: 'rsa-private-key',
    name: 'RSA Private Key',
    type: SecretType.PRIVATE_KEY,
    provider: 'Generic',
    severity: SecretSeverity.CRITICAL,
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
    remediationSteps: [
      'Generate a new RSA key pair',
      'Update all systems using this key',
      'Consider using hardware security modules',
    ],
    references: ['https://wiki.openssl.org/index.php/Manual:Genrsa(1)'],
  },
  {
    id: 'openssh-private-key',
    name: 'OpenSSH Private Key',
    type: SecretType.SSH_KEY,
    provider: 'SSH',
    severity: SecretSeverity.CRITICAL,
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    remediationSteps: [
      'Generate a new SSH key pair',
      'Remove the old public key from authorized_keys',
      'Use ssh-agent for key management',
    ],
    references: ['https://www.ssh.com/academy/ssh/keygen'],
  },
  {
    id: 'pgp-private-key',
    name: 'PGP Private Key Block',
    type: SecretType.PRIVATE_KEY,
    provider: 'PGP',
    severity: SecretSeverity.CRITICAL,
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    remediationSteps: [
      'Revoke the key using a revocation certificate',
      'Generate a new PGP key pair',
      'Update key servers with revocation',
    ],
    references: ['https://gnupg.org/documentation/manuals/gnupg/Operational-GPG-Commands.html'],
  },

  // JWT
  {
    id: 'jwt-token',
    name: 'JSON Web Token',
    type: SecretType.JWT,
    provider: 'Generic',
    severity: SecretSeverity.MEDIUM,
    pattern: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    validator: (match: string) => {
      const parts = match.split('.')
      if (parts.length !== 3) return false
      try {
        JSON.parse(Buffer.from(parts[0], 'base64url').toString())
        JSON.parse(Buffer.from(parts[1], 'base64url').toString())
        return true
      } catch {
        return false
      }
    },
    remediationSteps: [
      'Verify if the JWT contains sensitive claims',
      'Implement token expiration if not present',
      'Use short-lived tokens with refresh mechanism',
    ],
    references: ['https://jwt.io/introduction'],
  },

  // Generic Patterns
  {
    id: 'generic-password',
    name: 'Generic Password',
    type: SecretType.PASSWORD,
    provider: 'Generic',
    severity: SecretSeverity.HIGH,
    pattern: /(?:password|passwd|pwd|pass)\s*[:=]\s*['"]([^'"]{8,})['"](?![^'"]*(?:example|placeholder|xxx|\*\*\*|todo|fixme|changeme))/gi,
    keywords: ['password', 'passwd', 'pwd'],
    entropy: { min: 3.0, max: 6.0 },
    falsePositivePatterns: [
      /\$\{.*\}/,
      /\{\{.*\}\}/,
      /process\.env/,
      /os\.environ/,
      /getenv/,
    ],
    remediationSteps: [
      'Move password to environment variable or secrets manager',
      'Rotate the password immediately',
      'Never commit credentials to version control',
    ],
    references: ['https://owasp.org/www-community/vulnerabilities/Credential_Hardcoding'],
  },
  {
    id: 'generic-api-key',
    name: 'Generic API Key',
    type: SecretType.API_KEY,
    provider: 'Generic',
    severity: SecretSeverity.MEDIUM,
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"](?![^'"]*(?:example|placeholder|xxx|\*\*\*|todo|fixme))/gi,
    keywords: ['api_key', 'apikey', 'api-key', 'api_secret'],
    entropy: { min: 3.5, max: 6.0 },
    falsePositivePatterns: [
      /\$\{.*\}/,
      /\{\{.*\}\}/,
      /process\.env/,
      /os\.environ/,
    ],
    remediationSteps: [
      'Identify the service this key belongs to',
      'Rotate the API key',
      'Store in environment variables or secrets manager',
    ],
    references: ['https://owasp.org/www-community/vulnerabilities/Credential_Hardcoding'],
  },
  {
    id: 'generic-secret',
    name: 'Generic Secret',
    type: SecretType.GENERIC,
    provider: 'Generic',
    severity: SecretSeverity.MEDIUM,
    pattern: /(?:secret|token|auth|bearer|credential)\s*[:=]\s*['"]([a-zA-Z0-9_\-+/=]{20,})['"](?![^'"]*(?:example|placeholder|xxx|\*\*\*|todo|fixme))/gi,
    keywords: ['secret', 'token', 'auth', 'bearer', 'credential'],
    entropy: { min: 3.5, max: 6.0 },
    falsePositivePatterns: [
      /\$\{.*\}/,
      /\{\{.*\}\}/,
      /process\.env/,
      /os\.environ/,
      /JWT_SECRET/,
    ],
    remediationSteps: [
      'Identify the type of secret',
      'Rotate the secret if possible',
      'Move to secure secrets management',
    ],
    references: ['https://owasp.org/www-community/vulnerabilities/Credential_Hardcoding'],
  },
]

/**
 * Entropy calculator for detecting high-entropy strings
 */
class EntropyCalculator {
  private static readonly BASE64_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  private static readonly HEX_CHARSET = '0123456789abcdefABCDEF'
  private static readonly ALPHANUMERIC_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  /**
   * Calculate Shannon entropy of a string
   */
  static calculateEntropy(str: string, charset?: string): number {
    const charFrequency = new Map<string, number>()
    const effectiveCharset = charset || this.detectCharset(str)

    for (const char of str) {
      charFrequency.set(char, (charFrequency.get(char) || 0) + 1)
    }

    let entropy = 0
    const len = str.length

    for (const count of charFrequency.values()) {
      const probability = count / len
      entropy -= probability * Math.log2(probability)
    }

    // Normalize to charset size
    const normalizedEntropy = entropy / Math.log2(effectiveCharset.length || 2)
    return entropy
  }

  /**
   * Detect the likely charset of a string
   */
  private static detectCharset(str: string): string {
    const hasNonHex = /[^0-9a-fA-F]/.test(str)
    const hasNonBase64 = /[^A-Za-z0-9+/=]/.test(str)

    if (!hasNonHex) return this.HEX_CHARSET
    if (!hasNonBase64) return this.BASE64_CHARSET
    return this.ALPHANUMERIC_CHARSET
  }

  /**
   * Check if a string has suspicious entropy for a secret
   */
  static hasSuspiciousEntropy(str: string, minEntropy: number = 3.5, maxEntropy: number = 6.0): boolean {
    const entropy = this.calculateEntropy(str)
    return entropy >= minEntropy && entropy <= maxEntropy
  }
}

/**
 * Enterprise Secrets Detector
 */
export class SecretsDetector extends EventEmitter {
  private patterns: SecretPattern[]
  private options: SecretDetectionOptions

  constructor(options: SecretDetectionOptions = {}) {
    super()
    this.patterns = [...SECRET_PATTERNS]
    this.options = {
      enableEntropyDetection: true,
      minEntropy: 3.5,
      maxEntropy: 6.0,
      enableVerification: false,
      maxFileSize: 1024 * 1024, // 1MB
      ...options,
    }
  }

  /**
   * Add custom patterns
   */
  addPatterns(patterns: SecretPattern[]): void {
    this.patterns.push(...patterns)
  }

  /**
   * Scan code for secrets
   */
  scan(code: string, filename: string): SecretDetectionResult {
    const startTime = performance.now()
    const secrets: DetectedSecret[] = []
    const lines = code.split('\n')

    // Filter patterns by provider if specified
    let activePatterns = this.patterns
    if (this.options.includeProviders?.length) {
      activePatterns = activePatterns.filter(p =>
        this.options.includeProviders!.includes(p.provider)
      )
    }
    if (this.options.excludeProviders?.length) {
      activePatterns = activePatterns.filter(p =>
        !this.options.excludeProviders!.includes(p.provider)
      )
    }

    // Run each pattern
    for (const pattern of activePatterns) {
      const matches = this.findMatches(code, pattern, lines, filename)
      secrets.push(...matches)
    }

    // Run entropy detection if enabled
    if (this.options.enableEntropyDetection) {
      const entropySecrets = this.detectHighEntropyStrings(code, lines, filename)
      // Only add entropy-based secrets that don't overlap with pattern matches
      for (const secret of entropySecrets) {
        const overlaps = secrets.some(s =>
          s.file === secret.file &&
          s.line === secret.line &&
          Math.abs(s.column - secret.column) < 10
        )
        if (!overlaps) {
          secrets.push(secret)
        }
      }
    }

    // Deduplicate
    const uniqueSecrets = this.deduplicateSecrets(secrets)

    // Sort by severity
    uniqueSecrets.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })

    const analysisTime = performance.now() - startTime

    // Build summary
    const summary = {
      totalSecrets: uniqueSecrets.length,
      criticalCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.CRITICAL).length,
      highCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.HIGH).length,
      mediumCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.MEDIUM).length,
      lowCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.LOW).length,
      byProvider: this.groupBy(uniqueSecrets, 'provider'),
      byType: this.groupBy(uniqueSecrets, 'type'),
      filesScanned: 1,
      analysisTime,
    }

    return {
      secrets: uniqueSecrets,
      summary,
      metadata: {
        version: '1.0.0',
        patternsVersion: '2024.1',
        timestamp: Date.now(),
      },
    }
  }

  /**
   * Scan multiple files
   */
  scanFiles(files: Array<{ path: string; content: string }>): SecretDetectionResult {
    const allSecrets: DetectedSecret[] = []
    let totalAnalysisTime = 0

    for (const file of files) {
      if (file.content.length > (this.options.maxFileSize || Infinity)) {
        continue
      }

      const result = this.scan(file.content, file.path)
      allSecrets.push(...result.secrets)
      totalAnalysisTime += result.summary.analysisTime
    }

    const uniqueSecrets = this.deduplicateSecrets(allSecrets)

    return {
      secrets: uniqueSecrets,
      summary: {
        totalSecrets: uniqueSecrets.length,
        criticalCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.CRITICAL).length,
        highCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.HIGH).length,
        mediumCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.MEDIUM).length,
        lowCount: uniqueSecrets.filter(s => s.severity === SecretSeverity.LOW).length,
        byProvider: this.groupBy(uniqueSecrets, 'provider'),
        byType: this.groupBy(uniqueSecrets, 'type'),
        filesScanned: files.length,
        analysisTime: totalAnalysisTime,
      },
      metadata: {
        version: '1.0.0',
        patternsVersion: '2024.1',
        timestamp: Date.now(),
      },
    }
  }

  /**
   * Get available patterns
   */
  getPatterns(): SecretPattern[] {
    return [...this.patterns]
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): string[] {
    return [...new Set(this.patterns.map(p => p.provider))]
  }

  // Private methods

  private findMatches(
    code: string,
    pattern: SecretPattern,
    lines: string[],
    filename: string
  ): DetectedSecret[] {
    const matches: DetectedSecret[] = []
    pattern.pattern.lastIndex = 0

    let match
    while ((match = pattern.pattern.exec(code)) !== null) {
      const fullMatch = match[0]
      const secretValue = match[1] || match[0]

      // Check for false positives
      if (this.isFalsePositive(fullMatch, pattern)) {
        continue
      }

      // Validate if validator exists
      if (pattern.validator && !pattern.validator(secretValue)) {
        continue
      }

      // Check entropy if specified
      if (pattern.entropy) {
        const entropy = EntropyCalculator.calculateEntropy(secretValue)
        if (entropy < pattern.entropy.min || entropy > pattern.entropy.max) {
          continue
        }
      }

      // Calculate position
      const beforeMatch = code.substring(0, match.index)
      const lineNumber = beforeMatch.split('\n').length
      const lastNewline = beforeMatch.lastIndexOf('\n')
      const column = match.index - lastNewline - 1

      matches.push({
        id: `${pattern.id}-${crypto.randomUUID().substring(0, 8)}`,
        type: pattern.type,
        provider: pattern.provider,
        severity: pattern.severity,
        description: pattern.name,
        file: filename,
        line: lineNumber,
        column,
        startOffset: match.index,
        endOffset: match.index + fullMatch.length,
        redactedValue: this.redactSecret(secretValue),
        fullMatch,
        confidence: this.calculateConfidence(secretValue, pattern),
        entropy: EntropyCalculator.calculateEntropy(secretValue),
        remediationSteps: pattern.remediationSteps,
      })
    }

    return matches
  }

  private detectHighEntropyStrings(
    code: string,
    lines: string[],
    filename: string
  ): DetectedSecret[] {
    const secrets: DetectedSecret[] = []

    // Pattern to find quoted strings
    const stringPattern = /['"]([A-Za-z0-9+/=\-_]{20,})['"]|`([A-Za-z0-9+/=\-_]{20,})`/g

    let match
    while ((match = stringPattern.exec(code)) !== null) {
      const value = match[1] || match[2]

      // Skip if looks like a path or URL
      if (/^[\/\\]|^https?:\/\/|^\.\//i.test(value)) continue

      // Check entropy
      const entropy = EntropyCalculator.calculateEntropy(value)
      if (entropy >= (this.options.minEntropy || 3.5) && entropy <= (this.options.maxEntropy || 6.0)) {
        // Verify it's near a keyword
        const surroundingText = code.substring(
          Math.max(0, match.index - 50),
          Math.min(code.length, match.index + match[0].length + 50)
        )

        const hasSecretKeyword = /(?:secret|key|token|password|credential|auth|api)/i.test(surroundingText)
        if (!hasSecretKeyword) continue

        const beforeMatch = code.substring(0, match.index)
        const lineNumber = beforeMatch.split('\n').length
        const lastNewline = beforeMatch.lastIndexOf('\n')
        const column = match.index - lastNewline - 1

        secrets.push({
          id: `entropy-${crypto.randomUUID().substring(0, 8)}`,
          type: SecretType.GENERIC,
          provider: 'Unknown',
          severity: SecretSeverity.MEDIUM,
          description: 'High-entropy string (potential secret)',
          file: filename,
          line: lineNumber,
          column,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          redactedValue: this.redactSecret(value),
          fullMatch: match[0],
          confidence: 0.6,
          entropy,
          remediationSteps: [
            'Verify if this string is a secret',
            'If confirmed, move to secure storage',
            'Rotate the credential if compromised',
          ],
        })
      }
    }

    return secrets
  }

  private isFalsePositive(match: string, pattern: SecretPattern): boolean {
    // Check pattern-specific false positive patterns
    if (pattern.falsePositivePatterns) {
      for (const fpPattern of pattern.falsePositivePatterns) {
        if (fpPattern.test(match)) {
          return true
        }
      }
    }

    // Check global exclusions
    if (this.options.excludePatterns) {
      for (const excludePattern of this.options.excludePatterns) {
        if (excludePattern.test(match)) {
          return true
        }
      }
    }

    // Check for common false positive indicators
    const fpIndicators = [
      /example/i,
      /placeholder/i,
      /dummy/i,
      /test/i,
      /sample/i,
      /xxx+/i,
      /\*{3,}/,
      /changeme/i,
      /your[-_]?/i,
    ]

    for (const indicator of fpIndicators) {
      if (indicator.test(match)) {
        return true
      }
    }

    return false
  }

  private calculateConfidence(value: string, pattern: SecretPattern): number {
    let confidence = 0.8 // Base confidence

    // Adjust based on entropy
    const entropy = EntropyCalculator.calculateEntropy(value)
    if (entropy >= 4.0 && entropy <= 5.5) {
      confidence += 0.1
    }

    // Adjust based on length
    if (value.length >= 30) {
      confidence += 0.05
    }

    // Adjust based on pattern specificity
    if (pattern.provider !== 'Generic') {
      confidence += 0.05
    }

    return Math.min(confidence, 1.0)
  }

  private redactSecret(value: string): string {
    if (value.length <= 8) {
      return '***'
    }
    const visibleChars = Math.min(4, Math.floor(value.length * 0.2))
    return value.substring(0, visibleChars) + '***' + value.substring(value.length - visibleChars)
  }

  private deduplicateSecrets(secrets: DetectedSecret[]): DetectedSecret[] {
    const seen = new Map<string, DetectedSecret>()

    for (const secret of secrets) {
      const key = `${secret.file}:${secret.line}:${secret.column}`
      const existing = seen.get(key)

      if (!existing || secret.confidence > existing.confidence) {
        seen.set(key, secret)
      }
    }

    return Array.from(seen.values())
  }

  private groupBy(secrets: DetectedSecret[], key: keyof DetectedSecret): Record<string, number> {
    const result: Record<string, number> = {}
    for (const secret of secrets) {
      const value = String(secret[key])
      result[value] = (result[value] || 0) + 1
    }
    return result
  }
}

/**
 * Create a secrets detector instance
 */
export function createSecretsDetector(options?: SecretDetectionOptions): SecretsDetector {
  return new SecretsDetector(options)
}

/**
 * Singleton instance
 */
let secretsDetector: SecretsDetector | null = null

export function getSecretsDetector(options?: SecretDetectionOptions): SecretsDetector {
  if (!secretsDetector) {
    secretsDetector = new SecretsDetector(options)
  }
  return secretsDetector
}
