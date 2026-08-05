/**
 * Pure unified-diff parse + apply (no vscode dependency).
 * Supports single- and multi-file patches with @@ hunks.
 *
 * Ported from the Dev Chat IDE bridge (jokalala/packages/vscode-code-analysis) —
 * this is the same file the web app's Accept-in-IDE flow already talks to, so
 * keep the two in sync rather than letting a third copy drift.
 */

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** Lines including leading ' ', '+', '-', or '\' */
  lines: string[]
}

export interface DiffFilePatch {
  /** Path relative to workspace (no a/ b/ prefix) */
  path: string
  /** True when --- is /dev/null */
  isNew: boolean
  /** True when +++ is /dev/null */
  isDeleted: boolean
  hunks: DiffHunk[]
}

export function looksLikeUnifiedDiff(text: string): boolean {
  return (
    /^diff --git /m.test(text) ||
    /^---\s/m.test(text) ||
    /^\+\+\+\s/m.test(text) ||
    /^@@ /m.test(text)
  )
}

function stripPrefix(p: string): string {
  const t = p.trim().replace(/^\t/, '')
  // --- a/foo\t or --- a/foo
  const withoutStamp = t.split('\t')[0].trim()
  if (withoutStamp === '/dev/null') return '/dev/null'
  return withoutStamp.replace(/^[ab]\//, '')
}

/**
 * Reject paths that would resolve outside the workspace folder when joined
 * with it (`..` segments, absolute paths, drive letters, backslashes used
 * as separators). Mirrors the check in ide-bridge.ts's hydrateWorkspaceFile.
 */
export function isSafeRelativePath(p: string): boolean {
  if (!p || p === '/dev/null') return false
  const normalized = p.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return false
  if (/^[a-zA-Z]:/.test(normalized)) return false
  const segments = normalized.split('/')
  return !segments.some(seg => seg === '..')
}

function parseHunkHeader(line: string): DiffHunk | null {
  const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line)
  if (!m) return null
  return {
    oldStart: parseInt(m[1], 10),
    oldCount: m[2] != null ? parseInt(m[2], 10) : 1,
    newStart: parseInt(m[3], 10),
    newCount: m[4] != null ? parseInt(m[4], 10) : 1,
    lines: [],
  }
}

/**
 * Parse a unified diff into per-file patches.
 */
export function parseUnifiedDiff(patch: string): DiffFilePatch[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  const files: DiffFilePatch[] = []
  let current: DiffFilePatch | null = null
  let currentHunk: DiffHunk | null = null
  let pendingOld: string | null = null

  const pushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk)
      currentHunk = null
    }
  }

  const pushFile = () => {
    pushHunk()
    if (current && (current.path || current.hunks.length)) {
      files.push(current)
    }
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      pushFile()
      const parts = line.slice('diff --git '.length).split(' ')
      const b = parts.find(p => p.startsWith('b/')) || parts[1]
      const path = b ? stripPrefix(b) : 'unknown'
      current = { path, isNew: false, isDeleted: false, hunks: [] }
      pendingOld = null
      continue
    }

    if (line.startsWith('--- ')) {
      pendingOld = stripPrefix(line.slice(4))
      if (!current) {
        current = {
          path: pendingOld === '/dev/null' ? '' : pendingOld,
          isNew: pendingOld === '/dev/null',
          isDeleted: false,
          hunks: [],
        }
      } else if (pendingOld === '/dev/null') {
        current.isNew = true
      }
      continue
    }

    if (line.startsWith('+++ ')) {
      const neu = stripPrefix(line.slice(4))
      if (!current) {
        current = {
          path: neu === '/dev/null' ? pendingOld || '' : neu,
          isNew: pendingOld === '/dev/null',
          isDeleted: neu === '/dev/null',
          hunks: [],
        }
      } else {
        if (neu !== '/dev/null') current.path = neu
        current.isDeleted = neu === '/dev/null'
        if (pendingOld === '/dev/null') current.isNew = true
      }
      pendingOld = null
      continue
    }

    if (line.startsWith('@@ ')) {
      pushHunk()
      currentHunk = parseHunkHeader(line)
      if (!current) {
        current = { path: 'unknown', isNew: false, isDeleted: false, hunks: [] }
      }
      continue
    }

    if (currentHunk && /^[ +\-\\]/.test(line)) {
      currentHunk.lines.push(line)
      continue
    }
  }

  pushFile()
  return files.filter(
    f =>
      f.path &&
      f.path !== '/dev/null' &&
      f.hunks.length > 0 &&
      isSafeRelativePath(f.path)
  )
}

/**
 * Apply hunks to original file text. Returns new content or throws.
 */
export function applyHunksToContent(
  original: string,
  hunks: DiffHunk[]
): string {
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  let lines = original.length ? original.replace(/\r\n/g, '\n').split('\n') : []
  // Drop trailing empty from split if file ended with newline — keep simple:
  if (lines.length && lines[lines.length - 1] === '' && original.endsWith('\n')) {
    lines = lines.slice(0, -1)
  }

  // Apply from bottom so earlier line numbers stay valid
  const ordered = [...hunks].sort((a, b) => b.oldStart - a.oldStart)

  for (const hunk of ordered) {
    const startIdx = Math.max(0, hunk.oldStart - 1)
    const oldLines: string[] = []
    const newLines: string[] = []

    for (const raw of hunk.lines) {
      const tag = raw[0]
      const body = raw.slice(1)
      if (tag === ' ' || tag === '') {
        oldLines.push(body)
        newLines.push(body)
      } else if (tag === '-') {
        oldLines.push(body)
      } else if (tag === '+') {
        newLines.push(body)
      }
      // '\' "No newline" markers ignored
    }

    const slice = lines.slice(startIdx, startIdx + oldLines.length)
    // Verify context actually matches at oldStart (tolerant of leading/
    // trailing whitespace — some callers, e.g. diff-builder.ts's indexOf
    // fallback, emit hunks with leading indentation trimmed off even though
    // the file's actual line has it) before trusting the hunk's line number
    // blindly. A line count that happens to match at oldStart is not proof
    // the content there is what the hunk expects (e.g. the file changed
    // since the diff was generated but net line count stayed the same).
    // Matching length alone used to be treated as "good enough" and would
    // silently overwrite unrelated lines instead of falling back to a
    // content search.
    const exactContextMatches =
      oldLines.length > 0 &&
      slice.length === oldLines.length &&
      slice.every((line, i) => line.trim() === oldLines[i].trim())

    if (oldLines.length > 0 && !exactContextMatches) {
      // Try fuzzy: find oldLines sequence near startIdx
      const found = findSequence(lines, oldLines, startIdx)
      if (found < 0) {
        throw new Error(
          `Hunk @@ -${hunk.oldStart} failed: context mismatch near line ${hunk.oldStart}`
        )
      }
      lines = [
        ...lines.slice(0, found),
        ...newLines,
        ...lines.slice(found + oldLines.length),
      ]
    } else {
      lines = [
        ...lines.slice(0, startIdx),
        ...newLines,
        ...lines.slice(startIdx + oldLines.length),
      ]
    }
  }

  return lines.join(eol) + (original.endsWith('\n') || original.endsWith('\r\n') ? eol : '')
}

function findSequence(
  haystack: string[],
  needle: string[],
  preferNear: number
): number {
  if (needle.length === 0) return preferNear
  const window = 40
  const from = Math.max(0, preferNear - window)
  const to = Math.min(haystack.length - needle.length, preferNear + window)
  for (let i = from; i <= to; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  // Full scan fallback
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

export function summarizePatch(files: DiffFilePatch[]): string {
  const hunkCount = files.reduce((n, f) => n + f.hunks.length, 0)
  const names = files.map(f => f.path).join(', ')
  return `${files.length} file(s), ${hunkCount} hunk(s): ${names}`
}
