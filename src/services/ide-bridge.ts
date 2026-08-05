/**
 * IDE bridge: fetch Dev Chat diff proposals, apply unified diffs to the
 * workspace, and push local files into the Dev Chat cloud snapshot on demand.
 *
 * Critical path for Dev Chat's "Accept" button (components/ai/tool-call-card.tsx
 * in the web app opens vscode://jokalala.jokalala-code-analysis/apply-patch).
 * Files are never written until the user confirms the "Apply" prompt.
 */

import * as vscode from 'vscode'
import { AuthService } from './auth-service'
import { buildAuthHeaders } from './auth-headers'
import { ConfigurationService } from './configuration-service'
import { Logger } from './logger'
import { SecurityService } from './security-service'
import { assertHttpsUrl, safeJoinUrl } from '../utils/url-validator'
import {
  applyHunksToContent,
  looksLikeUnifiedDiff,
  parseUnifiedDiff,
  summarizePatch,
} from '../utils/unified-diff'

export interface FetchedProposal {
  id: string
  diff: string
  filePaths: string[]
  summary: string
}

export interface ApplyProposalResult {
  applied: string[]
  failed: string[]
}

const DEV_ASSISTANT_SUFFIX = /\/api\/agents\/dev-assistant\/?$/i

/**
 * Strip `/api/agents/dev-assistant` so site-level routes resolve correctly
 * (e.g. proposal fetch → `{origin}/api/llm/proposals/:id`). The extension's
 * apiEndpoint setting points at the agent route, not the site root.
 */
export function resolveSiteOrigin(apiEndpoint: string): string {
  const trimmed = (apiEndpoint || '').trim().replace(/\/$/, '')
  if (!trimmed) return trimmed
  try {
    const url = new URL(trimmed)
    if (DEV_ASSISTANT_SUFFIX.test(url.pathname)) {
      url.pathname = url.pathname.replace(DEV_ASSISTANT_SUFFIX, '') || '/'
    }
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''))
  } catch {
    return trimmed
  }
}

const SKIP_DELTA_RE =
  /(^|\/)(node_modules|\.git|\.next|dist|out|build|coverage|\.turbo)(\/|$)/i
const TEXT_EXT_RE =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|py|rs|go|java|kt|swift|rb|php|sql|yml|yaml|toml|env|sh|bash|txt)$/i
const MAX_DELTA_SYNC_CHARS = 100_000

function guessLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    md: 'markdown',
    json: 'json',
  }
  return map[ext] || 'plaintext'
}

/**
 * Resolve the workspace folder that owns a given relative-ish path. Falls
 * back to the sole workspace folder when there is exactly one (the common
 * case), otherwise asks the user to pick when the path doesn't disambiguate.
 */
async function resolveTargetFolder(
  hintPath?: string
): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) return undefined
  if (folders.length === 1) return folders[0]

  if (hintPath) {
    for (const folder of folders) {
      try {
        const candidate = vscode.Uri.joinPath(folder.uri, hintPath)
        await vscode.workspace.fs.stat(candidate)
        return folder
      } catch {
        // not in this folder, keep looking
      }
    }
  }

  const pick = await vscode.window.showQuickPick(
    folders.map(f => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    { placeHolder: 'Jokalala: choose the workspace folder for this patch' }
  )
  return pick?.folder
}

export class IdeBridgeService {
  constructor(
    private configuration: ConfigurationService,
    private authService: AuthService,
    private securityService: SecurityService,
    private logger: Logger
  ) {}

  private apiBase(): string {
    const { apiEndpoint } = this.configuration.getSettings()
    assertHttpsUrl(apiEndpoint, 'jokalala.apiEndpoint')
    return resolveSiteOrigin(apiEndpoint)
  }

  private async headers(): Promise<Record<string, string>> {
    const settings = this.configuration.getSettings()
    return buildAuthHeaders(this.authService, this.securityService, settings.apiKey)
  }

  async fetchDiffProposal(proposalId: string): Promise<FetchedProposal> {
    const id = proposalId.trim()
    if (!id || id.length < 8) {
      throw new Error('Invalid proposal id')
    }
    const base = this.apiBase()
    const headers = await this.headers()
    const res = await fetch(
      safeJoinUrl(base, 'api', 'llm', 'proposals', encodeURIComponent(id)),
      { method: 'GET', headers: { ...headers, Accept: 'application/json' } }
    )
    if (res.status === 401) {
      throw new Error(
        'Unauthorized — sign in or set your Jokalala API key (same account as Dev Chat)'
      )
    }
    if (res.status === 404) {
      throw new Error('Proposal not found or expired')
    }
    if (!res.ok) {
      throw new Error(`Failed to load proposal (${res.status})`)
    }
    const json = (await res.json()) as {
      data?: { id?: string; diff?: string; filePaths?: string[]; summary?: string }
    }
    const diff = json.data?.diff?.trim() || ''
    if (!diff) throw new Error('Empty proposal diff')
    return {
      id: json.data?.id || id,
      diff,
      filePaths: json.data?.filePaths || [],
      summary: json.data?.summary || 'patch',
    }
  }

  /**
   * Preview the first changed file with vscode.diff, then on explicit
   * confirm apply every file's hunks via WorkspaceEdit. Files are re-read
   * fresh here (not from any cached snapshot), so this reflects whatever is
   * actually on disk right now — a hunk that no longer matches throws per
   * file rather than silently mis-patching.
   */
  async applyProposalDiff(
    patch: string,
    options?: { summary?: string; skipDiffPreview?: boolean }
  ): Promise<ApplyProposalResult> {
    if (!looksLikeUnifiedDiff(patch)) {
      throw new Error('Payload is not a unified diff')
    }
    const parsedFiles = parseUnifiedDiff(patch)
    if (!parsedFiles.length) {
      throw new Error('Could not parse any file hunks from diff')
    }

    const folder = await resolveTargetFolder(parsedFiles[0]?.path)
    if (!folder) {
      throw new Error('Open a workspace folder to apply the patch')
    }

    const summary = options?.summary || summarizePatch(parsedFiles)

    if (!options?.skipDiffPreview) {
      const first = parsedFiles.find(f => !f.isDeleted) || parsedFiles[0]
      const uri = vscode.Uri.joinPath(folder.uri, first.path)
      let original = ''
      try {
        const raw = await vscode.workspace.fs.readFile(uri)
        original = Buffer.from(raw).toString('utf8')
      } catch {
        original = ''
      }
      const next = first.isDeleted ? '' : applyHunksToContent(original, first.hunks)
      const proposed = await vscode.workspace.openTextDocument({
        content: next,
        language: guessLanguage(first.path),
      })
      if (original && !first.isNew) {
        await vscode.commands.executeCommand(
          'vscode.diff',
          uri,
          proposed.uri,
          `Jokalala: ${first.path}`
        )
      } else {
        await vscode.window.showTextDocument(proposed, { preview: true })
      }
    }

    const confirm = await vscode.window.showWarningMessage(
      `Apply ${summary}?`,
      { modal: true },
      'Apply'
    )
    if (confirm !== 'Apply') {
      return { applied: [], failed: ['cancelled'] }
    }

    const edit = new vscode.WorkspaceEdit()
    const applied: string[] = []
    const failed: string[] = []

    for (const file of parsedFiles) {
      if (file.isDeleted) {
        failed.push(`${file.path} (delete not supported yet)`)
        continue
      }
      const uri = vscode.Uri.joinPath(folder.uri, file.path)
      try {
        let original = ''
        let treatAsNew = file.isNew
        if (!treatAsNew) {
          try {
            const raw = await vscode.workspace.fs.readFile(uri)
            original = Buffer.from(raw).toString('utf8')
          } catch {
            treatAsNew = true
          }
        }
        const next = applyHunksToContent(original, file.hunks)
        if (treatAsNew) {
          edit.createFile(uri, { ignoreIfExists: true })
          edit.insert(uri, new vscode.Position(0, 0), next)
        } else {
          const doc = await vscode.workspace.openTextDocument(uri)
          const full = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          )
          edit.replace(uri, full, next)
        }
        applied.push(file.path)
      } catch (err) {
        failed.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (applied.length === 0) {
      throw new Error(`Could not apply patch: ${failed.join('; ') || 'no files'}`)
    }

    const ok = await vscode.workspace.applyEdit(edit)
    if (!ok) throw new Error('WorkspaceEdit was rejected')

    try {
      const first = vscode.Uri.joinPath(folder.uri, applied[0])
      const doc = await vscode.workspace.openTextDocument(first)
      await vscode.window.showTextDocument(doc)
    } catch {
      /* ignore */
    }

    if (failed.length) {
      this.logger.warn('Patch partially applied', { applied, failed })
    }

    return { applied, failed }
  }

  shouldDeltaSyncDocument(doc: vscode.TextDocument): boolean {
    if (doc.uri.scheme !== 'file') return false
    if (doc.isUntitled) return false
    // getWorkspaceFolder is the correct check for "is this doc inside a
    // workspace folder" — asRelativePath returns the path *unchanged* (not
    // a `../`-prefixed string) for paths outside the workspace, so a
    // rel.startsWith('..') check here would never actually fire.
    if (!vscode.workspace.getWorkspaceFolder(doc.uri)) return false
    const rel = vscode.workspace.asRelativePath(doc.uri, false)
    if (!rel) return false
    if (SKIP_DELTA_RE.test(rel.replace(/\\/g, '/'))) return false
    if (!TEXT_EXT_RE.test(rel)) return false
    if (doc.getText().length > MAX_DELTA_SYNC_CHARS) return false
    return true
  }

  relativePathForDoc(doc: vscode.TextDocument): string {
    return vscode.workspace.asRelativePath(doc.uri, false).replace(/\\/g, '/')
  }

  async postIndexDelta(input: {
    path: string
    content?: string
    language?: string
    op?: 'upsert' | 'delete'
  }): Promise<void> {
    const base = this.apiBase()
    const headers = await this.headers()
    const res = await fetch(safeJoinUrl(base, 'api', 'llm', 'index', 'delta'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: input.path,
        content: input.content,
        language: input.language,
        op: input.op || 'upsert',
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Delta sync failed (${res.status}): ${text.slice(0, 200)}`)
    }
  }

  /** Push one workspace file into the cloud snapshot (on-demand hydrate). */
  async hydrateWorkspaceFile(relativePath: string): Promise<string> {
    const folder = (await resolveTargetFolder(relativePath)) ?? vscode.workspace.workspaceFolders?.[0]
    if (!folder) throw new Error('Open a workspace folder to hydrate files')
    const rel = relativePath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
    if (!rel || rel.includes('..')) throw new Error('Invalid path')
    const uri = vscode.Uri.joinPath(folder.uri, rel)
    const doc = await vscode.workspace.openTextDocument(uri)
    if (doc.getText().length > MAX_DELTA_SYNC_CHARS) {
      throw new Error('File too large to hydrate (>100k chars)')
    }
    await this.postIndexDelta({
      path: rel,
      content: doc.getText(),
      language: doc.languageId,
      op: 'upsert',
    })
    return rel
  }
}
