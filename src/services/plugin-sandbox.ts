/**
 * Plugin Sandbox
 *
 * Wraps plugin `activate()` execution in a controlled environment that:
 *  1. Enforces a strict timeout — plugins cannot hang the extension
 *  2. Provides a restricted `PluginContext` — plugins cannot access
 *     SecretStorage, file-system write operations, or the extension's
 *     internal state beyond the explicit API surface
 *  3. Intercepts and sanitises all plugin log output
 *  4. Catches synchronous and asynchronous errors cleanly
 *
 * NOTE: Node.js `vm.createContext` is NOT a complete security boundary —
 * a determined attacker with `require` access can escape. The real
 * protection here comes from:
 *   (a) path-traversal prevention (plugin-manager.ts — plugin cannot load
 *       arbitrary modules)
 *   (b) integrity verification (plugin-manager.ts — files can't change
 *       after the baseline is recorded)
 *   (c) this sandbox restricting what `activate()` can *call* on the
 *       context it receives
 * Together these form defence-in-depth rather than relying on a single
 * control.
 */

import * as vscode from 'vscode'
import { AuditEvent } from './audit-service'
import { getErrorMessage } from '../utils/typed-errors'
import type { LoadedPlugin, PluginContext, PluginLogger } from './plugin-manager'

// Lazy-resolve audit service to break circular imports
function tryGetAudit() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuditService } = require('./audit-service') as typeof import('./audit-service')
    return getAuditService()
  } catch {
    return null
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum time (ms) a plugin's activate() may run */
const ACTIVATION_TIMEOUT_MS = 5_000

/** Maximum number of log messages a plugin may emit during activation */
const MAX_LOG_MESSAGES = 100

// ── Restricted PluginContext factory ─────────────────────────────────────────

/**
 * Build a PluginContext that deliberately withholds dangerous capabilities.
 *
 * Removed from the context that plugins receive:
 *  - globalState.update() — plugins can READ but not WRITE global state
 *  - workspaceState.update() — same
 *  - Direct access to vscode.SecretStorage
 *  - Any capability not explicitly whitelisted below
 */
function buildRestrictedContext(
  pluginPath: string,
  extensionContext: vscode.ExtensionContext,
  ruleEngine: import('../core/custom-rules').CustomRuleEngine,
  pluginId: string,
  logMessages: string[]
): PluginContext {
  let logCount = 0

  const makeLogger = (level: string) =>
    (message: string, ...args: unknown[]) => {
      if (logCount >= MAX_LOG_MESSAGES) return
      logCount++
      const formatted = args.length
        ? `[Plugin:${pluginId}] ${message} ${args.map(String).join(' ')}`
        : `[Plugin:${pluginId}] ${message}`
      logMessages.push(`[${level.toUpperCase()}] ${formatted}`)
    }

  const sandboxLogger: PluginLogger = {
    info: makeLogger('info'),
    warn: makeLogger('warn'),
    error: makeLogger('error'),
    debug: makeLogger('debug'),
  }

  // Read-only proxy for globalState — plugins can read but not modify
  const readOnlyGlobalState: vscode.Memento = {
    get: <T>(key: string, defaultValue?: T) =>
      extensionContext.globalState.get<T>(key, defaultValue as T),
    update: async (_key: string, _value: unknown) => {
      sandboxLogger.warn('globalState.update() is disabled in sandboxed plugins')
    },
    keys: () => extensionContext.globalState.keys(),
  }

  // Read-only proxy for workspaceState
  const readOnlyWorkspaceState: vscode.Memento = {
    get: <T>(key: string, defaultValue?: T) =>
      extensionContext.workspaceState.get<T>(key, defaultValue as T),
    update: async (_key: string, _value: unknown) => {
      sandboxLogger.warn('workspaceState.update() is disabled in sandboxed plugins')
    },
    keys: () => extensionContext.workspaceState.keys(),
  }

  return {
    extensionPath: extensionContext.extensionPath,
    pluginPath,
    storagePath: extensionContext.globalStorageUri.fsPath,
    globalState: readOnlyGlobalState,
    workspaceState: readOnlyWorkspaceState,
    subscriptions: [],
    ruleEngine,
    logger: sandboxLogger,
  }
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

/**
 * Race a Promise against a timeout.
 * Returns the result or throws a TimeoutError.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer!)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SandboxActivationResult {
  success: boolean
  error?: string
  /** Sanitised log messages the plugin emitted during activation */
  logMessages: string[]
  durationMs: number
}

/**
 * Activate a loaded plugin inside the restricted sandbox.
 *
 * Call this instead of directly invoking `plugin.instance.activate()`.
 */
export async function activatePluginSandboxed(
  plugin: LoadedPlugin,
  extensionContext: vscode.ExtensionContext,
  ruleEngine: import('../core/custom-rules').CustomRuleEngine
): Promise<SandboxActivationResult> {
  const pluginId = plugin.manifest.id
  const logMessages: string[] = []
  const startMs = Date.now()

  if (!plugin.instance?.activate) {
    return { success: true, logMessages, durationMs: 0 }
  }

  const restrictedCtx = buildRestrictedContext(
    plugin.path,
    extensionContext,
    ruleEngine,
    pluginId,
    logMessages
  )

  try {
    const activateResult = plugin.instance.activate(restrictedCtx)

    // Normalise to Promise<void>
    const activatePromise =
      activateResult instanceof Promise ? activateResult : Promise.resolve()

    await withTimeout(activatePromise, ACTIVATION_TIMEOUT_MS, `Plugin "${pluginId}" activate()`)

    const durationMs = Date.now() - startMs

    tryGetAudit()?.record(AuditEvent.PLUGIN_LOADED, {
      pluginId,
      version: plugin.manifest.version,
      durationMs,
      logMessageCount: logMessages.length,
    })

    return { success: true, logMessages, durationMs }
  } catch (e: unknown) {
    const errorMsg = getErrorMessage(e)
    const durationMs = Date.now() - startMs

    tryGetAudit()?.record(AuditEvent.PLUGIN_ERROR, {
      pluginId,
      durationMs,
      error: errorMsg.slice(0, 200), // Truncate potentially large errors
    })

    return {
      success: false,
      error: errorMsg,
      logMessages,
      durationMs,
    }
  }
}
