import axios from 'axios'
import * as vscode from 'vscode'
import {
  AnalysisOptions,
  AnalysisResult,
  FileAnalysisResult,
  HealthCheckResult,
  ICodeAnalysisService,
  ProjectAnalysisOptions,
  ProjectAnalysisResult,
  ProjectFile,
  QueueStatus,
  QueuedRequest,
} from '../interfaces/code-analysis-service.interface'
import { ExtensionSettings } from '../interfaces/configuration-service.interface'
import { CircuitBreakerManager } from '../utils/circuit-breaker'
import { PriorityQueue } from '../utils/priority-queue'
import {
  ValidationError,
  sanitizeAnalysisResult,
  sanitizeProjectAnalysisResult,
  validateAnalysisResult,
  validateProjectAnalysisResult,
} from '../utils/response-validator'
import { isRetryableError, retryWithBackoff } from '../utils/retry'
import { assertHttpsUrl, safeJoinUrl } from '../utils/url-validator'
import { getErrorMessage, normaliseError } from '../utils/typed-errors'
import {
  screenForSecrets,
  requestConsentForSecretsInCode,
} from '../utils/secrets-prescreener'
import { AuditEvent } from './audit-service'
import { AuthService } from './auth-service'
import { ConfigurationService } from './configuration-service'
import { Logger } from './logger'
import { SecurityService } from './security-service'
import { getOfflineAnalyzer } from '../core/offline-analyzer'
import { getCustomRuleEngine } from '../core/custom-rules'
import type { Issue, Recommendation } from '../interfaces/code-analysis-service.interface'

/** Reverse of CustomRuleEngine's internal extension→language map (custom-rules.ts),
 * used to synthesize a filename for language-applicability checks when no real
 * file path is available (e.g. selection-only analysis). */
function extensionForLanguage(language: string): string {
  const map: Record<string, string> = {
    typescript: '.ts',
    typescriptreact: '.tsx',
    javascript: '.js',
    javascriptreact: '.jsx',
    python: '.py',
    java: '.java',
    go: '.go',
    rust: '.rs',
    c: '.c',
    cpp: '.cpp',
    csharp: '.cs',
    php: '.php',
    ruby: '.rb',
  }
  return map[language.toLowerCase()] || '.txt'
}

// Lazily resolve audit service to avoid circular imports at module load time
function tryGetAudit() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuditService } = require('./audit-service') as typeof import('./audit-service')
    return getAuditService()
  } catch {
    return null
  }
}

export class CodeAnalysisService implements ICodeAnalysisService {
  private requestQueue: PriorityQueue<QueuedRequest>
  private activeRequests: Map<string, AbortController>
  private requestHistory: Map<string, QueuedRequest>
  private circuitBreaker: CircuitBreakerManager
  private isProcessing: boolean = false
  private queueStats = {
    completed: 0,
    failed: 0,
  }

  constructor(
    private readonly configuration: ConfigurationService,
    private readonly logger: Logger,
    private readonly authService?: AuthService,
    private readonly securityService?: SecurityService
  ) {
    this.requestQueue = new PriorityQueue<QueuedRequest>()
    this.activeRequests = new Map()
    this.requestHistory = new Map()
    this.circuitBreaker = new CircuitBreakerManager()
  }

  private get settings(): ExtensionSettings {
    return this.configuration.getSettings()
  }

  /**
   * Prefer Sign-In JWT from AuthService; fall back to an API key (jkl_…),
   * checked in SecretStorage first, then the (deprecated) plaintext setting.
   */
  private async buildAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const fromAuth = this.authService?.getAuthHeaders()
    if (fromAuth?.Authorization) {
      Object.assign(headers, fromAuth)
      return headers
    }
    const apiKey =
      (await this.securityService?.getApiKeyWithFallback()) ??
      this.settings.apiKey?.trim()
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    return headers
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.isEmpty()) {
      return
    }

    this.isProcessing = true

    try {
      while (!this.requestQueue.isEmpty()) {
        const request = this.requestQueue.dequeue()
        if (!request) {
          break
        }

        // Check if request was cancelled
        if (request.cancellationToken?.isCancellationRequested) {
          request.status = 'cancelled'
          this.requestHistory.set(request.id, request)
          continue
        }

        request.status = 'active'
        this.requestHistory.set(request.id, request)

        // Execute request with retry logic
        const retryResult = await retryWithBackoff(
          () => this.executeRequest(request),
          {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            isRetryable: isRetryableError,
          }
        )

        // Update request attempts
        request.attempts = retryResult.attempts

        if (retryResult.success) {
          request.status = 'completed'
          this.queueStats.completed++
          this.logger.info(
            `Request ${request.id} completed after ${retryResult.attempts} attempt(s)`
          )
        } else {
          request.status = 'failed'
          request.error = retryResult.error
          this.queueStats.failed++
          this.logger.error(
            `Request ${request.id} failed after ${retryResult.attempts} attempt(s)`,
            retryResult.error as Error
          )
        }

        this.requestHistory.set(request.id, request)
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    switch (request.type) {
      case 'file':
      case 'selection':
        await this.executeAnalysisRequest(request)
        break
      case 'project':
        await this.executeProjectRequest(request)
        break
      default:
        throw new Error(`Unknown request type: ${request.type}`)
    }
  }

  /**
   * Execute a code analysis request
   */
  private async executeAnalysisRequest(request: QueuedRequest): Promise<void> {
    const { code, language, options, resolve, reject } = request.payload
    try {
      const result = await this.performAnalysis(
        code,
        language,
        options,
        request.id
      )
      request.payload.result = result
      resolve(result)
    } catch (error) {
      reject(error)
      throw error
    }
  }

  /**
   * Execute a project analysis request
   */
  private async executeProjectRequest(request: QueuedRequest): Promise<void> {
    const { files, options, resolve, reject } = request.payload
    try {
      const result = await this.performProjectAnalysis(
        files,
        options,
        request.id
      )
      request.payload.result = result
      resolve(result)
    } catch (error) {
      reject(error)
      throw error
    }
  }

  /**
   * Analyze code with queue support
   */
  async analyzeCode(
    code: string,
    language: string,
    options?: AnalysisOptions,
    cancellationToken?: vscode.CancellationToken
  ): Promise<AnalysisResult> {
    const requestId = this.generateRequestId()
    const priority = options?.priority || 'normal'

    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: requestId,
        type: 'file',
        priority,
        payload: { code, language, options, resolve, reject },
        createdAt: new Date(),
        attempts: 0,
        status: 'pending',
        cancellationToken: cancellationToken || undefined,
      }

      this.requestQueue.enqueue(request, priority)
      this.requestHistory.set(requestId, request)

      // Start processing the queue
      this.processQueue().catch(error => {
        this.logger.error('Queue processing error', error)
      })

      // Handle cancellation
      if (cancellationToken) {
        cancellationToken.onCancellationRequested(() => {
          this.cancelAnalysis(requestId)
          reject(new Error('Analysis cancelled by user'))
        })
      }
    })
  }

  /**
   * Resolve effective tier from settings + analysis mode.
   * quick → local; deep/full → respect analysisTier (default hybrid).
   */
  private resolveAnalysisTier(
    analysisMode: string
  ): 'local' | 'hybrid' | 'cloud' {
    const configured =
      (this.settings as ExtensionSettings & { analysisTier?: string })
        .analysisTier || 'hybrid'
    if (analysisMode === 'quick') return 'local'
    if (configured === 'local' || configured === 'cloud' || configured === 'hybrid') {
      return configured
    }
    return 'hybrid'
  }

  private issueDedupeKey(issue: Issue): string {
    const line =
      issue.line ??
      issue.location?.startLine ??
      0
    const cwe =
      (Array.isArray((issue as { cwe?: string[] }).cwe) &&
        (issue as { cwe?: string[] }).cwe?.[0]) ||
      (issue.metadata && typeof issue.metadata.cweId === 'string'
        ? String(issue.metadata.cweId)
        : null) ||
      issue.ruleId ||
      issue.category ||
      issue.id ||
      issue.message
    // Include filePath so project-wide merges can't collide two unrelated
    // findings that happen to share a CWE + line number in different files.
    // Harmless for single-file hybrid merges, where filePath is unset on
    // both sides and this is just a constant empty-string prefix.
    const file = issue.filePath ?? issue.location?.filePath ?? ''
    return `${file}:${cwe}:${line}`
  }

  private mergeLocalAndCloud(
    local: AnalysisResult,
    cloud: AnalysisResult,
    requestId: string
  ): AnalysisResult {
    const seen = new Set<string>()
    const merged: Issue[] = []
    for (const issue of local.prioritizedIssues || []) {
      const key = this.issueDedupeKey(issue)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({
        ...issue,
        tags: [...(issue.tags || []), 'local-pack', 'tier-1'],
      })
    }
    for (const issue of cloud.prioritizedIssues || []) {
      const key = this.issueDedupeKey(issue)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({
        ...issue,
        tags: [...(issue.tags || []), 'cloud', 'tier-2'],
      })
    }
    const countBy = (sev: string) =>
      merged.filter(i => String(i.severity).toLowerCase() === sev).length
    return {
      ...cloud,
      prioritizedIssues: merged,
      summary: {
        totalIssues: merged.length,
        criticalIssues: countBy('critical'),
        highIssues: countBy('high'),
        mediumIssues: countBy('medium'),
        lowIssues: countBy('low'),
        analysisTime:
          (local.summary?.analysisTime || 0) + (cloud.summary?.analysisTime || 0),
      },
      requestId,
      metadata: {
        ...(cloud.metadata || {}),
        analysisTier: 'hybrid',
      },
    }
  }

  /**
   * Project-scope equivalent of mergeLocalAndCloud: merges an uncapped local
   * scan with a bounded cloud-enrichment pass over a subset of the same
   * files, reusing the same dedupe logic (now filePath-aware) and rebuilding
   * per-file grouping from the merged flat issue list.
   */
  mergeProjectResults(
    local: ProjectAnalysisResult,
    cloud: ProjectAnalysisResult,
    requestId: string
  ): ProjectAnalysisResult {
    const mergedFlat = this.mergeLocalAndCloud(local, cloud, requestId)

    const fileResultsMap = new Map<string, FileAnalysisResult>()
    for (const fr of local.fileResults ?? []) {
      fileResultsMap.set(fr.filePath, { filePath: fr.filePath, issues: [], language: fr.language })
    }
    for (const issue of mergedFlat.prioritizedIssues) {
      const key = issue.filePath ?? ''
      const existing = fileResultsMap.get(key)
      if (existing) {
        existing.issues.push(issue)
      } else {
        fileResultsMap.set(key, { filePath: key, issues: [issue] })
      }
    }

    return {
      ...mergedFlat,
      filesAnalyzed: local.filesAnalyzed,
      filesSkipped: (local.filesSkipped ?? 0) + (cloud.filesSkipped ?? 0),
      fileResults: Array.from(fileResultsMap.values()),
    }
  }

  /**
   * Build real, per-category recommendations from local findings instead of
   * a single static "results came from local packs" blurb — every finding
   * already carries a specific `suggestion` from its rule (e.g. "Never eval
   * request input; validate and use a safe parser"), it just never reached
   * the Recommendations panel before.
   */
  private buildLocalRecommendations(issues: Issue[]): Recommendation[] {
    if (issues.length === 0) {
      return [
        {
          title: 'No issues found',
          description: 'The local Tier-1 scan found no issues in the analyzed code.',
          category: 'general',
        },
      ]
    }

    const severityRank: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0,
    }

    const byCategory = new Map<
      string,
      { count: number; suggestion?: string; worstSeverity: string }
    >()
    for (const issue of issues) {
      const key = issue.category || 'general'
      const existing = byCategory.get(key)
      const rank = severityRank[issue.severity] ?? 0
      if (!existing) {
        byCategory.set(key, {
          count: 1,
          suggestion: issue.suggestion,
          worstSeverity: issue.severity,
        })
      } else {
        existing.count++
        if (rank > (severityRank[existing.worstSeverity] ?? 0)) {
          existing.worstSeverity = issue.severity
          existing.suggestion = issue.suggestion ?? existing.suggestion
        }
      }
    }

    return Array.from(byCategory.entries())
      .sort(
        (a, b) => (severityRank[b[1].worstSeverity] ?? 0) - (severityRank[a[1].worstSeverity] ?? 0)
      )
      .map(([category, info]) => ({
        title: `${info.count} ${category} issue${info.count > 1 ? 's' : ''} found`,
        description:
          info.suggestion || `Review ${info.count} ${category} finding(s) from the local scan.`,
        category,
        priority: (severityRank[info.worstSeverity] ?? 0) >= 3 ? 'high' : (severityRank[info.worstSeverity] ?? 0) >= 2 ? 'medium' : 'low',
      }))
  }

  private runOfflineAnalysis(
    code: string,
    language: string,
    requestId: string,
    filePath?: string
  ): AnalysisResult {
    const offline = getOfflineAnalyzer()
    const profile =
      ((this.settings as ExtensionSettings & { localPackProfile?: string })
        .localPackProfile as 'precision' | 'full') || 'precision'
    const result = offline.analyze(code, language, { packProfile: profile })
    const prioritizedIssues: Issue[] = result.issues.map(issue => ({
      id: issue.id,
      severity: String(issue.severity).toLowerCase() as Issue['severity'],
      category: issue.category || issue.ruleId,
      message: issue.message || issue.title || issue.description,
      suggestion: issue.suggestion,
      source: 'static' as const,
      codeSnippet: issue.codeSnippet,
      line: issue.line,
      column: issue.column,
      location: {
        startLine: issue.line,
        endLine: issue.endLine ?? issue.line,
        startColumn: issue.column,
        endColumn: issue.endColumn,
      },
      tags: ['local-pack', 'tier-1'],
      ruleId: issue.ruleId,
      metadata: {
        ...(issue.metadata || {}),
        source: 'local-pack',
        engineTier: 1,
      },
    }))

    // Custom/plugin rules (managed via the Plugins panel, CustomRuleEngine)
    // used to be pure UI — enabling a rule there never affected a real scan.
    // Run them here too so they actually contribute findings.
    const customRuleIssues = this.runCustomRules(code, language, filePath)
    prioritizedIssues.push(...customRuleIssues)

    return {
      prioritizedIssues,
      recommendations: this.buildLocalRecommendations(prioritizedIssues),
      summary: {
        totalIssues: prioritizedIssues.length,
        criticalIssues: prioritizedIssues.filter(i => i.severity === 'critical').length,
        highIssues: prioritizedIssues.filter(i => i.severity === 'high').length,
        mediumIssues: prioritizedIssues.filter(i => i.severity === 'medium').length,
        lowIssues: prioritizedIssues.filter(i => i.severity === 'low').length,
        analysisTime: result.summary.analysisTime,
      },
      requestId,
      metadata: {
        hasV2Report: false,
        v2AnalyzerVersion: 'local-tier1',
        rulesVersion: result.metadata.rulesVersion,
      },
    }
  }

  /**
   * Run the user/plugin-authored CustomRuleEngine rules (managed via the
   * Plugins panel) against a file and convert matches to Issues. filePath
   * drives the engine's language-applicability check (rule.languages vs.
   * file extension); when unavailable, a synthetic name is derived from the
   * language id so at least language-scoped (non-wildcard) rules still work.
   */
  private runCustomRules(code: string, language: string, filePath?: string): Issue[] {
    try {
      const ruleEngine = getCustomRuleEngine()
      const fileName = filePath ?? `untitled${extensionForLanguage(language)}`
      const matches = ruleEngine.execute(code, fileName)

      return matches.map(match => ({
        id: `custom:${match.ruleId}:${fileName}:${match.line}`,
        ruleId: match.ruleId,
        severity: match.severity as Issue['severity'],
        category: match.category,
        message: match.message,
        suggestion: match.suggestion,
        source: 'static' as const,
        codeSnippet: match.codeSnippet,
        line: match.line,
        column: match.column,
        location: {
          startLine: match.line,
          endLine: match.endLine,
          startColumn: match.column,
          endColumn: match.endColumn,
        },
        tags: ['custom-rule', ...(Array.isArray(match.metadata?.tags) ? match.metadata!.tags as string[] : [])],
        metadata: {
          ...match.metadata,
          source: 'custom-rule',
        },
      }))
    } catch (error) {
      // Custom rules must never break a real scan — log and continue.
      this.logger.warn('Custom rule execution failed', { error: getErrorMessage(error) })
      return []
    }
  }

  /**
   * Local-only, uncapped project scan — no cloud, no auth, no file-count
   * wall beyond whatever safety ceiling the caller applied when collecting
   * `files`. Runs the same per-file engine as single-file analysis
   * (runOfflineAnalysis, including custom/plugin rules) in yielded chunks so
   * the extension host stays responsive on large file sets.
   */
  async analyzeProjectLocally(
    files: ProjectFile[],
    cancellationToken?: vscode.CancellationToken,
    onProgress?: (filesDone: number, filesTotal: number) => void
  ): Promise<ProjectAnalysisResult> {
    const requestId = this.generateRequestId()
    const CHUNK_SIZE = 200
    const fileResults: FileAnalysisResult[] = []
    const allIssues: Issue[] = []

    for (let i = 0; i < files.length; i++) {
      if (cancellationToken?.isCancellationRequested) break

      const file = files[i]!
      const single = this.runOfflineAnalysis(file.content, file.language, requestId, file.path)
      const issuesWithPath = single.prioritizedIssues.map(issue => ({
        ...issue,
        filePath: file.path,
      }))

      allIssues.push(...issuesWithPath)
      fileResults.push({ filePath: file.path, issues: issuesWithPath, language: file.language })
      onProgress?.(i + 1, files.length)

      // Yield periodically so a large scan can't freeze the extension host,
      // and so cancellation is actually observed mid-scan.
      if ((i + 1) % CHUNK_SIZE === 0) {
        await new Promise<void>(resolve => setImmediate(resolve))
      }
    }

    const countBy = (sev: string) => allIssues.filter(i => i.severity === sev).length

    return {
      prioritizedIssues: allIssues,
      recommendations: this.buildLocalRecommendations(allIssues),
      summary: {
        totalIssues: allIssues.length,
        criticalIssues: countBy('critical'),
        highIssues: countBy('high'),
        mediumIssues: countBy('medium'),
        lowIssues: countBy('low'),
      },
      filesAnalyzed: fileResults.length,
      filesSkipped: 0,
      fileResults,
      requestId,
      metadata: {
        analysisTier: 'local',
        v2AnalyzerVersion: 'local-tier1',
      },
    }
  }

  /**
   * Perform the actual analysis (internal method)
   */
  private async performAnalysis(
    code: string,
    language: string,
    options: AnalysisOptions | undefined,
    requestId: string
  ): Promise<AnalysisResult> {
    const { apiEndpoint, requestTimeout } = this.settings
    const analysisMode = options?.mode || this.settings.analysisMode
    const timeout = options?.timeout || requestTimeout
    const audit = tryGetAudit()
    const tier = this.resolveAnalysisTier(analysisMode)

    this.logger.info(`Analysis request queued`, {
      requestId,
      language,
      mode: analysisMode,
      tier,
      codeLength: code.length,
    })

    if (tier === 'local') {
      const local = this.runOfflineAnalysis(code, language, requestId, options?.filePath)
      audit?.record(AuditEvent.ANALYSIS_COMPLETED, {
        requestId,
        language,
        issueCount: local.prioritizedIssues?.length ?? 0,
      })
      return local
    }

    const localResult =
      tier === 'hybrid'
        ? this.runOfflineAnalysis(code, language, requestId, options?.filePath)
        : null

    if (!apiEndpoint) {
      if (localResult) return localResult
      throw new Error(
        'API endpoint not configured. Please set jokalala.apiEndpoint in settings.'
      )
    }

    // ── HTTPS enforcement ────────────────────────────────────────────────────
    assertHttpsUrl(apiEndpoint, 'jokalala.apiEndpoint')

    // ── Secrets pre-screening (cloud path only) ───────────────────────────────
    const screening = screenForSecrets(code)
    if (screening.hasSecrets) {
      audit?.record(AuditEvent.ANALYSIS_SECRETS_DETECTED, {
        requestId,
        language,
        findingCount: screening.findings.length,
        severities: screening.findings.map(f => f.severity),
      })

      const consent = await requestConsentForSecretsInCode(screening.findings)
      if (!consent) {
        audit?.record(AuditEvent.ANALYSIS_CONSENT_DENIED, { requestId, language })
        if (localResult) return localResult
        throw new Error(
          'Analysis cancelled — remove hardcoded secrets from your code before sending for analysis.'
        )
      }
    }

    const fullUrl = safeJoinUrl(apiEndpoint, 'analyze-enhanced')

    audit?.record(AuditEvent.ANALYSIS_REQUESTED, {
      requestId,
      language,
      mode: analysisMode,
      codeLength: code.length,
    })

    const abortController = new AbortController()
    this.activeRequests.set(requestId, abortController)

    try {
      const response = await this.circuitBreaker.execute(apiEndpoint, async () =>
        axios.post(
          fullUrl,
          {
            code,
            language,
            analysisMode,
            context: {
              source: 'vscode-extension',
              version: '2.4.4',
              requestId,
            },
          },
          {
            headers: await this.buildAuthHeaders(),
            timeout,
            signal: abortController.signal,
          }
        )
      )

      if (response.data.success) {
        const data = response.data.data

        if (Array.isArray(data.recommendations)) {
          data.recommendations = data.recommendations.map((rec: unknown) =>
            typeof rec === 'string'
              ? { title: rec, description: rec, category: 'general' }
              : rec
          )
        }

        try {
          validateAnalysisResult(data)
        } catch (error) {
          if (error instanceof ValidationError) {
            this.logger.warn(`Response validation failed: ${error.message}. Sanitizing response.`)
            const sanitized = sanitizeAnalysisResult(data)
            sanitized.requestId = requestId
            if (localResult) {
              return this.mergeLocalAndCloud(localResult, sanitized, requestId)
            }
            return sanitized
          }
          throw error
        }

        data.requestId = requestId
        audit?.record(AuditEvent.ANALYSIS_COMPLETED, {
          requestId,
          language,
          issueCount: data.prioritizedIssues?.length ?? data.issues?.length ?? 0,
        })
        const cloud = data as AnalysisResult
        if (localResult) {
          return this.mergeLocalAndCloud(localResult, cloud, requestId)
        }
        return cloud
      } else {
        throw new Error(response.data.error?.message || 'Analysis failed')
      }
    } catch (e: unknown) {
      const appError = normaliseError(e)
      this.logger.error('Code analysis request failed', appError)
      audit?.record(AuditEvent.ANALYSIS_FAILED, {
        requestId,
        language,
        errorCode: appError.code,
      })

      if (axios.isCancel(e)) {
        audit?.record(AuditEvent.ANALYSIS_CANCELLED, { requestId })
        throw new Error('Analysis request was cancelled')
      }

      const axiosError = e as {
        response?: { status: number; data?: { error?: { message?: string } } }
        request?: unknown
      }

      // A rejected/expired token is never worth retrying with the same
      // credential, so clear it immediately regardless of the fallback path.
      if (axiosError.response?.status === 401) {
        await this.authService?.invalidateSession()
      }

      // Fail open to local Tier-1 when hybrid/network fails
      if (localResult) {
        this.logger.warn('Cloud analysis failed; returning local Tier-1 findings')
        return localResult
      }

      if (axiosError.response) {
        const status = axiosError.response.status
        if (status === 404) {
          throw new Error(
            `Analysis endpoint not found (404). Check jokalala.apiEndpoint in your settings.`
          )
        }
        if (status === 401) {
          throw new Error(
            'Authentication failed (401). Your Jokalala session has expired or is invalid — run "Jokalala: Sign In" to reconnect, or check jokalala.apiKey in settings.'
          )
        }
        throw new Error(
          `API Error (${status}): ${axiosError.response.data?.error?.message ?? getErrorMessage(e)}`
        )
      } else if (axiosError.request) {
        // Try offline as last resort
        try {
          return this.runOfflineAnalysis(code, language, requestId, options?.filePath)
        } catch {
          throw new Error(
            `Cannot connect to the Jokalala API. Check your jokalala.apiEndpoint setting and network connection.`
          )
        }
      }

      throw appError
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Perform project analysis (internal method)
   */
  /**
   * Send one batch of files to the cloud analyze-project endpoint. Extracted
   * from what used to be the whole of performProjectAnalysis so it can be
   * called once per chunk (and retried per chunk) instead of sending an
   * entire project's file contents in a single unbounded request.
   */
  private async sendProjectBatch(
    apiEndpoint: string,
    batch: ProjectFile[],
    requestId: string,
    timeout: number,
    abortController: AbortController
  ): Promise<ProjectAnalysisResult> {
    try {
      const response = await this.circuitBreaker.execute(apiEndpoint, async () =>
        axios.post(
          `${apiEndpoint}/analyze-project`,
          {
            files: batch.map(f => ({
              path: f.path,
              content: f.content,
              language: f.language,
              type: 'source',
            })),
            analysisDepth: 'standard',
            context: {
              requestId,
            },
          },
          {
            headers: await this.buildAuthHeaders(),
            timeout,
            signal: abortController.signal,
          }
        )
      )

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Project analysis failed')
      }

      const data = response.data.data

      // Transform recommendations if they're strings
      if (Array.isArray(data.recommendations)) {
        data.recommendations = data.recommendations.map((rec: any) =>
          typeof rec === 'string'
            ? { title: rec, description: rec, category: 'general' }
            : rec
        )
      }

      // Set default values for project-specific fields
      if (!data.filesAnalyzed) {
        data.filesAnalyzed = batch.length
      }
      if (!data.filesSkipped) {
        data.filesSkipped = 0
      }

      // Validate the response
      try {
        validateProjectAnalysisResult(data)
      } catch (error) {
        if (error instanceof ValidationError) {
          this.logger.warn(
            `Response validation failed: ${error.message}. Sanitizing response.`
          )
          const sanitized = sanitizeProjectAnalysisResult(data)
          sanitized.requestId = requestId
          return sanitized
        }
        throw error
      }

      data.requestId = requestId
      return data as ProjectAnalysisResult
    } catch (error: any) {
      if (axios.isCancel(error)) {
        throw new Error('Project analysis request was cancelled')
      }

      if (error.response) {
        const status = error.response.status
        if (status === 404) {
          throw new Error(
            'API endpoint not found (404). Start the Jokalala backend: pnpm dev'
          )
        }
        if (status === 401) {
          await this.authService?.invalidateSession()
          throw new Error(
            'Authentication failed (401). Your Jokalala session has expired or is invalid — run "Jokalala: Sign In" to reconnect, or check jokalala.apiKey in settings.'
          )
        }
        throw new Error(
          `API Error (${status}): ${error.response.data?.error?.message || error.message}`
        )
      } else if (error.request) {
        throw new Error('Cannot connect to server. Start the Jokalala backend with: pnpm dev')
      } else {
        throw new Error(`Request failed: ${error.message}`)
      }
    }
  }

  /**
   * Chunked cloud project analysis: splits `files` into
   * `cloudEnrichmentBatchSize`-sized batches, sends each through the
   * existing circuit breaker plus real retry (finally wiring the
   * retryEnabled/maxRetries/retryDelay settings, previously declared but
   * never read anywhere), and aggregates the results. Replaces the old
   * behavior of sending every file's full content in one unbounded request.
   */
  private async performProjectAnalysis(
    files: ProjectFile[],
    options: ProjectAnalysisOptions | undefined,
    requestId: string
  ): Promise<ProjectAnalysisResult> {
    const {
      apiEndpoint,
      requestTimeout,
      retryEnabled,
      maxRetries,
      retryDelay,
      cloudEnrichmentBatchSize,
    } = this.settings
    const timeout = options?.timeout || Math.max(requestTimeout, 300000)

    if (!apiEndpoint) {
      throw new Error('API endpoint not configured')
    }

    const abortController = new AbortController()
    this.activeRequests.set(requestId, abortController)

    const batchSize = Math.max(1, cloudEnrichmentBatchSize ?? 40)
    const batches: ProjectFile[][] = []
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize))
    }

    const allIssues: Issue[] = []
    const allRecommendations: unknown[] = []
    let filesSkipped = 0
    let lastMetadata: ProjectAnalysisResult['metadata']

    try {
      for (const batch of batches) {
        if (abortController.signal.aborted) break

        const retryResult = await retryWithBackoff(
          () => this.sendProjectBatch(apiEndpoint, batch, requestId, timeout, abortController),
          {
            maxAttempts: retryEnabled === false ? 1 : Math.max(1, maxRetries ?? 3),
            initialDelay: retryDelay ?? 1000,
            isRetryable: isRetryableError,
          }
        )

        if (!retryResult.success) {
          this.logger.error('Project analysis batch failed', retryResult.error)
          throw retryResult.error ?? new Error('Cloud project-batch analysis failed')
        }

        const batchResult = retryResult.result!
        allIssues.push(...(batchResult.prioritizedIssues ?? []))
        if (Array.isArray(batchResult.recommendations)) {
          allRecommendations.push(...batchResult.recommendations)
        }
        filesSkipped += batchResult.filesSkipped ?? 0
        lastMetadata = batchResult.metadata
      }

      const countBy = (sev: string) =>
        allIssues.filter(i => String(i.severity).toLowerCase() === sev).length

      return {
        prioritizedIssues: allIssues,
        recommendations: allRecommendations as ProjectAnalysisResult['recommendations'],
        summary: {
          totalIssues: allIssues.length,
          criticalIssues: countBy('critical'),
          highIssues: countBy('high'),
          mediumIssues: countBy('medium'),
          lowIssues: countBy('low'),
        },
        filesAnalyzed: files.length - filesSkipped,
        filesSkipped,
        requestId,
        metadata: { ...(lastMetadata ?? {}), analysisTier: 'cloud' },
      }
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Analyze project with queue support
   */
  async analyzeProject(
    files: ProjectFile[],
    options?: ProjectAnalysisOptions,
    cancellationToken?: vscode.CancellationToken
  ): Promise<ProjectAnalysisResult> {
    const requestId = this.generateRequestId()
    const priority = options?.priority || 'normal'

    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: requestId,
        type: 'project',
        priority,
        payload: { files, options, resolve, reject },
        createdAt: new Date(),
        attempts: 0,
        status: 'pending',
        cancellationToken: cancellationToken || undefined,
      }

      this.requestQueue.enqueue(request, priority)
      this.requestHistory.set(requestId, request)

      // Start processing the queue
      this.processQueue().catch(error => {
        this.logger.error('Queue processing error', error)
      })

      // Handle cancellation
      if (cancellationToken) {
        cancellationToken.onCancellationRequested(() => {
          this.cancelAnalysis(requestId)
          reject(new Error('Project analysis cancelled by user'))
        })
      }
    })
  }

  async clearCache(): Promise<void> {
    const { apiEndpoint } = this.settings

    if (!apiEndpoint) {
      throw new Error('API endpoint not configured')
    }

    try {
      await axios.delete(`${apiEndpoint}/cache`, {
        headers: await this.buildAuthHeaders(),
      })
    } catch (error: any) {
      this.logger.error('Failed to clear cache', error)
      throw new Error(`Failed to clear cache: ${error.message}`)
    }
  }

  async testConnection(): Promise<HealthCheckResult> {
    const { apiEndpoint, requestTimeout } = this.settings

    if (!apiEndpoint) {
      return {
        healthy: false,
        message: 'API endpoint not configured',
      }
    }

    const healthEndpoint = `${apiEndpoint.replace(/\/$/, '')}/health`
    const startTime = Date.now()

    try {
      const response = await axios.get(healthEndpoint, {
        headers: await this.buildAuthHeaders(),
        timeout: Math.min(requestTimeout, 15_000),
      })

      const responseTime = Date.now() - startTime

      return {
        healthy: true,
        message: 'Service is healthy',
        responseTime,
        version: response.data?.version,
      }
    } catch (error: any) {
      this.logger.warn(
        'Health check failed - proceeding without blocking activation',
        error
      )

      return {
        healthy: false,
        message:
          error.message || 'Unable to reach analysis service health endpoint',
        responseTime: Date.now() - startTime,
      }
    }
  }

  /**
   * Cancel an in-progress analysis request
   */
  cancelAnalysis(requestId: string): void {
    // Cancel the active request if it exists
    const abortController = this.activeRequests.get(requestId)
    if (abortController) {
      abortController.abort()
      this.activeRequests.delete(requestId)
    }

    // Remove from queue if still pending
    this.requestQueue.remove(request => request.id === requestId)

    // Update request status
    const request = this.requestHistory.get(requestId)
    if (request) {
      request.status = 'cancelled'
      this.requestHistory.set(requestId, request)
    }

    this.logger.info(`Request ${requestId} cancelled`)
  }

  /**
   * Get the current status of the request queue
   */
  getQueueStatus(): QueueStatus {
    const pending = this.requestQueue.size()
    const active = this.activeRequests.size

    return {
      pending,
      active,
      completed: this.queueStats.completed,
      failed: this.queueStats.failed,
    }
  }

  /**
   * Retry a failed request
   */
  async retryFailedRequest(requestId: string): Promise<void> {
    const request = this.requestHistory.get(requestId)

    if (!request) {
      throw new Error(`Request ${requestId} not found`)
    }

    if (request.status !== 'failed') {
      throw new Error(`Request ${requestId} is not in failed state`)
    }

    // Reset request status and re-queue
    request.status = 'pending'
    request.attempts = 0
    delete request.error

    this.requestQueue.enqueue(request, request.priority)
    this.requestHistory.set(requestId, request)

    // Start processing the queue
    await this.processQueue()
  }
}
