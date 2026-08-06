/**
 * Inline suppression directives — the reviewed-and-accepted escape hatch.
 *
 * Without these, one false positive forces users to disable a rule globally;
 * with them, the suppression is visible in the diff and scoped to one line.
 *
 * Supported (case-insensitive, in //, #, /*, --, or <!-- comments):
 *   code();            // jokalala-ignore                 → this line, all rules
 *   code();            // jokalala-ignore: rule-a, rule-b → this line, listed rules
 *   // jokalala-ignore                                    → next line (standalone)
 *   // jokalala-ignore-next-line [rules]                  → next line, explicit
 *   code();            // nosec | NOSONAR                 → this line (compat)
 *
 * Trailing comments target their own line; a directive alone on a line
 * targets the line below it (matching semgrep's nosemgrep convention).
 */

// The rule list is only read when an explicit `:` follows the keyword.
// Without this, `# nosec B101` (Bandit's standard form) or a trailing
// `// jokalala-ignore false positive` would be parsed as a rule filter and
// silently suppress nothing — the opposite of what the author asked for.
const DIRECTIVE_RE =
  /(?:\/\/|#|\/\*|<!--|--)[ \t]*(jokalala-ignore-next-line|jokalala-ignore|nosec|nosonar)\b(?:[ \t]*:[ \t]*([A-Za-z0-9_.,\- \t]*))?/i

const RULE_TOKEN_RE = /^[\w.-]+$/

export interface SuppressionIndex {
  /** True when a directive suppresses this rule at this 1-based line. */
  isSuppressed(line: number, ruleId: string): boolean
  /** Number of directive comments found in the file. */
  directiveCount: number
}

export function buildSuppressionIndex(source: string): SuppressionIndex {
  // line → null (all rules) | set of rule ids
  const byLine = new Map<number, Set<string> | null>()
  let directiveCount = 0

  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    const m = DIRECTIVE_RE.exec(text)
    if (!m) continue
    directiveCount++

    const keyword = m[1].toLowerCase()
    const ruleTokens = (m[2] || '')
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && RULE_TOKEN_RE.test(t))
    const rules = ruleTokens.length > 0 ? new Set(ruleTokens) : null

    // Standalone = the directive comment occupies the whole line, so it
    // targets the line below. A trailing reason ("// jokalala-ignore known
    // false positive") stays standalone: for line comments everything after
    // the keyword is still comment text. Block comments are only standalone
    // when no code follows the terminator — `/* … */ code()` behaves like a
    // trailing comment and targets its own line.
    const beforeEmpty = text.slice(0, m.index).trim().length === 0
    const isBlockComment = /^(?:\/\*|<!--)/.test(m[0])
    const afterTerminator = isBlockComment
      ? text.slice(m.index + m[0].length).replace(/^[^]*?(?:\*\/|-->)/, '').trim()
      : ''
    const standalone = beforeEmpty && (!isBlockComment || afterTerminator.length === 0)
    const targetLine =
      keyword === 'jokalala-ignore-next-line' || standalone ? i + 2 : i + 1

    const existing = byLine.get(targetLine)
    if (existing === null) continue // already suppressing everything
    if (rules === null || existing === undefined) {
      byLine.set(targetLine, rules)
    } else {
      for (const r of rules) existing.add(r)
    }
  }

  return {
    directiveCount,
    isSuppressed(line: number, ruleId: string): boolean {
      const entry = byLine.get(line)
      if (entry === undefined) return false
      if (entry === null) return true
      return entry.has(ruleId)
    },
  }
}
