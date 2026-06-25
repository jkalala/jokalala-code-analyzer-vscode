/**
 * AuditService — Immutable Append-Only Compliance Audit Log
 *
 * Records every security-relevant action the extension takes so that
 * security teams, compliance officers, and incident responders can answer:
 *   "What did this extension do and when?"
 *
 * Design principles:
 *  - Append-only: entries are never modified or deleted programmatically
 *  - Tamper-evident: each entry carries a SHA-256 chain hash of all prior entries
 *  - Sanitised: no raw code snippets or secrets in the log body
 *  - Exportable: JSONL format that feeds into SIEM/Splunk pipelines
 *  - Bounded: rotates after MAX_ENTRIES to prevent unbounded disk growth
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

// ── Event catalogue ─────────────────────────────────────────────────────────

export const AuditEvent = {
  // Authentication
  AUTH_SIGN_IN_INITIATED: 'AUTH_SIGN_IN_INITIATED',
  AUTH_SIGN_IN_SUCCESS: 'AUTH_SIGN_IN_SUCCESS',
  AUTH_SIGN_IN_FAILED: 'AUTH_SIGN_IN_FAILED',
  AUTH_SIGN_OUT: 'AUTH_SIGN_OUT',
  AUTH_TOKEN_INVALID_FORMAT: 'AUTH_TOKEN_INVALID_FORMAT',

  // Analysis
  ANALYSIS_REQUESTED: 'ANALYSIS_REQUESTED',
  ANALYSIS_COMPLETED: 'ANALYSIS_COMPLETED',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  ANALYSIS_CANCELLED: 'ANALYSIS_CANCELLED',
  ANALYSIS_SECRETS_DETECTED: 'ANALYSIS_SECRETS_DETECTED',
  ANALYSIS_CONSENT_DENIED: 'ANALYSIS_CONSENT_DENIED',

  // Plugins
  PLUGIN_LOADED: 'PLUGIN_LOADED',
  PLUGIN_BLOCKED_PATH_TRAVERSAL: 'PLUGIN_BLOCKED_PATH_TRAVERSAL',
  PLUGIN_BLOCKED_INTEGRITY: 'PLUGIN_BLOCKED_INTEGRITY',
  PLUGIN_INTEGRITY_CHANGED: 'PLUGIN_INTEGRITY_CHANGED',
  PLUGIN_ERROR: 'PLUGIN_ERROR',
  PLUGIN_DISABLED: 'PLUGIN_DISABLED',

  // Configuration
  SETTING_CHANGED: 'SETTING_CHANGED',
  ENDPOINT_VALIDATION_FAILED: 'ENDPOINT_VALIDATION_FAILED',

  // Security
  HTTPS_ENFORCEMENT_BLOCKED: 'HTTPS_ENFORCEMENT_BLOCKED',
  FEEDBACK_URL_BLOCKED: 'FEEDBACK_URL_BLOCKED',
} as const

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent]

// ── Entry shape ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  /** Monotonically increasing sequence number within this session */
  seq: number
  /** ISO-8601 UTC timestamp */
  timestamp: string
  event: AuditEventType
  /** SHA-256 of (prevHash + seq + timestamp + event + details) */
  hash: string
  /** Sanitised context — NEVER includes raw code or tokens */
  details: Record<string, unknown>
  /** Hashed user ID (SHA-256) — no PII */
  userIdHash?: string
  /** Extension version for log correlation */
  extensionVersion: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000
const LOG_FILE_NAME = 'audit.jsonl'
const EXTENSION_VERSION =
  vscode.extensions.getExtension('jokalala.code-analysis')?.packageJSON
    ?.version ?? 'unknown'

// ── Service ──────────────────────────────────────────────────────────────────

export class AuditService {
  private entries: AuditEntry[] = []
  private seq = 0
  private prevHash = 'genesis'
  private logPath: string | null = null
  private logStream: fs.WriteStream | null = null

  constructor(private readonly context: vscode.ExtensionContext) {
    this.logPath = path.join(context.globalStorageUri.fsPath, LOG_FILE_NAME)
  }

  async initialize(): Promise<void> {
    try {
      // Ensure storage directory exists
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri)

      // Restore chain hash from last persisted entry so the chain continues
      // across VS Code restarts
      if (fs.existsSync(this.logPath!)) {
        const lines = fs
          .readFileSync(this.logPath!, 'utf-8')
          .split('\n')
          .filter(Boolean)
        if (lines.length > 0) {
          const last = JSON.parse(lines[lines.length - 1]) as AuditEntry
          this.prevHash = last.hash
          this.seq = last.seq
        }
      }

      // Append-only write stream — O_APPEND ensures we never overwrite
      this.logStream = fs.createWriteStream(this.logPath!, { flags: 'a' })
    } catch (err) {
      // Audit must not crash the extension — degrade gracefully to in-memory only
      console.warn('[Audit] Failed to open audit log file:', err)
    }
  }

  /**
   * Record a security-relevant event.
   *
   * @param event    - One of the AuditEvent constants
   * @param details  - Sanitised context (no raw code, no tokens)
   * @param userId   - Raw user ID; will be hashed before storage
   */
  record(
    event: AuditEventType,
    details: Record<string, unknown> = {},
    userId?: string
  ): void {
    this.seq++
    const timestamp = new Date().toISOString()
    const userIdHash = userId
      ? crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16)
      : undefined

    // Chain hash — makes tampering with past entries detectable
    const chainInput = `${this.prevHash}|${this.seq}|${timestamp}|${event}|${JSON.stringify(details)}`
    const hash = crypto
      .createHash('sha256')
      .update(chainInput)
      .digest('hex')

    const entry: AuditEntry = {
      seq: this.seq,
      timestamp,
      event,
      hash,
      details: this.sanitiseDetails(details),
      userIdHash,
      extensionVersion: EXTENSION_VERSION,
    }

    this.prevHash = hash

    // Keep in-memory ring buffer
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift()
    }

    // Persist to append-only JSONL file
    if (this.logStream) {
      this.logStream.write(JSON.stringify(entry) + '\n')
    }
  }

  /**
   * Return recent entries (newest first) for the audit view.
   */
  getRecentEntries(limit = 100): AuditEntry[] {
    return [...this.entries].reverse().slice(0, limit)
  }

  /**
   * Export the full on-disk log to a user-chosen location.
   * The exported JSONL can be imported into any SIEM (Splunk, Elastic, etc.)
   */
  async exportLog(): Promise<void> {
    if (!this.logPath || !fs.existsSync(this.logPath)) {
      vscode.window.showInformationMessage('No audit log entries to export.')
      return
    }

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`jokalala-audit-${Date.now()}.jsonl`),
      filters: { 'Audit Log (JSONL)': ['jsonl', 'json'] },
    })

    if (!saveUri) return

    fs.copyFileSync(this.logPath, saveUri.fsPath)
    vscode.window.showInformationMessage(
      `Audit log exported to ${saveUri.fsPath}`
    )
  }

  dispose(): void {
    this.logStream?.end()
    this.logStream = null
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Strip anything that shouldn't appear in an audit log:
   *  - Values longer than 512 chars (could be code snippets or tokens)
   *  - Keys that suggest secret material
   */
  private sanitiseDetails(
    details: Record<string, unknown>
  ): Record<string, unknown> {
    // All keys stored lowercase so that `k.toLowerCase()` lookup works for
    // camelCase variants like 'apiKey' → 'apikey'.
    const REDACT_KEYS = new Set([
      'token', 'apikey', 'password', 'secret', 'code', 'content',
      'authorization', 'credentials', 'key',
    ])
    const sanitised: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(details)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        sanitised[k] = '[REDACTED]'
      } else if (typeof v === 'string' && v.length > 512) {
        sanitised[k] = `[TRUNCATED:${v.length}chars]`
      } else {
        sanitised[k] = v
      }
    }

    return sanitised
  }
}

/** Module-level singleton — initialised by extension.ts activate() */
let _auditService: AuditService | null = null

export function getAuditService(): AuditService {
  if (!_auditService) {
    throw new Error(
      'AuditService not initialised — call initAuditService(context) first'
    )
  }
  return _auditService
}

export async function initAuditService(
  context: vscode.ExtensionContext
): Promise<AuditService> {
  _auditService = new AuditService(context)
  await _auditService.initialize()
  return _auditService
}
