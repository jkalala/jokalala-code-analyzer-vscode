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

  private constructor(scheme: string, fsPath: string) {
    this.scheme = scheme
    this.fsPath = fsPath
  }

  static file(path: string): Uri {
    return new Uri('file', path)
  }

  static parse(uriString: string): Uri {
    const url = new URL(uriString)
    return new Uri(url.protocol.replace(':', ''), url.pathname)
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`
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
  fs: {
    createDirectory: async (_uri: Uri) => {},
    writeFile: async (_uri: Uri, _content: Uint8Array) => {},
    readFile: async (_uri: Uri): Promise<Uint8Array> => new Uint8Array(),
    delete: async (_uri: Uri) => {},
    stat: async (_uri: Uri) => ({ type: 1, ctime: 0, mtime: 0, size: 0 }),
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
}
