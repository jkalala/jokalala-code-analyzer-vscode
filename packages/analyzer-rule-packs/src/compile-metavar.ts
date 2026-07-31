/**
 * Semgrep-lite metavar → RegExp (surface patterns only).
 */

const METAVAR = /\$([A-Z_][A-Z0-9_]*)/g
const DEFAULT_METAVAR_BODY = '[\\w$]+'

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileMetavarPattern(
  pattern: string,
  constraints?: Record<string, string>,
  flags?: string
): RegExp {
  if (!pattern || !pattern.trim()) {
    throw new Error('metavar pattern must be non-empty')
  }

  const parts: string[] = []
  const seenMetavars = new Set<string>()
  let i = 0
  const src = pattern

  while (i < src.length) {
    if (src.startsWith('...', i)) {
      parts.push('[\\s\\S]*?')
      i += 3
      continue
    }

    if (src[i] === '$') {
      METAVAR.lastIndex = i
      const m = METAVAR.exec(src)
      if (m && m.index === i) {
        const name = m[1]
        if (seenMetavars.has(name)) {
          parts.push(`\\k<${name}>`)
        } else {
          seenMetavars.add(name)
          const body = constraints?.[name] || DEFAULT_METAVAR_BODY
          new RegExp(`(?:${body})`)
          parts.push(`(?<${name}>${body})`)
        }
        i += m[0].length
        continue
      }
    }

    if (/\s/.test(src[i])) {
      parts.push('\\s*')
      while (i < src.length && /\s/.test(src[i])) i++
      continue
    }

    parts.push(escapeRegexLiteral(src[i]))
    i++
  }

  const f = flags && flags.length > 0 ? flags : 'g'
  const normalized = f.includes('g') ? f : `${f}g`
  return new RegExp(parts.join(''), normalized)
}
