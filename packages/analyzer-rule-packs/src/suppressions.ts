/**
 * High-confidence suppressions for Tier-1 IDE noise control.
 * Better to skip a hit near a known-safe sink than flood the editor.
 */

const SAFE_SINK_RE =
  /DOMPurify|sanitizeHtml|sanitize\s*\(|escapeHtml|he\.encode|validator\.escape|xssFilters|shell\s*:\s*false|PreparedStatement|parameterized|textContent\s*=|createTextNode|JSON\.parse\s*\(\s*['"`]/i

const TEST_PATH_HINT_RE =
  /\b(?:__tests__|\.test\.|\.spec\.|\/tests?\/|\\tests?\\)/i

/**
 * Returns true when the hit should be suppressed (likely safe / noisy).
 */
export function shouldSuppressFinding(
  source: string,
  startIndex: number,
  endIndex: number,
  filePathHint?: string
): boolean {
  if (filePathHint && TEST_PATH_HINT_RE.test(filePathHint)) {
    return true
  }
  const windowStart = Math.max(0, startIndex - 160)
  const windowEnd = Math.min(source.length, endIndex + 160)
  const ctx = source.slice(windowStart, windowEnd)
  return SAFE_SINK_RE.test(ctx)
}

/**
 * Approximate char offset from 1-based line/column.
 */
export function offsetFromLineCol(source: string, line: number, column: number): number {
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1
  }
  return offset + Math.max(0, column - 1)
}
