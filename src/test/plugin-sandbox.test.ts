/**
 * Unit tests for plugin-sandbox
 *
 * Plugins now run in a worker_thread (see plugin-sandbox.ts / plugin-worker.ts),
 * so these tests write real temporary plugin modules to disk and activate
 * them by path — a plain in-memory closure can no longer stand in for a
 * plugin's `activate()`, since the whole point of the rewrite is that the
 * require() and the call both happen off the main thread.
 *
 * Requires `dist/plugin-worker.js` to exist (built by `pnpm run compile`,
 * which `pnpm run test:unit` runs first).
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { activatePluginSandboxed } from '../services/plugin-sandbox'
import { PluginType, type PluginManifest } from '../services/plugin-manager'
import { getCustomRuleEngine, RuleSeverity, RuleCategory, PatternType } from '../core/custom-rules'

// ── Helpers ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.join(__dirname, '..', '..')

function makeContext(): vscode.ExtensionContext {
  const globalMap = new Map<string, unknown>()
  return {
    extensionPath: REPO_ROOT,
    globalStorageUri: vscode.Uri.file(path.join(os.tmpdir(), 'jokalala-test-storage')),
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
    subscriptions: [],
  } as unknown as vscode.ExtensionContext
}

function makeManifest(id = 'test-plugin'): PluginManifest {
  return {
    id,
    name: id,
    displayName: id,
    description: 'A test plugin',
    version: '1.0.0',
    type: PluginType.PATTERN,
  }
}

/** Writes a temp CommonJS plugin module and returns its resolved path. */
function writeTempPlugin(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jokalala-plugin-'))
  const file = path.join(dir, 'index.js')
  fs.writeFileSync(file, body)
  return file
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('PluginSandbox Test Suite', () => {
  const ruleEngine = getCustomRuleEngine()

  suite('Successful activation', () => {
    test('returns success for plugin with no activate export', async () => {
      const file = writeTempPlugin('module.exports = {}\n')
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('returns success for synchronous activate', async () => {
      const file = writeTempPlugin('module.exports.activate = function (ctx) {}\n')
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('returns success for async activate', async () => {
      const file = writeTempPlugin(
        'module.exports.activate = async function (ctx) { await Promise.resolve() }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
    })

    test('durationMs reflects actual work done', async () => {
      const file = writeTempPlugin(
        'module.exports.activate = async function (ctx) { await new Promise(r => setTimeout(r, 50)) }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, true)
      assert.ok(result.durationMs >= 50, `Expected durationMs >= 50, got ${result.durationMs}`)
    })
  })

  suite('Timeout enforcement', () => {
    test('fails and terminates a plugin that exceeds the 5s timeout', async function () {
      this.timeout(8000) // allow the test to run longer than the plugin timeout

      const file = writeTempPlugin(
        'module.exports.activate = async function (ctx) { await new Promise(r => setTimeout(r, 6000)) }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('timed out'))
    })
  })

  suite('Error handling', () => {
    test('captures synchronous throw from activate', async () => {
      const file = writeTempPlugin(
        "module.exports.activate = function (ctx) { throw new Error('Plugin crashed synchronously') }\n"
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('Plugin crashed synchronously'))
    })

    test('captures async rejection from activate', async () => {
      const file = writeTempPlugin(
        "module.exports.activate = async function (ctx) { throw new Error('Plugin async failure') }\n"
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error?.includes('Plugin async failure'))
    })

    test('captures a require() failure for a missing module', async () => {
      const missingPath = path.join(os.tmpdir(), 'does-not-exist-' + Date.now(), 'index.js')
      const result = await activatePluginSandboxed(missingPath, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.success, false)
      assert.ok(result.error)
    })
  })

  suite('Restricted context — read-only state', () => {
    test('plugin can read from globalState', async () => {
      const context = makeContext()
      await context.globalState.update('test-key', 'test-value')

      const file = writeTempPlugin(
        'module.exports.activate = function (ctx) { ctx.logger.info("read:" + ctx.globalState.get("test-key")) }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), context, ruleEngine)

      assert.strictEqual(result.success, true)
      assert.ok(result.logMessages.some(m => m.includes('read:test-value')))
    })

    test('plugin cannot write to globalState (update is a no-op)', async () => {
      const context = makeContext()
      await context.globalState.update('protected-key', 'original')

      const file = writeTempPlugin(
        'module.exports.activate = async function (ctx) { await ctx.globalState.update("protected-key", "overwritten") }\n'
      )
      await activatePluginSandboxed(file, makeManifest(), context, ruleEngine)

      const externalState = context.globalState.get('protected-key')
      assert.strictEqual(externalState, 'original')
    })
  })

  suite('Log message capture', () => {
    test('captures logger.info and logger.warn calls from plugin', async () => {
      const file = writeTempPlugin(
        'module.exports.activate = function (ctx) { ctx.logger.info("Plugin activated successfully"); ctx.logger.warn("Something looks odd") }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)

      assert.strictEqual(result.success, true)
      assert.ok(result.logMessages.some(m => m.includes('Plugin activated successfully')))
      assert.ok(result.logMessages.some(m => m.includes('Something looks odd')))
    })

    test('log messages include level prefix', async () => {
      const file = writeTempPlugin(
        'module.exports.activate = function (ctx) { ctx.logger.error("Fatal error in plugin") }\n'
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.ok(result.logMessages.some(m => m.startsWith('[ERROR]')))
    })

    test('returns empty log messages array when plugin logs nothing', async () => {
      const file = writeTempPlugin('module.exports.activate = function (ctx) {}\n')
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)
      assert.strictEqual(result.logMessages.length, 0)
    })
  })

  suite('Rule contribution RPC', () => {
    test('ctx.ruleEngine.addRule() reaches the real host-side CustomRuleEngine', async () => {
      const ruleId = 'sandbox-test-rule-' + Date.now()
      const rule = {
        id: ruleId,
        name: 'Sandbox Test Rule',
        description: 'Added by a sandboxed plugin',
        version: '1.0.0',
        severity: RuleSeverity.MEDIUM,
        category: RuleCategory.SECURITY,
        tags: ['test'],
        languages: ['javascript'],
        patterns: [{ type: PatternType.REGEX, value: 'console\\.log\\(' }],
        message: { default: 'Console.log found' },
        enabled: true,
      }

      const file = writeTempPlugin(
        `module.exports.activate = function (ctx) { ctx.ruleEngine.addRule(${JSON.stringify(rule)}) }\n`
      )
      const result = await activatePluginSandboxed(file, makeManifest(), makeContext(), ruleEngine)

      assert.strictEqual(result.success, true)
      assert.ok(ruleEngine.getRule(ruleId), 'Rule should have been added to the real host-side engine')

      ruleEngine.removeRule(ruleId)
    })
  })
})
