/**
 * Starts (and stops) the local Jokalala analyzer service on behalf of the
 * extension, so cross-file analysis works without a manual terminal step.
 *
 * Safety rules:
 *  - only ever starts the service from an explicit repo root the user
 *    configured (machine-scoped setting) or JOKALALA_REPO_ROOT, and only when
 *    that folder really contains the analyzer service; it never runs a command
 *    taken from workspace content;
 *  - only binds loopback and only for a loopback URL;
 *  - reuses a service that is already healthy and never kills one it did not
 *    start;
 *  - a failed start is reported, never thrown.
 *
 * No `vscode` import: unit-testable with injected spawn / fetch.
 *
 * @module services/local-engine-launcher
 */

import { spawn as nodeSpawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { isLoopbackUrl } from './local-engine-client'

export type EngineStartOutcome =
  | { status: 'already-running' }
  | { status: 'started' }
  | {
      status: 'unavailable'
      reason:
        | 'disabled'
        | 'untrusted-workspace'
        | 'not-loopback'
        | 'no-repo-root'
        | 'spawn-failed'
        | 'exited'
        | 'timeout'
        | 'cancelled'
      detail?: string
    }

export interface LauncherOptions {
  /** Master switch (jokalala.localEngine.autoStart). */
  autoStart: boolean
  /** Workspace Trust; never start a process in an untrusted workspace. */
  trusted: boolean
  /** Base URL of the service, loopback only. */
  url: string
  /** Configured repo root, if any (falls back to JOKALALA_REPO_ROOT). */
  repoRoot?: string
  /** How long to wait for /health after spawning. */
  startupTimeoutMs?: number
}

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>

type SpawnLike = (
  command: string,
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    stdio: Array<'ignore' | 'pipe'>
    shell: boolean
    windowsHide: boolean
  }
) => ChildProcess

const SERVICE_ENTRY = path.join('cli-rust', 'analyzer-service', 'src', 'server.ts')

/** The repo root is usable only if it holds the service entry and the engine. */
export function resolveRepoRoot(configured?: string): string | undefined {
  const candidates = [configured, process.env.JOKALALA_REPO_ROOT]
    .map(c => c?.trim())
    .filter((c): c is string => !!c)
  for (const c of candidates) {
    const root = path.resolve(c)
    if (
      fs.existsSync(path.join(root, SERVICE_ENTRY)) &&
      fs.existsSync(path.join(root, 'lib', 'services', 'static-analyzer'))
    ) {
      return root
    }
  }
  return undefined
}

export class LocalEngineLauncher {
  private child: ChildProcess | undefined
  private stderrTail = ''
  private starting: Promise<EngineStartOutcome> | undefined

  constructor(
    private readonly log: (msg: string, detail?: unknown) => void = () => {},
    private readonly fetchImpl: FetchLike = (globalThis as any).fetch,
    private readonly spawnImpl: SpawnLike = nodeSpawn as unknown as SpawnLike,
    private readonly sleep: (ms: number) => Promise<void> = ms =>
      new Promise(r => setTimeout(r, ms))
  ) {}

  /** True when this launcher started the running service. */
  get ownsProcess(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed
  }

  private async healthy(url: string): Promise<boolean> {
    if (typeof this.fetchImpl !== 'function') return false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
      const res = await this.fetchImpl(url.replace(/\/+$/, '') + '/health', {
        signal: controller.signal,
      })
      if (!res.ok) return false
      const body = (await res.json()) as { analyzerAvailable?: boolean }
      return body?.analyzerAvailable === true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /** Make sure a service answers at `url`, starting one if allowed. */
  ensureRunning(
    opts: LauncherOptions,
    signal?: AbortSignal
  ): Promise<EngineStartOutcome> {
    // Concurrent scans share one start attempt.
    this.starting ??= this.doEnsure(opts, signal).finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async doEnsure(
    opts: LauncherOptions,
    signal?: AbortSignal
  ): Promise<EngineStartOutcome> {
    if (!isLoopbackUrl(opts.url)) {
      return { status: 'unavailable', reason: 'not-loopback' }
    }
    if (await this.healthy(opts.url)) return { status: 'already-running' }
    if (!opts.autoStart) return { status: 'unavailable', reason: 'disabled' }
    if (!opts.trusted) {
      return { status: 'unavailable', reason: 'untrusted-workspace' }
    }

    const repoRoot = resolveRepoRoot(opts.repoRoot)
    if (!repoRoot) return { status: 'unavailable', reason: 'no-repo-root' }

    const port = Number(new URL(opts.url).port || 80)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { status: 'unavailable', reason: 'not-loopback', detail: 'bad port' }
    }

    // Reap a previous child that died so it can be restarted.
    if (this.child && this.child.exitCode !== null) this.child = undefined

    if (!this.child) {
      try {
        // Constant program and arguments; only the port (validated integer)
        // and repo root (validated above) reach the environment. On Windows
        // npx is a .cmd shim and needs a shell, which is safe with no
        // untrusted text on the command line.
        const isWin = process.platform === 'win32'
        const child = this.spawnImpl(
          isWin ? 'npx.cmd' : 'npx',
          ['tsx', 'src/server.ts'],
          {
            cwd: path.join(repoRoot, 'cli-rust', 'analyzer-service'),
            env: {
              ...process.env,
              PORT: String(port),
              HOST: '127.0.0.1',
              JOKALALA_REPO_ROOT: repoRoot,
            },
            stdio: ['ignore', 'ignore', 'pipe'],
            shell: isWin,
            windowsHide: true,
          }
        )
        this.stderrTail = ''
        child.stderr?.on('data', (d: Buffer) => {
          this.stderrTail = (this.stderrTail + d.toString()).slice(-2000)
        })
        child.on('error', err => this.log('Local engine process error', String(err)))
        this.child = child
        this.log(`Starting local engine from ${repoRoot} on port ${port}`)
      } catch (err) {
        return { status: 'unavailable', reason: 'spawn-failed', detail: String(err) }
      }
    }

    const deadline = Date.now() + (opts.startupTimeoutMs ?? 60_000)
    while (Date.now() < deadline) {
      if (signal?.aborted) return { status: 'unavailable', reason: 'cancelled' }
      if (!this.child || this.child.exitCode !== null) {
        const detail = this.stderrTail.trim().slice(-400)
        this.child = undefined
        return { status: 'unavailable', reason: 'exited', detail }
      }
      if (await this.healthy(opts.url)) return { status: 'started' }
      await this.sleep(500)
    }
    return { status: 'unavailable', reason: 'timeout' }
  }

  /** Stop the service only if this launcher started it. */
  dispose(): void {
    const child = this.child
    this.child = undefined
    if (!child || child.exitCode !== null) return
    try {
      if (process.platform === 'win32' && child.pid) {
        // npx -> node tree: kill the whole tree, not just the shim.
        nodeSpawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        child.kill()
      }
    } catch (err) {
      this.log('Failed to stop local engine', String(err))
    }
  }
}
