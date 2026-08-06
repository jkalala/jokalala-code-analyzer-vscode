/**
 * Baseline ("known findings") support for brownfield adoption.
 *
 * A baseline snapshots the fingerprints of every current finding so that
 * subsequent scans report only NEW findings — the standard way to roll a
 * SAST tool into a codebase with existing debt without drowning the team.
 *
 * Fingerprints are content-based (ruleId + normalized file path + normalized
 * line text + occurrence index), deliberately excluding line numbers so that
 * unrelated edits shifting code up or down do not resurrect baselined
 * findings. Editing the flagged line itself invalidates the fingerprint,
 * which is the desired behavior: changed code deserves a fresh look.
 */

import { createHash } from 'crypto'
import type { SecurityIssue } from './security-types'

export interface BaselineFile {
  version: 1
  tool: string
  createdAt: string
  fingerprints: string[]
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

function normalizeLineText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function computeFindingFingerprint(
  ruleId: string,
  filePath: string,
  lineText: string,
  occurrence: number
): string {
  return createHash('sha256')
    .update(
      [ruleId, normalizePath(filePath), normalizeLineText(lineText), String(occurrence)].join('|')
    )
    .digest('hex')
}

/**
 * Fingerprint a scan's issues for one file. Identical lines flagged by the
 * same rule get increasing occurrence indices so a baseline of two duplicate
 * findings does not silently absorb a third copy added later.
 */
export function fingerprintIssues(
  issues: readonly SecurityIssue[],
  filePath: string,
  source: string
): string[] {
  const lines = source.split('\n')
  const occurrences = new Map<string, number>()
  return issues.map((issue) => {
    const lineText = lines[issue.line - 1] ?? issue.codeSnippet ?? ''
    const key = `${issue.ruleId}|${normalizePath(filePath)}|${normalizeLineText(lineText)}`
    const n = occurrences.get(key) ?? 0
    occurrences.set(key, n + 1)
    return computeFindingFingerprint(issue.ruleId, filePath, lineText, n)
  })
}

export function createBaselineFile(fingerprints: readonly string[]): BaselineFile {
  return {
    version: 1,
    tool: 'jokalala-code-analysis',
    createdAt: new Date().toISOString(),
    fingerprints: [...new Set(fingerprints)].sort(),
  }
}

/**
 * Parse baseline JSON tolerantly: malformed content yields an empty set
 * (scan everything) rather than an exception that would break analysis.
 */
export function parseBaselineFile(json: string): Set<string> {
  try {
    const parsed = JSON.parse(json) as Partial<BaselineFile>
    if (!Array.isArray(parsed.fingerprints)) return new Set()
    return new Set(parsed.fingerprints.filter((f) => typeof f === 'string'))
  } catch {
    return new Set()
  }
}
