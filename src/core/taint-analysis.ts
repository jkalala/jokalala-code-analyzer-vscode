/**
 * Intraprocedural taint analysis for JS/TS (Tier 1).
 *
 * Tracks attacker-controlled data (Express request objects, DOM location,
 * process.argv) from source to sink through variable assignments, string
 * operations, and template literals, with sanitizer and parameterized-query
 * awareness. Precision-first policy: taint does NOT propagate through unknown
 * function calls or tagged templates (sql`...` tags are parameterized), so a
 * finding here means an unbroken, explainable source→sink path.
 *
 * Runs on the same Babel AST as the pack visitors — one parse per file.
 */

import traverseImport from '@babel/traverse'
import type { Node } from '@babel/types'

const traverse =
  typeof traverseImport === 'function'
    ? traverseImport
    : (traverseImport as { default: typeof traverseImport }).default

export type TaintSourceType = 'http-request' | 'dom' | 'process-argv'

export type SinkKind = 'sql' | 'command' | 'code' | 'xss' | 'path' | 'redirect'

export interface TaintStep {
  line: number
  column: number
  snippet: string
  note: string
}

export interface TaintFinding {
  kind: SinkKind
  ruleId: string
  cweId: string
  owaspCategory: string
  category: string
  name: string
  message: string
  recommendation: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  line: number
  column: number
  endLine?: number
  endColumn?: number
  sinkSnippet: string
  source: { type: TaintSourceType; line: number; column: number; snippet: string }
  steps: TaintStep[]
  /** Names of partial sanitizers seen on the path (reduce, don't clear, taint). */
  partialSanitizers: string[]
  /** Computed from source kind, path length, and sanitizer evidence. */
  confidence: number
}

interface Taint {
  sourceType: TaintSourceType
  sourceLine: number
  sourceColumn: number
  sourceSnippet: string
  steps: TaintStep[]
  /** Sink kinds this value has been made safe for (e.g. path.basename → 'path'). */
  sanitizedKinds: Set<SinkKind>
  partialSanitizers: string[]
}

interface SinkRuleMeta {
  ruleId: string
  cweId: string
  owaspCategory: string
  category: string
  name: string
  sinkLabel: string
  recommendation: string
  baseSeverity: 'critical' | 'high' | 'medium'
}

const SINK_RULES: Record<SinkKind, SinkRuleMeta> = {
  sql: {
    ruleId: 'js-taint-sql-injection',
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    category: 'injection',
    name: 'SQL Injection (tainted query string)',
    sinkLabel: 'a SQL query',
    recommendation:
      'Use parameterized queries — pass values as bind parameters (db.query("... WHERE id = ?", [id])), never concatenate them into the SQL string.',
    baseSeverity: 'critical',
  },
  command: {
    ruleId: 'js-taint-command-injection',
    cweId: 'CWE-78',
    owaspCategory: 'A03:2021',
    category: 'injection',
    name: 'Command Injection (tainted shell command)',
    sinkLabel: 'a child_process command',
    recommendation:
      'Never build shell commands from user input. Use execFile/spawn with an argument array (no shell), and validate the input against an allowlist.',
    baseSeverity: 'critical',
  },
  code: {
    ruleId: 'js-taint-code-injection',
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021',
    category: 'injection',
    name: 'Code Injection (tainted dynamic evaluation)',
    sinkLabel: 'dynamic code evaluation',
    recommendation:
      'Do not pass user-influenced strings to eval/new Function/setTimeout. Restructure to dispatch over an allowlisted set of operations instead.',
    baseSeverity: 'critical',
  },
  xss: {
    ruleId: 'js-taint-xss',
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021',
    category: 'xss',
    name: 'Cross-Site Scripting (tainted HTML sink)',
    sinkLabel: 'an HTML rendering sink',
    recommendation:
      'Use textContent for plain text, or sanitize with DOMPurify.sanitize() before assigning HTML built from user input.',
    baseSeverity: 'high',
  },
  path: {
    ruleId: 'js-taint-path-traversal',
    cweId: 'CWE-22',
    owaspCategory: 'A01:2021',
    category: 'path-traversal',
    name: 'Path Traversal (tainted file path)',
    sinkLabel: 'a filesystem operation',
    recommendation:
      'Resolve the path against a fixed base directory and verify the result stays inside it (path.resolve + startsWith check), or restrict to path.basename(input).',
    baseSeverity: 'high',
  },
  redirect: {
    ruleId: 'js-taint-open-redirect',
    cweId: 'CWE-601',
    owaspCategory: 'A01:2021',
    category: 'open-redirect',
    name: 'Open Redirect (tainted redirect target)',
    sinkLabel: 'a redirect target',
    recommendation:
      'Validate redirect targets against an allowlist of internal paths, or only accept relative paths that you resolve yourself.',
    baseSeverity: 'medium',
  },
}

const SOURCE_BASE_CONFIDENCE: Record<TaintSourceType, number> = {
  'http-request': 0.95,
  dom: 0.9,
  'process-argv': 0.7,
}

const SOURCE_LABEL: Record<TaintSourceType, string> = {
  'http-request': 'an HTTP request',
  dom: 'the browser location/DOM',
  'process-argv': 'process arguments',
}

const REQUEST_OBJECT_NAMES = new Set(['req', 'request', 'ctx'])
const REQUEST_TAINTED_PROPS = new Set(['query', 'params', 'body', 'headers', 'cookies'])
const DOM_LOCATION_PROPS = new Set(['search', 'hash', 'href', 'pathname', 'host', 'hostname'])
const DOCUMENT_TAINTED_PROPS = new Set(['URL', 'documentURI', 'referrer', 'cookie'])

/** String methods whose result stays tainted when the receiver (or a concat arg) is. */
const PROPAGATING_METHODS = new Set([
  'trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'toLocaleLowerCase',
  'toLocaleUpperCase', 'slice', 'substring', 'substr', 'concat', 'padStart', 'padEnd',
  'repeat', 'toString', 'normalize', 'split', 'join', 'at', 'charAt', 'valueOf',
])

/** Global/decoding functions whose result is tainted when the first argument is. */
const PROPAGATING_CALLS = new Set(['String', 'decodeURIComponent', 'decodeURI', 'unescape', 'atob'])

/** Coercions/encodings that neutralize the value for every sink we track. */
const FULL_SANITIZER_CALLS = new Set(['parseInt', 'parseFloat', 'Number', 'Boolean', 'encodeURIComponent'])

/** HTML-context sanitizers: clear XSS taint, leave other kinds tainted. */
const HTML_SANITIZER_NAMES = new Set(['sanitize', 'sanitizeHtml', 'escapeHtml', 'encode', 'escape'])

const FS_METHODS = new Set([
  'readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'createReadStream', 'createWriteStream', 'unlink', 'unlinkSync', 'rm', 'rmSync',
  'rmdir', 'rmdirSync', 'mkdir', 'mkdirSync', 'readdir', 'readdirSync', 'stat', 'statSync',
  'open', 'openSync', 'access', 'accessSync', 'copyFile', 'copyFileSync', 'rename', 'renameSync',
])

const SQL_METHODS = new Set(['query', 'execute', 'raw'])
const EXEC_CALLS = new Set(['exec', 'execSync'])
const SPAWN_CALLS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync'])

/** Identifiers a `require('child_process')` result is conventionally bound to. */
const CHILD_PROCESS_RECEIVERS = new Set([
  'child_process',
  'childProcess',
  'cp',
  'proc',
  'execa',
])

/**
 * True when `x` in `x.exec(...)` plausibly refers to child_process rather
 * than a RegExp or a database handle. Requires evidence — an unrecognized
 * receiver is treated as NOT a command sink, since spawning is the rarer
 * meaning of these method names.
 */
function isChildProcessReceiver(object: Node | null | undefined): boolean {
  if (!object) return false
  const name = dottedName(object)
  if (!name) return false
  if (CHILD_PROCESS_RECEIVERS.has(name)) return true
  // require('child_process').exec(...)
  if (
    object.type === 'CallExpression' &&
    object.callee.type === 'Identifier' &&
    object.callee.name === 'require'
  ) {
    const a = object.arguments[0]
    return a?.type === 'StringLiteral' && a.value === 'child_process'
  }
  return false
}

/** Dotted path for member chains of identifiers, e.g. "window.location.href". */
function dottedName(node: Node | null | undefined): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'ThisExpression') return 'this'
  if (node.type === 'MemberExpression') {
    const obj = dottedName(node.object)
    if (!obj) return null
    const prop = node.property
    if (!node.computed && prop.type === 'Identifier') return `${obj}.${prop.name}`
    if (prop.type === 'StringLiteral') return `${obj}.${prop.value}`
    return `${obj}.*`
  }
  return null
}

function propName(node: Node): string | null {
  if (node.type !== 'MemberExpression') return null
  const prop = node.property
  if (!node.computed && prop.type === 'Identifier') return prop.name
  if (prop.type === 'StringLiteral') return prop.value
  return null
}

function locStart(node: Node): { line: number; column: number } {
  return { line: node.loc?.start.line ?? 1, column: (node.loc?.start.column ?? 0) + 1 }
}

/** Match a member expression that IS a taint source (req.query, location.hash, …). */
function sourceOf(node: Node, code: string): Taint | null {
  if (node.type !== 'MemberExpression') return null
  const prop = propName(node)
  const objName = dottedName(node.object)
  if (!prop || !objName) return null

  let type: TaintSourceType | null = null

  if (REQUEST_OBJECT_NAMES.has(objName) && REQUEST_TAINTED_PROPS.has(prop)) {
    type = 'http-request'
  } else if (
    (objName === 'location' || objName.endsWith('.location')) &&
    DOM_LOCATION_PROPS.has(prop)
  ) {
    type = 'dom'
  } else if (objName === 'document' && DOCUMENT_TAINTED_PROPS.has(prop)) {
    type = 'dom'
  } else if (objName === 'window' && prop === 'name') {
    type = 'dom'
  } else if (objName === 'process' && prop === 'argv') {
    type = 'process-argv'
  }

  if (!type) return null
  const { line, column } = locStart(node)
  return {
    sourceType: type,
    sourceLine: line,
    sourceColumn: column,
    sourceSnippet: snippet(code, node),
    steps: [],
    sanitizedKinds: new Set(),
    partialSanitizers: [],
  }
}

function snippet(code: string, node: Node): string {
  return code.slice(node.start ?? 0, node.end ?? 0).slice(0, 160)
}

function cloneTaint(t: Taint): Taint {
  return {
    ...t,
    steps: [...t.steps],
    sanitizedKinds: new Set(t.sanitizedKinds),
    partialSanitizers: [...t.partialSanitizers],
  }
}

function mergeTaints(a: Taint | null, b: Taint | null): Taint | null {
  if (!a) return b
  if (!b) return a
  const merged = cloneTaint(a)
  // Safety only survives a merge if BOTH operands were made safe for that kind.
  merged.sanitizedKinds = new Set(
    [...a.sanitizedKinds].filter((k) => b.sanitizedKinds.has(k))
  )
  merged.partialSanitizers = [...new Set([...a.partialSanitizers, ...b.partialSanitizers])]
  return merged
}

type Scope = {
  getBinding(name: string): { identifier: Node } | undefined
}

export class TaintAnalyzer {
  private code: string
  private bindingTaint = new Map<object, Taint>()
  private findings: TaintFinding[] = []
  /** Sink locations already reported, to avoid duplicate kinds per node. */
  private reported = new Set<string>()

  constructor(code: string) {
    this.code = code
  }

  analyze(ast: Node): TaintFinding[] {
    this.findings = []
    this.bindingTaint.clear()
    this.reported.clear()

    // Single traversal in source order approximates flow-sensitivity:
    // assignments update binding taint as they are encountered, so a later
    // `x = encodeURIComponent(x)` clears x for sinks that follow it.
    const self = this
    traverse(ast, {
      VariableDeclarator(path: any) {
        self.handleDeclarator(path)
      },
      AssignmentExpression(path: any) {
        self.checkAssignmentSinks(path)
        self.handleAssignment(path)
      },
      CallExpression(path: any) {
        self.checkCallSinks(path)
      },
      NewExpression(path: any) {
        self.checkNewExpression(path)
      },
      JSXAttribute(path: any) {
        self.checkJsxSink(path)
      },
    })

    return this.findings
  }

  // ── Taint propagation ────────────────────────────────────────────────

  private handleDeclarator(path: any): void {
    const { id, init } = path.node
    if (!init) return
    const taint = this.taintOfExpr(init, path.scope)
    if (id.type === 'Identifier') {
      this.setBindingTaint(path.scope, id.name, taint, path.node)
    } else if (id.type === 'ObjectPattern' || id.type === 'ArrayPattern') {
      if (!taint) return
      for (const name of this.patternNames(id)) {
        this.setBindingTaint(path.scope, name, taint, path.node)
      }
    }
  }

  private handleAssignment(path: any): void {
    const { left, right, operator } = path.node
    if (left.type !== 'Identifier') return
    let taint = this.taintOfExpr(right, path.scope)
    if (operator === '+=') {
      // x += tainted keeps any existing taint on x as well.
      const existing = this.getBindingTaint(path.scope, left.name)
      taint = mergeTaints(existing, taint)
    } else if (operator !== '=') {
      return
    }
    this.setBindingTaint(path.scope, left.name, taint, path.node)
  }

  private patternNames(pattern: Node): string[] {
    const names: string[] = []
    const visit = (n: Node | null | undefined): void => {
      if (!n) return
      switch (n.type) {
        case 'Identifier':
          names.push(n.name)
          break
        case 'ObjectPattern':
          for (const p of n.properties) visit(p)
          break
        case 'ObjectProperty':
          visit(n.value as Node)
          break
        case 'ArrayPattern':
          for (const el of n.elements) visit(el as Node)
          break
        case 'AssignmentPattern':
          visit(n.left)
          break
        case 'RestElement':
          visit(n.argument)
          break
      }
    }
    visit(pattern)
    return names
  }

  private setBindingTaint(scope: Scope, name: string, taint: Taint | null, at: Node): void {
    const binding = scope.getBinding(name)
    if (!binding) return
    if (!taint) {
      this.bindingTaint.delete(binding)
      return
    }
    const t = cloneTaint(taint)
    const { line, column } = locStart(at)
    t.steps.push({ line, column, snippet: snippet(this.code, at), note: `assigned to \`${name}\`` })
    this.bindingTaint.set(binding, t)
  }

  private getBindingTaint(scope: Scope, name: string): Taint | null {
    const binding = scope.getBinding(name)
    if (!binding) return null
    return this.bindingTaint.get(binding) || null
  }

  /**
   * Taint of an arbitrary expression under the current binding state.
   * Precision-first: unknown function calls and tagged templates do NOT
   * propagate taint.
   */
  private taintOfExpr(node: Node | null | undefined, scope: Scope): Taint | null {
    if (!node) return null

    switch (node.type) {
      case 'Identifier':
        return this.getBindingTaint(scope, node.name)

      case 'MemberExpression': {
        const src = sourceOf(node, this.code)
        if (src) return src
        // A property read off a tainted object is tainted (req.query.id,
        // parsed.pathname, tainted[i], …).
        return this.taintOfExpr(node.object, scope)
      }

      case 'TemplateLiteral': {
        let t: Taint | null = null
        for (const e of node.expressions) t = mergeTaints(t, this.taintOfExpr(e as Node, scope))
        return t
      }

      case 'BinaryExpression':
        if (node.operator !== '+') return null
        return mergeTaints(
          this.taintOfExpr(node.left as Node, scope),
          this.taintOfExpr(node.right, scope)
        )

      case 'LogicalExpression':
        return mergeTaints(
          this.taintOfExpr(node.left, scope),
          this.taintOfExpr(node.right, scope)
        )

      case 'ConditionalExpression':
        return mergeTaints(
          this.taintOfExpr(node.consequent, scope),
          this.taintOfExpr(node.alternate, scope)
        )

      case 'AssignmentExpression':
        return this.taintOfExpr(node.right, scope)

      case 'SequenceExpression':
        return this.taintOfExpr(node.expressions[node.expressions.length - 1], scope)

      case 'AwaitExpression':
        return this.taintOfExpr(node.argument, scope)

      case 'TSAsExpression':
      case 'TSNonNullExpression':
      case 'TSSatisfiesExpression':
      case 'TSTypeAssertion':
        return this.taintOfExpr((node as any).expression, scope)

      case 'ArrayExpression': {
        let t: Taint | null = null
        for (const el of node.elements) {
          if (el && el.type !== 'SpreadElement') t = mergeTaints(t, this.taintOfExpr(el, scope))
          else if (el && el.type === 'SpreadElement') t = mergeTaints(t, this.taintOfExpr(el.argument, scope))
        }
        return t
      }

      case 'ObjectExpression': {
        let t: Taint | null = null
        for (const p of node.properties) {
          if (p.type === 'ObjectProperty') t = mergeTaints(t, this.taintOfExpr(p.value as Node, scope))
          else if (p.type === 'SpreadElement') t = mergeTaints(t, this.taintOfExpr(p.argument, scope))
        }
        return t
      }

      case 'CallExpression':
        return this.taintOfCall(node, scope)

      default:
        return null
    }
  }

  private taintOfCall(node: Node & { type: 'CallExpression' }, scope: Scope): Taint | null {
    const callee = node.callee
    const args = node.arguments as Node[]
    const firstArgTaint = () =>
      args.length > 0 && args[0].type !== 'SpreadElement'
        ? this.taintOfExpr(args[0], scope)
        : null

    // Bare-function calls: String(x), parseInt(x), escape(x), …
    if (callee.type === 'Identifier') {
      if (FULL_SANITIZER_CALLS.has(callee.name)) return null
      if (PROPAGATING_CALLS.has(callee.name)) return firstArgTaint()
      if (callee.name === 'escape' || callee.name === 'encodeURI') {
        return this.withPartialSanitizer(firstArgTaint(), callee.name)
      }
      // Unknown call: no propagation (precision-first).
      return null
    }

    if (callee.type !== 'MemberExpression') return null
    const method = propName(callee)
    const calleeDotted = dottedName(callee)
    if (!method) return null

    // JSON.stringify escapes quotes but not </script> or HTML metachars.
    if (calleeDotted === 'JSON.stringify') {
      return this.withPartialSanitizer(firstArgTaint(), 'JSON.stringify')
    }

    // path.basename strips directory components → safe for path traversal.
    if (calleeDotted === 'path.basename' || (method === 'basename' && args.length >= 1)) {
      const t = firstArgTaint()
      if (!t) return null
      const cleaned = cloneTaint(t)
      cleaned.sanitizedKinds.add('path')
      return cleaned
    }

    // HTML sanitizers (DOMPurify.sanitize, validator.escape, he.encode,
    // sanitizeHtml via member or bare handled above) → safe for XSS only.
    if (HTML_SANITIZER_NAMES.has(method)) {
      const t = firstArgTaint()
      if (!t) return null
      const cleaned = cloneTaint(t)
      cleaned.sanitizedKinds.add('xss')
      return cleaned
    }

    // String methods on a tainted receiver.
    if (PROPAGATING_METHODS.has(method)) {
      let t = this.taintOfExpr(callee.object, scope)
      if (method === 'concat') {
        for (const a of args) {
          if (a.type !== 'SpreadElement') t = mergeTaints(t, this.taintOfExpr(a, scope))
        }
      }
      return t
    }

    if (method === 'replace' || method === 'replaceAll') {
      return this.withPartialSanitizer(this.taintOfExpr(callee.object, scope), `${method}()`)
    }

    if (calleeDotted === 'Buffer.from') {
      return firstArgTaint()
    }

    // Unknown method call: no propagation.
    return null
  }

  private withPartialSanitizer(t: Taint | null, name: string): Taint | null {
    if (!t) return null
    const c = cloneTaint(t)
    if (!c.partialSanitizers.includes(name)) c.partialSanitizers.push(name)
    return c
  }

  // ── Sinks ────────────────────────────────────────────────────────────

  private checkCallSinks(path: any): void {
    const node = path.node
    const callee = node.callee
    const args = node.arguments as Node[]
    const arg = (i: number): Node | null =>
      args.length > i && args[i].type !== 'SpreadElement' ? args[i] : null

    const method = callee.type === 'MemberExpression' ? propName(callee) : null
    const bareName = callee.type === 'Identifier' ? callee.name : null
    const calleeDotted = dottedName(callee)

    // eval(tainted) / setTimeout("tainted", …)
    if (bareName === 'eval') {
      this.reportIfTainted('code', node, arg(0), path.scope)
      return
    }
    if ((bareName === 'setTimeout' || bareName === 'setInterval') && arg(0)) {
      const a = arg(0)!
      if (a.type !== 'FunctionExpression' && a.type !== 'ArrowFunctionExpression') {
        this.reportIfTainted('code', node, a, path.scope)
      }
      return
    }

    // exec("cmd " + tainted) / spawn(tainted, …)
    //
    // The member form needs a child_process-like receiver: `exec` is also
    // RegExp.prototype.exec (`/ab+/.exec(input)`, `pattern.exec(q)`) and
    // sqlite's `db.exec(sql)`, none of which spawn a process. Matching the
    // bare method name here produced critical false positives on some of
    // the most common code in a JS codebase.
    const isCommandReceiver =
      callee.type === 'MemberExpression' && isChildProcessReceiver(callee.object)

    if (bareName && EXEC_CALLS.has(bareName)) {
      this.reportIfTainted('command', node, arg(0), path.scope)
      return
    }
    if (method && EXEC_CALLS.has(method) && isCommandReceiver) {
      this.reportIfTainted('command', node, arg(0), path.scope)
      return
    }
    if (bareName && SPAWN_CALLS.has(bareName)) {
      this.reportIfTainted('command', node, arg(0), path.scope)
      return
    }
    if (method && SPAWN_CALLS.has(method) && isCommandReceiver) {
      this.reportIfTainted('command', node, arg(0), path.scope)
      return
    }

    if (method && SQL_METHODS.has(method)) {
      // Only the query STRING being tainted is a vulnerability;
      // db.query("… WHERE id = ?", [tainted]) is the parameterized fix.
      this.reportIfTainted('sql', node, arg(0), path.scope)
      return
    }

    // XSS call sinks.
    if (calleeDotted === 'document.write' || calleeDotted === 'document.writeln') {
      this.reportIfTainted('xss', node, arg(0), path.scope)
      return
    }
    if (method === 'insertAdjacentHTML') {
      this.reportIfTainted('xss', node, arg(1), path.scope)
      return
    }
    if (method === 'html' && args.length === 1) {
      this.reportIfTainted('xss', node, arg(0), path.scope)
      return
    }

    // fs.*(taintedPath)
    if (method && FS_METHODS.has(method) && calleeDotted && /^fs[.$]|^fs\b/.test(calleeDotted)) {
      this.reportIfTainted('path', node, arg(0), path.scope)
      return
    }

    // res.redirect(tainted) / location.assign(tainted)
    if (method === 'redirect') {
      this.reportIfTainted('redirect', node, arg(0), path.scope)
      return
    }
    if (
      (method === 'assign' || method === 'replace') &&
      calleeDotted &&
      /(^|\.)location\.(assign|replace)$/.test(calleeDotted)
    ) {
      this.reportIfTainted('redirect', node, arg(0), path.scope)
    }
  }

  private checkNewExpression(path: any): void {
    const node = path.node
    if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
      for (const a of node.arguments as Node[]) {
        if (a.type !== 'SpreadElement' && this.reportIfTainted('code', node, a, path.scope)) return
      }
    }
  }

  private checkAssignmentSinks(path: any): void {
    const { left, right } = path.node
    if (left.type !== 'MemberExpression') return
    const prop = propName(left)
    const leftDotted = dottedName(left)

    if (prop === 'innerHTML' || prop === 'outerHTML') {
      this.reportIfTainted('xss', path.node, right, path.scope)
      return
    }
    // location = t / location.href = t / window.location = t …
    if (leftDotted && /(^|\.)location(\.href)?$/.test(leftDotted)) {
      this.reportIfTainted('redirect', path.node, right, path.scope)
    }
  }

  private checkJsxSink(path: any): void {
    const node = path.node
    const name = node.name
    const attrName =
      name.type === 'JSXIdentifier' ? name.name : name.type === 'JSXNamespacedName' ? name.name.name : ''
    if (attrName !== 'dangerouslySetInnerHTML') return
    const value = node.value
    if (value?.type !== 'JSXExpressionContainer') return
    const expr = value.expression
    if (expr?.type === 'ObjectExpression') {
      for (const p of expr.properties) {
        if (
          p.type === 'ObjectProperty' &&
          ((p.key.type === 'Identifier' && p.key.name === '__html') ||
            (p.key.type === 'StringLiteral' && p.key.value === '__html'))
        ) {
          this.reportIfTainted('xss', node, p.value as Node, path.scope)
        }
      }
    }
  }

  // ── Reporting ────────────────────────────────────────────────────────

  private reportIfTainted(kind: SinkKind, sinkNode: Node, valueNode: Node | null, scope: Scope): boolean {
    if (!valueNode) return false
    const taint = this.taintOfExpr(valueNode, scope)
    if (!taint || taint.sanitizedKinds.has(kind)) return false

    const { line, column } = locStart(sinkNode)
    const key = `${kind}:${line}:${column}`
    if (this.reported.has(key)) return false
    this.reported.add(key)

    const meta = SINK_RULES[kind]
    const confidence = this.computeConfidence(taint)
    const severity = this.computeSeverity(meta.baseSeverity, taint)

    const flow =
      taint.steps.length > 0
        ? ` Flow: ${SOURCE_LABEL[taint.sourceType]} (line ${taint.sourceLine}) → ${taint.steps
            .map((s) => `${s.note} (line ${s.line})`)
            .join(' → ')} → sink (line ${line}).`
        : ''
    const partialNote =
      taint.partialSanitizers.length > 0
        ? ` Note: ${taint.partialSanitizers.join(', ')} was applied, but does not fully neutralize this sink.`
        : ''

    this.findings.push({
      kind,
      ruleId: meta.ruleId,
      cweId: meta.cweId,
      owaspCategory: meta.owaspCategory,
      category: meta.category,
      name: meta.name,
      message:
        `User-controlled data from ${SOURCE_LABEL[taint.sourceType]} (\`${taint.sourceSnippet}\`, line ${taint.sourceLine}) ` +
        `reaches ${meta.sinkLabel} without effective sanitization.${flow}${partialNote}`,
      recommendation: meta.recommendation,
      severity,
      line,
      column,
      endLine: sinkNode.loc?.end.line,
      endColumn: sinkNode.loc ? sinkNode.loc.end.column + 1 : undefined,
      sinkSnippet: snippet(this.code, sinkNode),
      source: {
        type: taint.sourceType,
        line: taint.sourceLine,
        column: taint.sourceColumn,
        snippet: taint.sourceSnippet,
      },
      steps: taint.steps,
      partialSanitizers: taint.partialSanitizers,
      confidence,
    })
    return true
  }

  /**
   * Confidence is computed from evidence, not asserted: direct-source base
   * rate, minus a small penalty per propagation hop (each hop is a chance
   * our model of the code is wrong), minus a larger penalty when a partial
   * sanitizer was seen (the developer clearly tried; exploitability drops).
   */
  private computeConfidence(taint: Taint): number {
    let c = SOURCE_BASE_CONFIDENCE[taint.sourceType]
    c -= 0.03 * taint.steps.length
    if (taint.partialSanitizers.length > 0) c -= 0.15
    return Math.round(Math.max(0.35, Math.min(0.98, c)) * 100) / 100
  }

  private computeSeverity(
    base: 'critical' | 'high' | 'medium',
    taint: Taint
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (taint.partialSanitizers.length === 0) return base
    if (base === 'critical') return 'high'
    if (base === 'high') return 'medium'
    return 'low'
  }
}

/**
 * Run intraprocedural taint analysis over an already-parsed Babel AST.
 */
export function runTaintAnalysis(ast: Node, code: string): TaintFinding[] {
  try {
    return new TaintAnalyzer(code).analyze(ast)
  } catch {
    // Zero-noise policy: a taint-pass crash must never break Tier-1 analysis.
    return []
  }
}
