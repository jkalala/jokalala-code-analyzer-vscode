/**
 * Full-width findings table in an editor tab.
 *
 * The sidebar Issues view shares a narrow, short column with seven sibling
 * views. This panel shows every finding with its full message, severity, CWE
 * and location in a normal editor tab (which can be split, moved and resized
 * like any editor), with text / severity filters. Clicking a row opens the file
 * at the line.
 *
 * Security: finding text comes from analysed source code, so the webview never
 * receives HTML. Rows travel as JSON and are rendered with `textContent`; the
 * page has a nonce-only CSP; and the webview identifies a row by its index into
 * data this side holds, never by a path it supplies.
 *
 * @module providers/findings-panel
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type {
  FileAnalysisResult,
  Issue,
} from '../interfaces/code-analysis-service.interface'

export interface FindingRow {
  index: number
  filePath: string
  displayPath: string
  line: number
  column: number
  severity: Issue['severity']
  category: string
  message: string
  suggestion: string
  cwe: string
  crossFile: boolean
  tier: string
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

function cweOf(issue: Issue): string {
  const meta = issue.metadata as { cwe?: unknown } | undefined
  if (Array.isArray(meta?.cwe) && typeof meta!.cwe[0] === 'string') {
    return meta!.cwe[0] as string
  }
  const tag = (issue.tags ?? []).find(t => /^CWE-\d+$/i.test(t))
  if (tag) return tag.toUpperCase()
  const fromRule = /CWE-\d+/i.exec(`${issue.ruleId ?? ''} ${issue.category}`)
  return fromRule ? fromRule[0].toUpperCase() : ''
}

/**
 * Relative paths must be made absolute before vscode.Uri.file, which would
 * otherwise turn `src/A.java` into file:///src/A.java. In a multi-root
 * workspace the first root that actually contains the file wins; otherwise the
 * first root. Absolute paths are unchanged.
 */
export function resolveFindingPath(p: string, roots: string[]): string {
  if (!p || path.isAbsolute(p) || roots.length === 0) return p
  for (const root of roots) {
    const candidate = path.resolve(root, p)
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      /* fall through to the next root */
    }
  }
  return path.resolve(roots[0]!, p)
}

/** Flatten and sort results into table rows. Pure; exported for tests. */
export function buildFindingRows(
  fileResults: FileAnalysisResult[],
  workspaceRoots: string[] = []
): FindingRow[] {
  const rows: Omit<FindingRow, 'index'>[] = []
  for (const fr of fileResults) {
    for (const issue of fr.issues) {
      const rawPath = issue.filePath ?? fr.filePath ?? ''
      const filePath = resolveFindingPath(rawPath, workspaceRoots)
      let display = filePath
      for (const root of workspaceRoots) {
        const rel = path.relative(root, filePath)
        if (filePath && !rel.startsWith('..') && !path.isAbsolute(rel)) {
          display = rel
          break
        }
      }
      const meta = (issue.metadata ?? {}) as Record<string, unknown>
      rows.push({
        filePath,
        displayPath: display.replace(/\\/g, '/'),
        line: issue.line ?? issue.location?.startLine ?? 1,
        column: issue.column ?? issue.location?.startColumn ?? 0,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        suggestion: issue.suggestion ?? '',
        cwe: cweOf(issue),
        crossFile: meta.crossFile === true,
        tier: meta.engineTier === 2 ? 'engine' : 'local',
      })
    }
  }
  rows.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.displayPath.localeCompare(b.displayPath) ||
      a.line - b.line
  )
  return rows.map((r, index) => ({ index, ...r }))
}

function nonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export class FindingsPanel {
  private static current: FindingsPanel | undefined
  private rows: FindingRow[] = []
  /** Identifies the rows snapshot the webview is showing. */
  private snapshot = 0

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly roots: () => string[]
  ) {
    panel.onDidDispose(() => {
      if (FindingsPanel.current === this) FindingsPanel.current = undefined
    })
    panel.webview.onDidReceiveMessage(msg => this.onMessage(msg))
  }

  /** Open (or reveal) the panel and show `fileResults`. */
  static show(
    fileResults: FileAnalysisResult[],
    roots: () => string[] = () =>
      (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)
  ): void {
    if (FindingsPanel.current) {
      FindingsPanel.current.panel.reveal(undefined, false)
      FindingsPanel.current.update(fileResults)
      return
    }
    const panel = vscode.window.createWebviewPanel(
      'jokalalaFindings',
      'Jokalala Findings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    )
    const instance = new FindingsPanel(panel, roots)
    FindingsPanel.current = instance
    panel.webview.html = FindingsPanel.html(nonce(), panel.webview.cspSource)
    instance.update(fileResults)
  }

  /** Refresh an open panel after a new scan (no-op when closed). */
  static refresh(fileResults: FileAnalysisResult[]): void {
    FindingsPanel.current?.update(fileResults)
  }

  private update(fileResults: FileAnalysisResult[]): void {
    this.rows = buildFindingRows(fileResults, this.roots())
    this.snapshot++
    void this.panel.webview.postMessage({
      type: 'rows',
      snapshot: this.snapshot,
      rows: this.rows,
    })
  }

  private async onMessage(msg: unknown): Promise<void> {
    const m = msg as { type?: string; index?: unknown; snapshot?: unknown }
    if (m?.type !== 'open' || typeof m.index !== 'number') return
    // A click made against rows that have since been replaced must not open
    // whatever finding now sits at that index.
    if (m.snapshot !== this.snapshot) return
    const row = this.rows[m.index]
    if (!row || !row.filePath) return
    await vscode.commands.executeCommand(
      'jokalala-code-analysis.goToIssue',
      vscode.Uri.file(row.filePath),
      row.line,
      row.column
    )
  }

  private static html(n: string, cspSource: string): string {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}' ${cspSource}; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jokalala Findings</title>
<style nonce="${n}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); margin: 0; padding: 0 16px 24px; }
  header { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 12px 0 8px; z-index: 1; border-bottom: 1px solid var(--vscode-panel-border); }
  h1 { font-size: 1.2em; margin: 0 0 8px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input[type=search], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; }
  input[type=search] { min-width: 260px; flex: 1; max-width: 520px; }
  #count { opacity: .75; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; table-layout: fixed; }
  th { text-align: left; position: sticky; top: 74px; background: var(--vscode-editor-background); padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  td { padding: 6px 8px; vertical-align: top; border-bottom: 1px solid var(--vscode-panel-border); overflow-wrap: anywhere; }
  tr.row { cursor: pointer; }
  tr.row:hover { background: var(--vscode-list-hoverBackground); }
  .sev { font-weight: 600; text-transform: uppercase; font-size: .8em; }
  .sev.critical { color: var(--vscode-errorForeground); }
  .sev.high { color: var(--vscode-editorWarning-foreground); }
  .sev.medium { color: var(--vscode-notificationsInfoIcon-foreground); }
  .sev.low, .sev.info { opacity: .8; }
  .badge { display: inline-block; font-size: .75em; padding: 0 6px; border-radius: 8px; margin-left: 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .fix { opacity: .8; margin-top: 4px; }
  .loc { font-family: var(--vscode-editor-font-family); }
  button.link { background: none; border: 0; padding: 0; color: var(--vscode-textLink-foreground); font: inherit; text-align: left; cursor: pointer; }
  button.link:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  .empty { padding: 24px 0; opacity: .75; }
</style></head>
<body>
<header>
  <h1>Findings</h1>
  <div class="bar">
    <input id="q" type="search" placeholder="Filter by file, message, CWE...">
    <select id="sev"><option value="">All severities</option><option>critical</option><option>high</option><option>medium</option><option>low</option><option>info</option></select>
    <label><input id="cross" type="checkbox"> cross-file only</label>
    <span id="count"></span>
  </div>
</header>
<table>
  <colgroup><col style="width:92px"><col style="width:30%"><col style="width:84px"><col></colgroup>
  <thead><tr><th>Severity</th><th>Location</th><th>CWE</th><th>Finding</th></tr></thead>
  <tbody id="body"></tbody>
</table>
<div id="empty" class="empty" hidden>No findings match.</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const body = document.getElementById('body');
  const q = document.getElementById('q');
  const sev = document.getElementById('sev');
  const cross = document.getElementById('cross');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  let rows = [];
  let snapshot = 0;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function render() {
    const needle = q.value.trim().toLowerCase();
    body.textContent = '';
    let shown = 0;
    for (const r of rows) {
      if (sev.value && r.severity !== sev.value) continue;
      if (cross.checked && !r.crossFile) continue;
      if (needle && !(r.displayPath + ' ' + r.message + ' ' + r.cwe + ' ' + r.category).toLowerCase().includes(needle)) continue;
      shown++;
      const tr = el('tr', 'row');
      tr.title = 'Open ' + r.displayPath + ':' + r.line;
      const open = () => vscode.postMessage({ type: 'open', index: r.index, snapshot });
      tr.addEventListener('click', open);
      tr.appendChild(el('td', 'sev ' + r.severity, r.severity));
      const loc = el('td', 'loc');
      const btn = el('button', 'link', r.displayPath + ':' + r.line);
      btn.type = 'button';
      btn.addEventListener('click', e => { e.stopPropagation(); open(); });
      loc.appendChild(btn);
      tr.appendChild(loc);
      tr.appendChild(el('td', '', r.cwe));
      const td = el('td');
      td.appendChild(el('span', '', r.message));
      if (r.crossFile) td.appendChild(el('span', 'badge', 'cross-file'));
      if (r.tier === 'engine') td.appendChild(el('span', 'badge', 'engine'));
      if (r.suggestion) td.appendChild(el('div', 'fix', 'Fix: ' + r.suggestion));
      tr.appendChild(td);
      body.appendChild(tr);
    }
    count.textContent = shown + ' of ' + rows.length + ' findings';
    empty.hidden = shown !== 0;
  }
  q.addEventListener('input', render); sev.addEventListener('change', render); cross.addEventListener('change', render);
  window.addEventListener('message', e => { if (e.data && e.data.type === 'rows') { rows = e.data.rows; snapshot = e.data.snapshot; render(); } });
</script>
</body></html>`
  }
}
