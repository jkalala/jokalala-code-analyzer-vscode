/**
 * Plugin Worker Entry Point
 *
 * Runs a plugin's `activate()` inside a Node `worker_thread` instead of the
 * extension host's main thread. This is the actual isolation boundary:
 *  - `require(resolvedMain)` happens HERE, not in the extension host, so a
 *    plugin's top-level module code and activate() run in a separate V8
 *    isolate with its own event loop.
 *  - A hung/`while(true)` plugin can be stopped with `worker.terminate()`
 *    from the host — a real preemptive kill, unlike a `Promise.race`
 *    timeout wrapped around code running in-process.
 *  - The plugin never receives a live reference to the extension's
 *    `CustomRuleEngine`, `SecretStorage`, or any VS Code API. It gets a
 *    minimal, serializable context and communicates back to the host only
 *    through `postMessage` — see plugin-sandbox.ts for the host side.
 *
 * IMPORTANT: this file must not import `vscode` — that module is only
 * available in the extension host's main thread, not worker threads.
 *
 * Caveat (documented, not overclaimed): a worker_thread shares the same
 * process and OS-level privileges as the extension host. This stops hangs
 * and restricts the *API surface* handed to a plugin, but it is not a full
 * OS-level sandbox — a plugin's `require()`'d code can still use Node's
 * `fs`/`child_process`/`net` directly. Combined with the path-traversal
 * check, integrity hash, and explicit user consent prompt in
 * plugin-manager.ts, this is defense-in-depth, not a hard security boundary.
 */

import { parentPort, workerData } from 'worker_threads'

interface PluginWorkerData {
  resolvedMain: string
  pluginId: string
  pluginPath: string
  extensionPath: string
  storagePath: string
  globalStateSnapshot: Record<string, unknown>
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

type HostMessage =
  | { type: 'log'; level: LogLevel; message: string }
  | { type: 'addRule'; rule: unknown }
  | { type: 'addRulePack'; pack: unknown }
  | { type: 'done'; success: true }
  | { type: 'done'; success: false; error: string }

const MAX_LOG_MESSAGES = 100

function post(message: HostMessage): void {
  parentPort?.postMessage(message)
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message
  try {
    return String(e)
  } catch {
    return 'Unknown error'
  }
}

async function run(): Promise<void> {
  const data = workerData as PluginWorkerData
  let logCount = 0

  const makeLogger = (level: LogLevel) =>
    (message: string, ...args: unknown[]) => {
      if (logCount >= MAX_LOG_MESSAGES) return
      logCount++
      const formatted = args.length
        ? `${message} ${args.map(String).join(' ')}`
        : message
      post({ type: 'log', level, message: formatted })
    }

  const logger = {
    info: makeLogger('info'),
    warn: makeLogger('warn'),
    error: makeLogger('error'),
    debug: makeLogger('debug'),
  }

  // Restricted, serializable-only context. No live VS Code objects, no live
  // CustomRuleEngine — rule contributions and state writes are one-way
  // messages the host validates and applies (or rejects) on its own.
  const restrictedCtx = {
    extensionPath: data.extensionPath,
    pluginPath: data.pluginPath,
    storagePath: data.storagePath,
    globalState: {
      get: (key: string, defaultValue?: unknown) =>
        Object.prototype.hasOwnProperty.call(data.globalStateSnapshot, key)
          ? data.globalStateSnapshot[key]
          : defaultValue,
      update: async () => {
        logger.warn('globalState.update() is disabled in sandboxed plugins')
      },
      keys: () => Object.keys(data.globalStateSnapshot),
    },
    workspaceState: {
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      update: async () => {
        logger.warn('workspaceState.update() is disabled in sandboxed plugins')
      },
      keys: () => [] as string[],
    },
    subscriptions: [] as { dispose(): void }[],
    ruleEngine: {
      addRule: (rule: unknown) => post({ type: 'addRule', rule }),
      addRulePack: (pack: unknown) => post({ type: 'addRulePack', pack }),
    },
    logger,
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pluginModule = require(data.resolvedMain)
    const activate = pluginModule?.activate

    if (typeof activate === 'function') {
      await activate(restrictedCtx)
    }

    post({ type: 'done', success: true })
  } catch (e) {
    post({ type: 'done', success: false, error: serializeError(e) })
  }
}

run().catch(e => {
  post({ type: 'done', success: false, error: serializeError(e) })
})
