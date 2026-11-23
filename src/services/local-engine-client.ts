/**
 * Client for the local Jokalala analyzer service (the full engine).
 *
 * The extension's built-in Tier-1 analyzer scans one file at a time and cannot
 * follow a request value from a controller through a service into a repository.
 * The full engine can, but only when it is given the whole project as a file
 * map. For "Analyze Entire Project" this client sends the project's Java files
 * to the loopback service in batches that share ONE file map, and returns the
 * findings grouped by the file they belong to.
 *
 * Properties this module guarantees:
 *  - Source code only ever goes to a loopback address.
 *  - Fail-open: if the service is off, slow, unauthorised or errors, the caller
 *    gets `null` and keeps its Tier-1 results.
 *  - No `vscode` import, so it is unit-testable without the extension host.
 *
 * @module services/local-engine-client
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface LocalEngineConfig {
  enabled: boolean
  /** Base URL of the analyzer service, e.g. http://127.0.0.1:3847 */
  url: string
  /** Optional bearer token; falls back to env / token files. */
  token?: string
  /** Per-request timeout. */
  timeoutMs: number
}

export const DEFAULT_LOCAL_ENGINE_CONFIG: LocalEngineConfig = {
  enabled: true,
  url: 'http://127.0.0.1:3847',
  timeoutMs: 120_000,
}

export interface EngineInputFile {
  /** Workspace-relative path (forward or back slashes). */
  path: string
  content: string
  language: string
}

/** One finding from the engine, already attributed to a project file. */
export interface EngineIssue {
  filePath: string
  line: number
  column?: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  type: string
  cweId?: string
  ruleId?: string
  suggestion?: string
  confidence?: number
  detectionSources?: string[]
  /** True when the finding was reported in a different file than the one analysed. */
  crossFile: boolean
}

export interface EngineResult {
  /** Findings per analysed project file (every analysed file has an entry). */
  byFile: Map<string, EngineIssue[]>
}

/** Languages the engine resolves across files today. */
export const ENGINE_LANGUAGES: ReadonlySet<string> = new Set(['java'])

const BATCH_SIZE = 25 // service limit is 50 files per batch
const MAX_FILE_MAP_CHARS = 8_000_000

type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
    redirect?: 'error' | 'follow' | 'manual'
  }
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/** http(s) to localhost / 127.0.0.0/8 / ::1 only. */
export function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return (
      host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
    )
  } catch {
    return false
  }
}

function readTokenFile(file: string): string | undefined {
  try {
    const t = fs.readFileSync(file, 'utf8').trim()
    return t.length >= 16 ? t : undefined
  } catch {
    return undefined
  }
}

/** Same lookup order as the CLI: setting, env, workspace token file, home. */
export function resolveEngineToken(
  configured: string | undefined,
  workspaceRoots: string[] = []
): string | undefined {
  const explicit = configured?.trim()
  if (explicit && explicit.length >= 16) return explicit
  const env = process.env.JOKALALA_ANALYZER_TOKEN?.trim()
  if (env && env.length >= 16) return env
  for (const root of workspaceRoots) {
    const t = readTokenFile(path.join(root, '.jokalala', 'analyzer-token'))
    if (t) return t
  }
  return readTokenFile(path.join(os.homedir(), '.jokalala', 'analyzer-token'))
}

const norm = (p: string) => p.replace(/\\/g, '/')

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])

/**
 * Cross-file findings are reported by the engine at the callee's own line, with
 * the callee's file as a `[File.java]` prefix on the message.
 */
export function attributeEngineIssue(
  raw: Record<string, unknown>,
  analysedPath: string,
  knownPaths: string[]
): EngineIssue | null {
  const message = String(raw.message ?? raw.type ?? '')
  const line = Number(raw.line)
  if (!Number.isFinite(line) || line < 1) return null

  let filePath = analysedPath
  let text = message
  let crossFile = false
  const prefix = /^\s*\[([^\]]+)\]\s*/.exec(message)
  if (prefix) {
    const wanted = norm(prefix[1]!)
    const hits = knownPaths.filter(
      p => norm(p) === wanted || norm(p).endsWith('/' + wanted)
    )
    // An ambiguous or unknown prefix must not be guessed: keep it on the
    // analysed file rather than pin it to the wrong one.
    if (hits.length === 1) {
      filePath = hits[0]!
      text = message.slice(prefix[0].length)
      crossFile = filePath !== analysedPath
    }
  }

  const sev = String(raw.severity ?? 'medium').toLowerCase()
  return {
    filePath,
    line,
    column: typeof raw.column === 'number' ? raw.column : undefined,
    severity: (SEVERITIES.has(sev) ? sev : 'medium') as EngineIssue['severity'],
    message: text,
    type: String(raw.type ?? 'Security Issue'),
    cweId: typeof raw.cweId === 'string' ? raw.cweId : undefined,
    ruleId: typeof raw.ruleId === 'string' ? raw.ruleId : undefined,
    suggestion:
      typeof raw.fixSuggestion === 'string' ? raw.fixSuggestion : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
    detectionSources: Array.isArray(raw.detectionSources)
      ? (raw.detectionSources as unknown[]).filter(
          (s): s is string => typeof s === 'string'
        )
      : undefined,
    crossFile,
  }
}

export class LocalEngineClient {
  private healthy: boolean | undefined

  constructor(
    private readonly config: LocalEngineConfig,
    private readonly workspaceRoots: string[] = [],
    private readonly log: (msg: string, detail?: unknown) => void = () => {},
    private readonly fetchImpl: FetchLike = (globalThis as any).fetch
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = resolveEngineToken(this.config.token, this.workspaceRoots)
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  private async request(
    pathname: string,
    init: { method: string; body?: string },
    timeoutMs: number,
    outer?: AbortSignal
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onOuter = () => controller.abort()
    outer?.addEventListener('abort', onOuter)
    try {
      // redirect:'error' so a 307/308 can never forward source to another host.
      const res = await this.fetchImpl(
        this.config.url.replace(/\/+$/, '') + pathname,
        { ...init, headers: this.headers(), signal: controller.signal, redirect: 'error' }
      )
      // Read the body before cleanup so the timeout and abort cover it too.
      const data = res.ok ? await res.json() : undefined
      return { ok: res.ok, status: res.status, data }
    } finally {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuter)
    }
  }

  /** True when the service answers and reports a real (non-mock) analyzer. */
  async isAvailable(): Promise<boolean> {
    if (this.healthy !== undefined) return this.healthy
    this.healthy = false
    if (!this.config.enabled || typeof this.fetchImpl !== 'function') {
      return false
    }
    if (!isLoopbackUrl(this.config.url)) {
      this.log('Local engine URL is not a loopback address; refusing to use it')
      return false
    }
    try {
      const res = await this.request('/health', { method: 'GET' }, 2000)
      if (!res.ok) return false
      const body = res.data as { analyzerAvailable?: boolean }
      this.healthy = body?.analyzerAvailable === true
    } catch (err) {
      this.log('Local engine not reachable', err)
    }
    return this.healthy
  }

  /**
   * Analyse every engine-supported file with the whole language group as the
   * shared file map. Returns `null` (never throws) when the engine cannot be
   * used, so the caller keeps its Tier-1 results unchanged.
   */
  async analyzeProject(
    files: EngineInputFile[],
    signal?: AbortSignal,
    onProgress?: (done: number, total: number) => void
  ): Promise<EngineResult | null> {
    const eligible = files.filter(f => ENGINE_LANGUAGES.has(f.language))
    if (eligible.length === 0) return null
    if (!(await this.isAvailable())) return null

    // One map per language: sibling resolution never needs another language.
    const byLanguage = new Map<string, EngineInputFile[]>()
    for (const f of eligible) {
      const list = byLanguage.get(f.language) ?? []
      list.push(f)
      byLanguage.set(f.language, list)
    }

    const byFile = new Map<string, EngineIssue[]>()
    let done = 0
    try {
      for (const [language, group] of byLanguage) {
        const fileMap: Record<string, string> = {}
        let chars = 0
        let truncated = false
        for (const f of group) {
          // Skip a file that does not fit but keep trying smaller later ones.
          if (chars + f.content.length > MAX_FILE_MAP_CHARS) {
            truncated = true
            continue
          }
          fileMap[f.path] = f.content
          chars += f.content.length
        }
        if (truncated) {
          // The engine's verdict would lack sibling context, and it replaces
          // Tier-1 injection findings; keep Tier-1 for this whole group.
          this.log(
            `Local engine: ${language} project exceeds the context limit; keeping Tier-1 results for it`
          )
          continue
        }
        const known = Object.keys(fileMap)
        const inMap = group

        for (let i = 0; i < inMap.length; i += BATCH_SIZE) {
          if (signal?.aborted) return null
          const chunk = inMap.slice(i, i + BATCH_SIZE)
          const res = await this.request(
            '/api/analyze/batch',
            {
              method: 'POST',
              body: JSON.stringify({
                files: chunk.map(f => ({
                  path: f.path,
                  code: f.content,
                  language,
                })),
                fileMap,
                options: { enableLlm: false },
              }),
            },
            this.config.timeoutMs,
            signal
          )
          if (!res.ok) {
            this.log(`Local engine returned HTTP ${res.status}; using Tier-1 only`)
            return null
          }
          const body = res.data as {
            results?: Array<{
              path: string
              result?: { securityIssues?: Array<Record<string, unknown>> }
            }>
          }
          for (const r of body.results ?? []) {
            // No result means the engine did not analyse this file; leave it
            // out so the merge keeps its Tier-1 findings.
            if (!r.result) continue
            const issues = (r.result?.securityIssues ?? [])
              .map(raw => attributeEngineIssue(raw, r.path, known))
              .filter((x): x is EngineIssue => x !== null)
            byFile.set(r.path, issues)
          }
          done += chunk.length
          onProgress?.(done, inMap.length)
        }
      }
    } catch (err) {
      this.log('Local engine request failed; using Tier-1 only', err)
      return null
    }
    return { byFile }
  }
}
