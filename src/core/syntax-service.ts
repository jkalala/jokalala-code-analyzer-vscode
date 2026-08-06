/**
 * Tree-sitter syntax layer for Python/Java (WASM, via web-tree-sitter).
 *
 * Gives the regex rule packs AST-grade precision without changing the
 * engine's synchronous contract: initialization is async and optional, and
 * until it completes analyze() behaves exactly as before (regex-only).
 * Once ready, the engine uses this service to
 *   1. drop findings whose match lies inside a comment (dead code), and
 *   2. downgrade Python eval/exec/os.system findings whose argument is a
 *      provably static string — the same FP-reducer the JS AST path has.
 *
 * All failures (missing wasm, load errors, parse crashes) degrade to
 * "service not ready" — never to a broken scan.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Parser, Language } from 'web-tree-sitter'

export type SyntaxLanguage = 'python' | 'java'

export interface PythonCallFact {
  startIndex: number
  endIndex: number
  /** Dotted callee text, e.g. "eval", "os.system", "subprocess.run". */
  callee: string
  /** True when the first argument is a string with no interpolation. */
  staticStringArgument: boolean
}

export interface SyntaxFacts {
  language: SyntaxLanguage
  isInComment(offset: number): boolean
  /** Python only; empty for Java. */
  pythonCalls: PythonCallFact[]
}

export interface SyntaxWasmPaths {
  runtimeWasm: string
  grammars: Record<SyntaxLanguage, string>
}

const COMMENT_NODE_TYPES: Record<SyntaxLanguage, string[]> = {
  python: ['comment'],
  java: ['line_comment', 'block_comment'],
}

let initPromise: Promise<boolean> | null = null
let parser: Parser | null = null
const languages = new Map<SyntaxLanguage, Language>()

/**
 * Idempotent async initialization. Resolves true when at least one grammar
 * loaded. Failures are logged to the console and resolve false — callers
 * must not need this to succeed.
 */
export function initSyntaxService(paths: SyntaxWasmPaths): Promise<boolean> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      await Parser.init({
        locateFile: (name: string) =>
          name.endsWith('.wasm') ? paths.runtimeWasm : name,
      })
      parser = new Parser()
    } catch (err) {
      console.warn('[jokalala] tree-sitter runtime init failed:', err)
      return false
    }
    let loaded = 0
    for (const lang of Object.keys(paths.grammars) as SyntaxLanguage[]) {
      try {
        const bytes = fs.readFileSync(paths.grammars[lang])
        languages.set(lang, await Language.load(new Uint8Array(bytes)))
        loaded++
      } catch (err) {
        console.warn(`[jokalala] tree-sitter grammar load failed (${lang}):`, err)
      }
    }
    return loaded > 0
  })()
  return initPromise
}

/** Convenience: init from a directory laid out by scripts/esbuild.js. */
export function initSyntaxServiceFromDir(wasmDir: string): Promise<boolean> {
  return initSyntaxService({
    runtimeWasm: path.join(wasmDir, 'web-tree-sitter.wasm'),
    grammars: {
      python: path.join(wasmDir, 'tree-sitter-python.wasm'),
      java: path.join(wasmDir, 'tree-sitter-java.wasm'),
    },
  })
}

export function isSyntaxReady(language: string): boolean {
  return parser !== null && languages.has(language as SyntaxLanguage)
}

/** Test hook: drop all loaded state so not-ready behavior can be exercised. */
export function resetSyntaxService(): void {
  // The parser holds WASM heap memory the JS GC cannot reclaim, so each
  // init/reset cycle would otherwise leak one parser.
  try {
    parser?.delete()
  } catch {
    // Already deleted or runtime torn down — nothing to reclaim.
  }
  initPromise = null
  parser = null
  languages.clear()
}

function pythonCalleeText(code: string, fnNode: any): string | null {
  if (!fnNode) return null
  if (fnNode.type === 'identifier') return code.slice(fnNode.startIndex, fnNode.endIndex)
  if (fnNode.type === 'attribute') {
    const text = code.slice(fnNode.startIndex, fnNode.endIndex)
    // Keep only simple dotted names (os.system); reject call chains etc.
    return /^[\w.]+$/.test(text) ? text : null
  }
  return null
}

function isStaticPythonString(argNode: any): boolean {
  if (!argNode) return false
  if (argNode.type !== 'string' && argNode.type !== 'concatenated_string') return false
  // f-strings parse as `string` containing `interpolation` children.
  return argNode.descendantsOfType('interpolation').length === 0
}

function collectPythonCalls(code: string, root: any): PythonCallFact[] {
  const facts: PythonCallFact[] = []
  for (const call of root.descendantsOfType('call')) {
    const callee = pythonCalleeText(code, call.childForFieldName('function'))
    if (!callee) continue
    const args = call.childForFieldName('arguments')
    let firstArg: any = null
    if (args) {
      for (const child of args.namedChildren) {
        if (child.type === 'keyword_argument' || child.type === 'comment') continue
        firstArg = child
        break
      }
    }
    facts.push({
      startIndex: call.startIndex,
      endIndex: call.endIndex,
      callee,
      staticStringArgument: isStaticPythonString(firstArg),
    })
  }
  return facts
}

/**
 * Parse and extract the facts the engine needs. Returns null when the
 * service is not ready for this language or parsing fails — the caller
 * then simply skips syntax-aware refinement.
 */
export function getSyntaxFacts(code: string, language: string): SyntaxFacts | null {
  const lang = language as SyntaxLanguage
  if (!parser || !languages.has(lang)) return null
  let tree: ReturnType<Parser['parse']> = null
  try {
    parser.setLanguage(languages.get(lang)!)
    tree = parser.parse(code)
    if (!tree) return null
    const root: any = tree.rootNode

    const commentRanges: Array<{ start: number; end: number }> = []
    for (const node of root.descendantsOfType(COMMENT_NODE_TYPES[lang])) {
      commentRanges.push({ start: node.startIndex, end: node.endIndex })
    }
    commentRanges.sort((a, b) => a.start - b.start)

    const pythonCalls = lang === 'python' ? collectPythonCalls(code, root) : []

    return {
      language: lang,
      pythonCalls,
      isInComment(offset: number): boolean {
        for (const r of commentRanges) {
          if (offset < r.start) return false
          if (offset < r.end) return true
        }
        return false
      },
    }
  } catch (err) {
    console.warn(`[jokalala] tree-sitter parse failed (${lang}):`, err)
    return null
  } finally {
    // Trees hold WASM heap memory; release even if extraction threw.
    try {
      tree?.delete()
    } catch {
      // Nothing reclaimable.
    }
  }
}
