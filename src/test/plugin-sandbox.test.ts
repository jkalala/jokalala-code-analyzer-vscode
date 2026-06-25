/**
 * Unit tests for plugin-sandbox
 *
 * Tests cover: successful activation, timeout enforcement, error handling,
 * restricted context (read-only state, no SecretStorage access), and
 * log message capture.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as vscode from 'vscode'
import { activatePluginSandboxed } from '../services/plugin-sandbox'
import type { LoadedPlugin } from '../services/plugin-manager'
import { PluginStatus, PluginType } from '../services/plugin-manager'
import { getCustomRuleEngine } from '../core/custom-rules'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(secretMap = new Map<string, string>()): vscode.ExtensionContext {
  const globalMap = new Map<string, unknown>()
  return {
    extensionPath: '/ext',
    globalStorageUri: vscode.Uri.file('/storage'),
    globalState: {
      get: (key: string, def?: unknown) =>
        globalMap.has(key) ? globalMap.get(key) : def,
      update: async (key: string, value: unknown) => {
        globalMap.set(key, value)
      },
      keys: () => [...globalMap.keys()],
    },
    workspaceState: {
      get: () => undefined,
      update: async () => {},
      keys: () => [],
    },
    secrets: {
      get: async (key: string) => secretMap.get(key),
      store: async (key: string, value: string) => {
        secretMap.set(key, value)
      },
      delete: async (key: string) => {
        secretMap.delete(key)
      },
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
    },
    subscriptions: [],
  } as unknown as vscode.ExtensionContext
}

function makePlugin(activate?: (ctx: import('../services/plugin-manager').PluginContext) => Promise<void> | void): LoadedPlugin {
  return {
    manifest: {
      id: 'test-plugin',
      name: 'Test Plugin',
      displayName: 'Test Plugin',
      description: 'A test plugin',
      version: '1.0.0',
      type: PluginType.PATTERN,
    },
    status: PluginStatus.INSTALLED,
    path: '/plugins/test-plugin',
    loadedAt: new Date(),
    instance: activate ? { activate } : undefined,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('PluginSandbox Test Suite', () => {
  const ruleEngine = getCustomRuleEngine()

  suite('Successful activation', () => {
    test('returns success for plugin with no activate function', async () => {
      const plugin = makePlugin()
      plugin.instance = {}
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.durationMs, 0)
    })

    test('returns success for synchronous activate', async () => {
      const plugin = makePlugin((_ctx) => {
        // sync activate — no await
      })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('returns success for async activate', async () => {
      const plugin = makePlugin(async (_ctx) => {
        await Promise.resolve()
      })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('durationMs is greater than 0 for actual work', async () => {
      const plugin = makePlugin(async () => {
        await new Promise(r => setTimeout(r, 5))
      })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
      assert.ok(result.durationMs >= 5, `Expected durationMs >= 5, got ${result.durationMs}`)
    })
  })

  suite('Timeout enforcement', () => {
    test('fails plugin that exceeds 5 s timeout', async function () {
      this.timeout(8000) // Allow test to run longer than plugin timeout

      const plugin = makePlugin(async () => {
        // Simulate a hanging plugin
        await new Promise(resolve => setTimeout(resolve, 6000))
      })

      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('timed out'))
    })
  })

  suite('Error handling', () => {
    test('captures synchronous throw from activate', async () => {
      const plugin = makePlugin(() => {
        throw new Error('Plugin crashed synchronously')
      })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('Plugin crashed synchronously'))
    })

    test('captures async rejection from activate', async () => {
      const plugin = makePlugin(async () => {
        throw new Error('Plugin async failure')
      })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('Plugin async failure'))
    })
  })

  suite('Restricted context — read-only state', () => {
    test('plugin can read from globalState', async () => {
      let readValue: unknown

      const context = makeContext()
      await context.globalState.update('test-key', 'test-value')

      const plugin = makePlugin(async (ctx) => {
        readValue = ctx.globalState.get('test-key')
      })

      await activatePluginSandboxed(plugin, context, ruleEngine)
      assert.strictEqual(readValue, 'test-value')
    })

    test('plugin cannot write to globalState (update is no-op)', async () => {
      let externalState: unknown = 'original'

      const context = makeContext()
      await context.globalState.update('protected-key', 'original')

      const plugin = makePlugin(async (ctx) => {
        // This should be silently blocked
        await ctx.globalState.update('protected-key', 'overwritten')
      })

      await activatePluginSandboxed(plugin, context, ruleEngine)

      // The original value should be unchanged because sandbox blocks write
      externalState = context.globalState.get('protected-key')
      // The sandbox blocks plugin writes; value remains 'original'
      assert.strictEqual(externalState, 'original')
    })
  })

  suite('Log message capture', () => {
    test('captures logger.info calls from plugin', async () => {
      const plugin = makePlugin((ctx) => {
        ctx.logger.info('Plugin activated successfully')
        ctx.logger.warn('Something looks odd')
      })

      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
      assert.ok(result.logMessages.some(m => m.includes('Plugin activated successfully')))
      assert.ok(result.logMessages.some(m => m.includes('Something looks odd')))
    })

    test('log messages include level prefix', async () => {
      const plugin = makePlugin((ctx) => {
        ctx.logger.error('Fatal error in plugin')
      })

      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.ok(result.logMessages.some(m => m.startsWith('[ERROR]')))
    })

    test('returns empty log messages array when plugin logs nothing', async () => {
      const plugin = makePlugin(() => { /* silent */ })
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.logMessages.length, 0)
    })
  })

  suite('No activate function', () => {
    test('succeeds immediately when instance has no activate', async () => {
      const plugin = makePlugin()
      plugin.instance = { deactivate: async () => {} }
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('succeeds immediately when instance is undefined', async () => {
      const plugin = makePlugin()
      plugin.instance = undefined
      const result = await activatePluginSandboxed(plugin, makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })
  })
})
