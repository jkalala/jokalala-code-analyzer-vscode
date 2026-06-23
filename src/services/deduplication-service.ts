/**
 * DeduplicationService
 *
 * Consolidates duplicate findings that arise when both static analysis and the
 * LLM stage detect the same issue. Without deduplication, users see 2-4 copies
 * of every finding — a known cause of negative reviews vs. SonarLint / Snyk.
 *
 * Strategy:
 * - Key = line + normalised category string (punctuation/spaces stripped)
 * - When two findings share a key, keep the one with higher severity
 * - If severity is equal, prefer 'static' (deterministic) over 'llm'
 * - Issues confirmed by BOTH stages get source set to 'both' for UI badging
 */

import type { Issue } from '../interfaces/code-analysis-service.interface'

const SEVERITY_RANK: Record<Issue['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
}

function normaliseCategory(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function deduplicationKey(issue: Issue): string {
  const line = issue.line ?? issue.location?.startLine ?? 0
  return `${line}:${normaliseCategory(issue.category)}`
}

export type DeduplicatedIssue = Issue & { source: 'static' | 'llm' | 'both' }

export class DeduplicationService {
  /**
   * Deduplicate a flat list of issues from both analysis stages.
   * Returns a new array with duplicates merged.
   */
  static deduplicate(issues: Issue[]): DeduplicatedIssue[] {
    const map = new Map<string, DeduplicatedIssue>()

    for (const issue of issues) {
      const key = deduplicationKey(issue)
      const existing = map.get(key)

      if (!existing) {
        map.set(key, { ...issue, source: issue.source as DeduplicatedIssue['source'] })
        continue
      }

      const existingRank = SEVERITY_RANK[existing.severity]
      const incomingRank = SEVERITY_RANK[issue.severity]

      if (incomingRank > existingRank) {
        // Incoming is more severe — take it, preserve 'both' if applicable
        const source: DeduplicatedIssue['source'] =
          existing.source !== issue.source ? 'both' : issue.source
        map.set(key, { ...issue, source })
      } else if (incomingRank === existingRank) {
        // Same severity — mark as confirmed by both stages
        const source: DeduplicatedIssue['source'] =
          existing.source !== issue.source ? 'both' : existing.source
        map.set(key, { ...existing, source })
      }
      // Existing is more severe — keep it, still mark 'both' if stages differ
      else if (existing.source !== issue.source) {
        map.set(key, { ...existing, source: 'both' })
      }
    }

    // Sort: critical first, then by line number
    return Array.from(map.values()).sort((a, b) => {
      const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (rankDiff !== 0) return rankDiff
      const aLine = a.line ?? a.location?.startLine ?? 0
      const bLine = b.line ?? b.location?.startLine ?? 0
      return aLine - bLine
    })
  }

  /** Returns stats for logging / telemetry */
  static stats(before: Issue[], after: DeduplicatedIssue[]): {
    originalCount: number
    deduplicatedCount: number
    removedCount: number
    bothStagesCount: number
  } {
    return {
      originalCount: before.length,
      deduplicatedCount: after.length,
      removedCount: before.length - after.length,
      bothStagesCount: after.filter(i => i.source === 'both').length,
    }
  }
}
