/// <reference types="mocha" />

import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { EventEmitter } from 'events'
import {
  LocalEngineLauncher,
  resolveRepoRoot,
} from '../services/local-engine-launcher'

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-repo-'))
  fs.mkdirSync(path.join(root, 'cli-rust', 'analyzer-service', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'cli-rust', 'analyzer-service', 'src', 'server.ts'), '')
  fs.mkdirSync(path.join(root, 'lib', 'services', 'static-analyzer'), { recursive: true })
  return root
}

class FakeChild extends EventEmitter {
  exitCode: number | null = null
  killed = false
  pid = 4242
  stderr = new EventEmitter()
  kill() {
    this.killed = true
    this.exitCode = 0
    return true
  }
}

const url = 'http://127.0.0.1:3847'
const base = { autoStart: true, trusted: true, url, startupTimeoutMs: 2000 }
const noSleep = async () => {}

function healthFetch(state: { up: boolean }) {
  return (async () => ({
    ok: state.up,
    json: async () => ({ analyzerAvailable: state.up }),
  })) as any
}

suite('local engine launcher', () => {
  test('resolveRepoRoot only accepts a folder that holds the service and engine', () => {
    const good = makeRepo()
    assert.strictEqual(resolveRepoRoot(good), path.resolve(good))
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-bad-'))
    assert.strictEqual(resolveRepoRoot(bad), undefined)
    assert.strictEqual(resolveRepoRoot(''), undefined)
  })

  test('reuses a running service without spawning, and does not own it', async () => {
    let spawned = 0
    const l = new LocalEngineLauncher(undefined, healthFetch({ up: true }), (() => {
      spawned++
      return new FakeChild()
    }) as any, noSleep)
    assert.deepStrictEqual(await l.ensureRunning({ ...base, repoRoot: makeRepo() }), {
      status: 'already-running',
    })
    assert.strictEqual(spawned, 0)
    assert.strictEqual(l.ownsProcess, false)
  })

  test('never spawns when disabled, untrusted, non-loopback or without a repo root', async () => {
    let spawned = 0
    const mk = () =>
      new LocalEngineLauncher(undefined, healthFetch({ up: false }), (() => {
        spawned++
        return new FakeChild()
      }) as any, noSleep)
    const repo = makeRepo()
    const reason = async (o: Record<string, unknown>) => {
      const r: any = await mk().ensureRunning({ ...base, repoRoot: repo, ...o } as any)
      return r.reason
    }
    assert.strictEqual(await reason({ autoStart: false }), 'disabled')
    assert.strictEqual(await reason({ trusted: false }), 'untrusted-workspace')
    assert.strictEqual(await reason({ url: 'https://example.com' }), 'not-loopback')
    assert.strictEqual(await reason({ repoRoot: '' }), 'no-repo-root')
    assert.strictEqual(spawned, 0)
  })

  test('spawns a constant command from the validated repo root and waits for health', async () => {
    const state = { up: false }
    const repo = makeRepo()
    let call: any
    const child = new FakeChild()
    let polls = 0
    const l = new LocalEngineLauncher(
      undefined,
      (async () => {
        if (++polls > 3) state.up = true
        return { ok: state.up, json: async () => ({ analyzerAvailable: state.up }) }
      }) as any,
      ((cmd: string, args: string[], opts: any) => {
        call = { cmd, args, opts }
        return child
      }) as any,
      noSleep
    )
    const out = await l.ensureRunning({ ...base, repoRoot: repo })
    assert.deepStrictEqual(out, { status: 'started' })
    assert.deepStrictEqual(call.args, ['tsx', 'src/server.ts'])
    assert.ok(/^npx(\.cmd)?$/.test(call.cmd))
    assert.strictEqual(call.opts.cwd, path.join(path.resolve(repo), 'cli-rust', 'analyzer-service'))
    assert.strictEqual(call.opts.env.PORT, '3847')
    assert.strictEqual(call.opts.env.HOST, '127.0.0.1')
    assert.strictEqual(l.ownsProcess, true)
    l.dispose()
    assert.strictEqual(child.killed || process.platform === 'win32', true)
  })

  test('reports an early exit with the stderr tail instead of waiting', async () => {
    const child = new FakeChild()
    const l = new LocalEngineLauncher(undefined, healthFetch({ up: false }), (() => {
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('Error: Cannot find module express'))
        child.exitCode = 1
      })
      return child
    }) as any, async () => new Promise(r => setImmediate(r)))
    const out: any = await l.ensureRunning({ ...base, repoRoot: makeRepo() })
    assert.strictEqual(out.status, 'unavailable')
    assert.strictEqual(out.reason, 'exited')
    assert.ok(out.detail.includes('express'))
  })

  test('times out when the service never becomes healthy', async () => {
    const l = new LocalEngineLauncher(undefined, healthFetch({ up: false }), (() => new FakeChild()) as any, noSleep)
    const out: any = await l.ensureRunning({ ...base, repoRoot: makeRepo(), startupTimeoutMs: 30 })
    assert.strictEqual(out.reason, 'timeout')
  })

  test('concurrent callers share one start attempt', async () => {
    let spawned = 0
    const state = { up: false }
    let polls = 0
    const l = new LocalEngineLauncher(
      undefined,
      (async () => {
        if (++polls > 4) state.up = true
        return { ok: state.up, json: async () => ({ analyzerAvailable: state.up }) }
      }) as any,
      (() => {
        spawned++
        return new FakeChild()
      }) as any,
      async () => new Promise(r => setImmediate(r))
    )
    const repo = makeRepo()
    await Promise.all([
      l.ensureRunning({ ...base, repoRoot: repo }),
      l.ensureRunning({ ...base, repoRoot: repo }),
    ])
    assert.strictEqual(spawned, 1)
    l.dispose()
  })
})
