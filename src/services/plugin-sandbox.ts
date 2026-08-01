/**
 * Plugin Sandbox
 *
 * Runs a plugin's `activate()` inside a Node `worker_thread` (see
 * plugin-worker.ts for the code that actually executes there), rather than
 * calling it in-process. This is a real isolation boundary, not just a
 * timeout wrapper:
 *  1. `require()` of the plugin's own module happens inside the worker, so
 *     a hung `activate()` (e.g. `while (true) {}`) can be stopped with
 *     `worker.terminate()` — a previous `Promise.race`-based timeout could
 *     not preempt synchronous code and would hang the extension host.
 *  2. The plugin never receives a live reference to `CustomRuleEngine` or
 *     any VS Code API — only serializable data and a message-based RPC for
 *     contributing rules, which this file validates and applies on the
 *     plugin's behalf.
 *  3. Log output and errors are captured via messages, not direct calls.
 *
 * Caveat (documented, not overclaimed — see plugin-worker.ts): a
 * worker_thread shares the host process's OS-level privileges. This stops
 * hangs and restricts the *API surface* a plugin is handed; it is not a
 * full OS sandbox. Combined with the path-traversal check, integrity hash,
 * and user consent prompt in plugin-manager.ts, this is defense-in-depth.
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { Worker } from 'worker_threads'
import { AuditEvent } from './audit-service'
import { getErrorMessage } from '../utils/typed-errors'
import type { CustomRuleEngine } from '../core/custom-rules'
import type { PluginManifest } from './plugin-manager'

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

/** Maximum time (ms) a plugin's activate() may run before its worker is killed */
const ACTIVATION_TIMEOUT_MS = 5_000

/** Maximum number of log messages a plugin may emit during activation */
const MAX_LOG_MESSAGES = 100

// ── Worker message protocol ─────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

type WorkerMessage =
  | { type: 'log'; level: LogLevel; message: string }
  | { type: 'addRule'; rule: unknown }
  | { type: 'addRulePack'; pack: unknown }
  | { type: 'done'; success: true }
  | { type: 'done'; success: false; error: string }

// ── Public API ────────────────────────────────────────────────────────────────

export interface SandboxActivationResult {
  success: boolean
  error?: string
  /** Sanitised log messages the plugin emitted during activation */
  logMessages: string[]
  durationMs: number
}

function snapshotMemento(memento: vscode.Memento): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const key of memento.keys()) {
    snapshot[key] = memento.get(key)
  }
  return snapshot
}

/**
 * Activate a plugin's module (by resolved file path) inside the worker
 * sandbox. Call this instead of directly `require()`-ing and invoking a
 * plugin's `activate()` in the extension host.
 */
export async function activatePluginSandboxed(
  resolvedMainPath: string,
  manifest: PluginManifest,
  extensionContext: vscode.ExtensionContext,
  ruleEngine: CustomRuleEngine
): Promise<SandboxActivationResult> {
  const pluginId = manifest.id
  const logMessages: string[] = []
  const startMs = Date.now()
  // Resolved from extensionPath (not __dirname) so this works identically
  // whether this file is running from esbuild's single dist/extension.js
  // bundle (production) or tsc's unbundled per-file dist/ output (tests) —
  // dist/plugin-worker.js is esbuild's own entry point (see scripts/esbuild.js)
  // and always lives at <extensionPath>/dist/plugin-worker.js.
  const workerScriptPath = path.join(extensionContext.extensionPath, 'dist', 'plugin-worker.js')

  return new Promise<SandboxActivationResult>(resolve => {
    let settled = false
    let worker: Worker | undefined

    const finish = (result: SandboxActivationResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker?.removeAllListeners()
      worker?.terminate().catch(() => {})
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({
        success: false,
        error: `Plugin "${pluginId}" activate() timed out after ${ACTIVATION_TIMEOUT_MS}ms`,
        logMessages,
        durationMs: Date.now() - startMs,
      })
    }, ACTIVATION_TIMEOUT_MS)

    try {
      worker = new Worker(workerScriptPath, {
        workerData: {
          resolvedMain: resolvedMainPath,
          pluginId,
          pluginPath: path.dirname(resolvedMainPath),
          extensionPath: extensionContext.extensionPath,
          storagePath: extensionContext.globalStorageUri.fsPath,
          globalStateSnapshot: snapshotMemento(extensionContext.globalState),
        },
      })
    } catch (e) {
      finish({
        success: false,
        error: getErrorMessage(e),
        logMessages,
        durationMs: Date.now() - startMs,
      })
      return
    }

    worker.on('message', (msg: WorkerMessage) => {
      switch (msg.type) {
        case 'log':
          if (logMessages.length < MAX_LOG_MESSAGES) {
            logMessages.push(
              `[${msg.level.toUpperCase()}] [Plugin:${pluginId}] ${msg.message}`
            )
          }
          break

        case 'addRule': {
          const validation = ruleEngine.addRule(msg.rule as Parameters<CustomRuleEngine['addRule']>[0])
          if (!validation.valid) {
            logMessages.push(
              `[WARN] [Plugin:${pluginId}] rule rejected: ${validation.errors[0]?.message ?? 'invalid rule'}`
            )
          }
          break
        }

        case 'addRulePack':
          ruleEngine.addRulePack(msg.pack as Parameters<CustomRuleEngine['addRulePack']>[0])
          break

        case 'done': {
          const durationMs = Date.now() - startMs
          if (msg.success) {
            tryGetAudit()?.record(AuditEvent.PLUGIN_LOADED, {
              pluginId,
              version: manifest.version,
              durationMs,
              logMessageCount: logMessages.length,
            })
            finish({ success: true, logMessages, durationMs })
          } else {
            tryGetAudit()?.record(AuditEvent.PLUGIN_ERROR, {
              pluginId,
              durationMs,
              error: msg.error.slice(0, 200),
            })
            finish({ success: false, error: msg.error, logMessages, durationMs })
          }
          break
        }
      }
    })

    worker.on('error', e => {
      const durationMs = Date.now() - startMs
      const errorMsg = getErrorMessage(e)
      tryGetAudit()?.record(AuditEvent.PLUGIN_ERROR, {
        pluginId,
        durationMs,
        error: errorMsg.slice(0, 200),
      })
      finish({ success: false, error: errorMsg, logMessages, durationMs })
    })

    worker.on('exit', code => {
      if (!settled && code !== 0) {
        finish({
          success: false,
          error: `Plugin worker exited with code ${code}`,
          logMessages,
          durationMs: Date.now() - startMs,
        })
      }
    })
  })
}
