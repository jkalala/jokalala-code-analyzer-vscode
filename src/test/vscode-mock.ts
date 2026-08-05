/**
 * VS Code API mock for unit tests running outside the VS Code runtime.
 *
 * Tests that use `vscode.*` types and helpers can run in plain Node.js/mocha
 * because this module is registered as the `vscode` resolver before the test
 * suites load (see test-setup.js).
 *
 * Only the subset of the API actually used in the test files is mocked here.
 * Extend as needed — keep mocks minimal and correct.
 */

// ── EventEmitter ──────────────────────────────────────────────────────────────

class EventEmitter<T> {
  private listeners: Array<(e: T) => unknown> = []

  readonly event = (listener: (e: T) => unknown) => {
    this.listeners.push(listener)
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener) } }
  }

  fire(event: T): void {
    this.listeners.forEach(l => l(event))
  }

  dispose(): void {
    this.listeners = []
  }
}

// ── Uri ───────────────────────────────────────────────────────────────────────

class Uri {
  readonly scheme: string
  readonly fsPath: string
  readonly query: string

  private constructor(scheme: string, fsPath: string, query = '') {
    this.scheme = scheme
    this.fsPath = fsPath
    this.query = query
  }

  static file(path: string): Uri {
    return new Uri('file', path)
  }

  static parse(uriString: string): Uri {
    const url = new URL(uriString)
    return new Uri(url.protocol.replace(':', ''), url.pathname, url.search.replace(/^\?/, ''))
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const basePath = base.fsPath.replace(/\/+$/, '')
    const joined = pathSegments
      .map(s => s.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/')
    return new Uri(base.scheme, joined ? `${basePath}/${joined}` : basePath)
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`
  }
}

// ── Position ──────────────────────────────────────────────────────────────────

class Position {
  constructor(readonly line: number, readonly character: number) {}
}

// ── In-memory file system (backing workspace.fs / openTextDocument / WorkspaceEdit) ──
//
// Real VS Code reads/writes the actual disk; here every "file" is just an
// entry in this map, keyed by fsPath with backslashes normalized. Tests seed
// it with _setMockFile before exercising code that reads a document, and can
// read it back with _getMockFile to assert what a WorkspaceEdit actually
// wrote — this is what makes applyProposalDiff testable without real disk I/O.

const mockFiles = new Map<string, string>()

function fsKey(uri: Uri): string {
  return uri.fsPath.replace(/\\/g, '/')
}

function _setMockFile(path: string, content: string): void {
  mockFiles.set(path.replace(/\\/g, '/'), content)
}

function _getMockFile(path: string): string | undefined {
  return mockFiles.get(path.replace(/\\/g, '/'))
}

function _resetMockFs(): void {
  mockFiles.clear()
}

// ── TextDocument ──────────────────────────────────────────────────────────────

class MockTextDocument {
  readonly isUntitled: boolean

  constructor(
    readonly uri: Uri,
    private _text: string,
    readonly languageId: string = 'plaintext',
    isUntitled = false
  ) {
    this.isUntitled = isUntitled
  }

  getText(): string {
    return this._text
  }

  positionAt(offset: number): Position {
    const before = this._text.slice(0, offset)
    const lines = before.split('\n')
    return new Position(lines.length - 1, lines[lines.length - 1].length)
  }

  lineAt(line: number): { text: string } {
    return { text: this._text.split('\n')[line] ?? '' }
  }
}

/** Test helper: construct a document directly (e.g. for shouldDeltaSyncDocument). */
function _makeTextDocument(
  fsPath: string,
  content: string,
  options?: { language?: string; isUntitled?: boolean; scheme?: string }
): MockTextDocument {
  const uri = options?.scheme && options.scheme !== 'file'
    ? Uri.parse(`${options.scheme}://${fsPath}`)
    : Uri.file(fsPath)
  return new MockTextDocument(uri, content, options?.language ?? 'plaintext', options?.isUntitled ?? false)
}

// ── WorkspaceEdit ─────────────────────────────────────────────────────────────
//
// Models exactly the operations ide-bridge.ts actually issues: createFile,
// insert (always at position 0,0 into a freshly created file), and replace
// (always the full document range). Not a general-purpose text-edit engine.

type WorkspaceEditOp =
  | { type: 'create'; uri: Uri }
  | { type: 'insert'; uri: Uri; position: Position; text: string }
  | { type: 'replace'; uri: Uri; range: MockRange; text: string }

class WorkspaceEdit {
  private ops: WorkspaceEditOp[] = []

  createFile(uri: Uri, _options?: { ignoreIfExists?: boolean }): void {
    this.ops.push({ type: 'create', uri })
  }

  insert(uri: Uri, position: Position, text: string): void {
    this.ops.push({ type: 'insert', uri, position, text })
  }

  replace(uri: Uri, range: MockRange, text: string): void {
    this.ops.push({ type: 'replace', uri, range, text })
  }

  /** internal — read by workspace.applyEdit */
  _entries(): WorkspaceEditOp[] {
    return this.ops
  }
}

// ── Memento ───────────────────────────────────────────────────────────────────

class MemoryMemento {
  private store = new Map<string, unknown>()

  get<T>(key: string, defaultValue?: T): T {
    return (this.store.has(key) ? this.store.get(key) : defaultValue) as T
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.store.delete(key)
    } else {
      this.store.set(key, value)
    }
  }

  keys(): readonly string[] {
    return [...this.store.keys()]
  }
}

// ── SecretStorage ─────────────────────────────────────────────────────────────

class SecretStorage {
  private _map = new Map<string, string>()
  readonly onDidChange = new EventEmitter<{ key: string }>().event

  async get(key: string): Promise<string | undefined> {
    return this._map.get(key)
  }

  async store(key: string, value: string): Promise<void> {
    this._map.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this._map.delete(key)
  }
}

// ── workspace ─────────────────────────────────────────────────────────────────

const workspace = {
  workspaceFolders: [] as unknown[],
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    has: (_key: string) => false,
    inspect: (_key: string) => undefined,
    update: async () => {},
  }),
  onDidChangeConfiguration: new EventEmitter().event,
  onDidSaveTextDocument: new EventEmitter<MockTextDocument>().event,
  fs: {
    createDirectory: async (_uri: Uri) => {},
    writeFile: async (uri: Uri, content: Uint8Array) => {
      mockFiles.set(fsKey(uri), Buffer.from(content).toString('utf8'))
    },
    readFile: async (uri: Uri): Promise<Uint8Array> => {
      const content = mockFiles.get(fsKey(uri))
      if (content === undefined) {
        throw new Error(`ENOENT: file not found, ${uri.fsPath}`)
      }
      return new TextEncoder().encode(content)
    },
    delete: async (uri: Uri) => {
      mockFiles.delete(fsKey(uri))
    },
    stat: async (uri: Uri) => {
      if (!mockFiles.has(fsKey(uri))) {
        throw new Error(`ENOENT: file not found, ${uri.fsPath}`)
      }
      return { type: 1, ctime: 0, mtime: 0, size: mockFiles.get(fsKey(uri))?.length ?? 0 }
    },
  },
  asRelativePath: (uri: Uri, _includeWorkspace = true): string => {
    const folders = workspace.workspaceFolders as Array<{ uri: Uri }>
    for (const folder of folders) {
      const base = folder.uri.fsPath.replace(/\/+$/, '')
      if (uri.fsPath === base) return ''
      if (uri.fsPath.startsWith(base + '/')) return uri.fsPath.slice(base.length + 1)
    }
    // Real VS Code returns the path unchanged when it's outside every
    // workspace folder — NOT a `../`-prefixed relative path. Mirrored here
    // deliberately so tests catch code that (incorrectly) assumes otherwise.
    return uri.fsPath
  },
  getWorkspaceFolder: (uri: Uri): { uri: Uri; name: string; index: number } | undefined => {
    const folders = workspace.workspaceFolders as Array<{ uri: Uri; name: string; index: number }>
    for (const folder of folders) {
      const base = folder.uri.fsPath.replace(/\/+$/, '')
      if (uri.fsPath === base || uri.fsPath.startsWith(base + '/')) return folder
    }
    return undefined
  },
  openTextDocument: async (
    uriOrOptions: Uri | { content: string; language?: string }
  ): Promise<MockTextDocument> => {
    if (uriOrOptions instanceof Uri) {
      const content = mockFiles.get(fsKey(uriOrOptions))
      if (content === undefined) {
        throw new Error(`ENOENT: file not found, ${uriOrOptions.fsPath}`)
      }
      return new MockTextDocument(uriOrOptions, content)
    }
    const virtualUri = Uri.file(`untitled-${Math.random().toString(36).slice(2)}`)
    return new MockTextDocument(virtualUri, uriOrOptions.content, uriOrOptions.language ?? 'plaintext', true)
  },
  applyEdit: async (edit: WorkspaceEdit): Promise<boolean> => {
    for (const op of edit._entries()) {
      const key = fsKey(op.uri)
      if (op.type === 'create') {
        if (!mockFiles.has(key)) mockFiles.set(key, '')
      } else if (op.type === 'insert') {
        const existing = mockFiles.get(key) ?? ''
        mockFiles.set(key, op.text + existing)
      } else if (op.type === 'replace') {
        mockFiles.set(key, op.text)
      }
    }
    return true
  },
}

// ── window ────────────────────────────────────────────────────────────────────

const vsWindow = {
  showInformationMessage: async (_message: string, ..._items: string[]) => undefined as string | undefined,
  showWarningMessage: async (_message: string, ..._items: string[]) => undefined as string | undefined,
  showErrorMessage: async (_message: string, ..._items: string[]) => undefined as string | undefined,
  showInputBox: async (_options?: object) => undefined as string | undefined,
  showQuickPick: async (_items: unknown[], _options?: object) => undefined,
  showSaveDialog: async (_options?: object) => undefined,
  showTextDocument: async (documentOrUri: unknown, _options?: object) => ({
    document: documentOrUri,
  }),
  createOutputChannel: (_name: string) => ({
    append: (_value: string) => {},
    appendLine: (_value: string) => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  activeTextEditor: undefined,
}

// ── env ───────────────────────────────────────────────────────────────────────

const env = {
  openExternal: async (_uri: Uri) => true,
  clipboard: {
    writeText: async (_text: string) => {},
    readText: async () => '',
  },
}

// ── extensions ────────────────────────────────────────────────────────────────

const extensions = {
  getExtension: (_id: string) => ({
    packageJSON: { version: '2.4.0-test' },
    isActive: true,
    exports: undefined,
    activate: async () => undefined,
    id: _id,
    extensionUri: Uri.file('/mock/extension'),
    extensionPath: '/mock/extension',
  }),
}

// ── commands ──────────────────────────────────────────────────────────────────

const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
  executeCommand: async (_command: string, ..._args: unknown[]) => undefined,
}

// ── Diagnostic types ──────────────────────────────────────────────────────────

const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const

class MockRange {
  readonly start: { line: number; character: number }
  readonly end: { line: number; character: number }

  // Accepts both:
  //   new Range(startLine, startChar, endLine, endChar)  — 4 numbers (VS Code API)
  //   new Range({line, character}, {line, character})    — 2 Position objects
  constructor(
    startOrPosition: number | { line: number; character: number },
    startCharOrEnd: number | { line: number; character: number },
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startOrPosition === 'number') {
      this.start = { line: startOrPosition as number, character: startCharOrEnd as number }
      this.end = { line: endLine ?? 0, character: endChar ?? 0 }
    } else {
      this.start = startOrPosition
      this.end = startCharOrEnd as { line: number; character: number }
    }
  }
}

class Diagnostic {
  source?: string
  code?: string | number
  tags?: unknown[]

  constructor(
    readonly range: MockRange,
    readonly message: string,
    readonly severity: number = DiagnosticSeverity.Warning
  ) {}
}

class DiagnosticCollection {
  private map = new Map<string, Diagnostic[]>()
  readonly name = 'mock-collection'

  set(uri: Uri, diagnostics: Diagnostic[] | undefined): void {
    if (diagnostics) {
      this.map.set(uri.fsPath, diagnostics)
    } else {
      this.map.delete(uri.fsPath)
    }
  }

  get(uri: Uri): Diagnostic[] {
    return this.map.get(uri.fsPath) ?? []
  }

  delete(uri: Uri): void {
    this.map.delete(uri.fsPath)
  }

  clear(): void {
    this.map.clear()
  }

  dispose(): void {
    this.clear()
  }

  forEach(callback: (uri: Uri, diagnostics: Diagnostic[]) => void): void {
    this.map.forEach((diags, path) => callback(Uri.file(path), diags))
  }
}

const languages = {
  createDiagnosticCollection: (_name?: string) => new DiagnosticCollection(),
}

// ── StatusBarItem ─────────────────────────────────────────────────────────────

class StatusBarItem {
  text = ''
  tooltip?: string
  command?: string
  backgroundColor?: unknown
  show() {}
  hide() {}
  dispose() {}
}

// ── Cancellation ─────────────────────────────────────────────────────────────

class CancellationTokenSource {
  private _cancelled = false
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: new EventEmitter<void>().event,
  }

  cancel(): void {
    this._cancelled = true
    ;(this.token as { isCancellationRequested: boolean }).isCancellationRequested = true
  }

  dispose(): void {}
}

// ── Export as vscode module ───────────────────────────────────────────────────

module.exports = {
  EventEmitter,
  Uri,
  Position,
  WorkspaceEdit,
  workspace,
  window: vsWindow,
  env,
  extensions,
  commands,
  languages,
  DiagnosticSeverity,
  Range: MockRange,
  Diagnostic,
  DiagnosticCollection,
  StatusBarItem,
  CancellationTokenSource,
  // Commonly used enums
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  // Memento exposed so mock contexts can use it
  _MemoryMemento: MemoryMemento,
  _SecretStorage: SecretStorage,
  // In-memory file system + document helpers, for tests that exercise
  // WorkspaceEdit-applying code (e.g. IdeBridgeService.applyProposalDiff)
  _setMockFile: _setMockFile,
  _getMockFile: _getMockFile,
  _resetMockFs: _resetMockFs,
  _makeTextDocument: _makeTextDocument,
}
