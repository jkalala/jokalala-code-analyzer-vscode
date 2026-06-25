/**
 * Secrets Pre-screener
 *
 * Scans code BEFORE it is transmitted to the Jokalala backend API.
 * If hardcoded secrets are detected, the user is warned and must
 * explicitly consent before the analysis proceeds.
 *
 * This prevents accidental exfiltration of API keys, tokens, and
 * passwords that developers may have temporarily committed to source.
 *
 * Pattern catalogue is intentionally lightweight here — the full
 * 150-pattern catalogue lives in secrets-detector.ts and runs server-side.
 * This is a fast client-side gate, not a complete scanner.
 */

import * as vscode from 'vscode'

// ── Pattern definitions ──────────────────────────────────────────────────────

interface SecretPattern {
  name: string
  regex: RegExp
  severity: 'critical' | 'high' | 'medium'
}

const PATTERNS: SecretPattern[] = [
  // Private keys
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: 'critical',
  },
  // AWS
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'critical',
  },
  {
    name: 'AWS Secret Access Key',
    regex: /aws[_\-.]?secret[_\-.]?(?:access[_\-.]?)?key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i,
    severity: 'critical',
  },
  // GitHub / GitLab
  {
    name: 'GitHub Token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/,
    severity: 'critical',
  },
  {
    name: 'GitLab Token',
    regex: /\bglpat-[A-Za-z0-9\-_]{20,}\b/,
    severity: 'critical',
  },
  // Generic Bearer / API tokens
  {
    name: 'Bearer Token Assignment',
    regex: /(?:bearer|api[_\-.]?(?:key|token|secret))\s*[=:]\s*['"]?[A-Za-z0-9\-._~+/]{20,}['"]?/i,
    severity: 'high',
  },
  // Database connection strings
  {
    name: 'Database Connection String',
    regex: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
    severity: 'critical',
  },
  // Generic password assignments
  {
    name: 'Password Assignment',
    regex: /\b(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{6,}['"]/i,
    severity: 'high',
  },
  // JWT (don't send raw JWTs back to the server)
  {
    name: 'JSON Web Token',
    regex: /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/,
    severity: 'critical',
  },
  // Stripe / Twilio
  {
    name: 'Stripe Secret Key',
    regex: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/,
    severity: 'critical',
  },
  {
    name: 'Twilio Auth Token',
    regex: /\bSK[0-9a-f]{32}\b/,
    severity: 'high',
  },
]

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScreeningResult {
  hasSecrets: boolean
  findings: SecretFinding[]
}

export interface SecretFinding {
  name: string
  severity: 'critical' | 'high' | 'medium'
  /** Line number (1-based) */
  line: number
  /** Redacted snippet for display only */
  snippet: string
}

// ── Screener ─────────────────────────────────────────────────────────────────

/**
 * Scan `code` for hardcoded secrets.
 * Returns findings with line numbers — never returns the matched secret value.
 */
export function screenForSecrets(code: string): ScreeningResult {
  const findings: SecretFinding[] = []
  const lines = code.split('\n')

  for (const pattern of PATTERNS) {
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      if (pattern.regex.test(lines[lineIdx])) {
        findings.push({
          name: pattern.name,
          severity: pattern.severity,
          line: lineIdx + 1,
          // Show only the first 40 chars of the line, redacted
          snippet: lines[lineIdx].trim().slice(0, 40).replace(/./g, (c, i) =>
            i > 8 ? '*' : c
          ),
        })
        // One finding per pattern per file is enough for the gate
        break
      }
    }
  }

  return { hasSecrets: findings.length > 0, findings }
}

/**
 * Show a warning dialog when secrets are found and ask the user whether
 * to proceed with sending the code to the API.
 *
 * Returns `true` if the user explicitly consents, `false` otherwise.
 */
export async function requestConsentForSecretsInCode(
  findings: SecretFinding[]
): Promise<boolean> {
  const critical = findings.filter(f => f.severity === 'critical').length
  const high = findings.filter(f => f.severity === 'high').length

  const summary = [
    critical > 0 ? `${critical} critical` : '',
    high > 0 ? `${high} high-severity` : '',
  ]
    .filter(Boolean)
    .join(' and ')

  const names = [...new Set(findings.map(f => f.name))].join(', ')

  const choice = await vscode.window.showWarningMessage(
    `⚠️ Potential secrets detected in your code (${summary}): ${names}.\n\n` +
      `Sending this code to the Jokalala API may expose sensitive credentials. ` +
      `Please remove hardcoded secrets before sharing.`,
    { modal: true },
    'Send Anyway',
    'Cancel'
  )

  return choice === 'Send Anyway'
}
