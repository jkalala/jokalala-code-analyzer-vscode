import axios from 'axios'
import * as vscode from 'vscode'
import {
  AnalysisOptions,
  AnalysisResult,
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
import { ConfigurationService } from './configuration-service'
import { Logger } from './logger'

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
    private readonly logger: Logger
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
   * Perform the actual analysis (internal method)
   */
  private async performAnalysis(
    code: string,
    language: string,
    options: AnalysisOptions | undefined,
    requestId: string
  ): Promise<AnalysisResult> {
    const { apiEndpoint, apiKey, requestTimeout } = this.settings
    const analysisMode = options?.mode || this.settings.analysisMode
    const timeout = options?.timeout || requestTimeout

    if (!apiEndpoint) {
      throw new Error(
        'API endpoint not configured. Please set jokalala.apiEndpoint in settings.'
      )
    }

    // Normalize endpoint - remove trailing slash if present
    const normalizedEndpoint = apiEndpoint.replace(/\/$/, '')
    const fullUrl = `${normalizedEndpoint}/analyze-enhanced`
    this.logger.info(`[DEBUG] ====== ANALYSIS REQUEST ======`)
    this.logger.info(`[DEBUG] Original API Endpoint: ${apiEndpoint}`)
    this.logger.info(`[DEBUG] Normalized Endpoint: ${normalizedEndpoint}`)
    this.logger.info(`[DEBUG] Full URL: ${fullUrl}`)
    this.logger.info(`[DEBUG] Analysis Mode: ${analysisMode}`)
    this.logger.info(`[DEBUG] Language: ${language}`)
    this.logger.info(`[DEBUG] Code length: ${code.length} chars`)

    // Create abort controller for this request
    const abortController = new AbortController()
    this.activeRequests.set(requestId, abortController)

    try {
      this.logger.info(`[DEBUG] Executing request via circuit breaker...`)
      // Execute request with circuit breaker protection
      const response = await this.circuitBreaker.execute(normalizedEndpoint, () =>
        axios.post(
          fullUrl,
          {
            code,
            language,
            analysisMode,
            context: {
              source: 'vscode-extension',
              version: '1.0.0',
              requestId,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
            timeout,
            signal: abortController.signal,
          }
        )
      )

      if (response.data.success) {
        const data = response.data.data

        // Transform recommendations if they're strings
        if (Array.isArray(data.recommendations)) {
          data.recommendations = data.recommendations.map((rec: any) =>
            typeof rec === 'string'
              ? { title: rec, description: rec, category: 'general' }
              : rec
          )
        }

        // Validate the response
        try {
          validateAnalysisResult(data)
        } catch (error) {
          if (error instanceof ValidationError) {
            this.logger.warn(
              `Response validation failed: ${error.message}. Sanitizing response.`
            )
            // Sanitize the response to ensure it has all required fields
            const sanitized = sanitizeAnalysisResult(data)
            sanitized.requestId = requestId
            return sanitized
          }
          throw error
        }

        // Add request ID
        data.requestId = requestId
        return data as AnalysisResult
      } else {
        throw new Error(response.data.error?.message || 'Analysis failed')
      }
    } catch (error: any) {
      this.logger.error(`[DEBUG] ====== REQUEST FAILED ======`)
      this.logger.error(`[DEBUG] Error type: ${error.name || 'Unknown'}`)
      this.logger.error(`[DEBUG] Error message: ${error.message}`)
      this.logger.error(`[DEBUG] Has response: ${!!error.response}`)
      this.logger.error(`[DEBUG] Has request: ${!!error.request}`)
      if (error.response) {
        this.logger.error(`[DEBUG] Response status: ${error.response.status}`)
        this.logger.error(`[DEBUG] Response URL: ${error.response.config?.url}`)
      }
      if (error.config) {
        this.logger.error(`[DEBUG] Request URL: ${error.config.url}`)
        this.logger.error(`[DEBUG] Request method: ${error.config.method}`)
      }
      this.logger.error('Code analysis request failed', error)

      if (axios.isCancel(error)) {
        throw new Error('Analysis request was cancelled')
      }

      if (error.response) {
        const status = error.response.status
        if (status === 404) {
          throw new Error(
            `API endpoint not found (404). URL attempted: ${error.config?.url || fullUrl}. Start the Jokalala backend: pnpm dev`
          )
        }
        throw new Error(
          `API Error (${status}): ${error.response.data?.error?.message || error.message}`
        )
      } else if (error.request) {
        throw new Error(`Cannot connect to server at ${fullUrl}. Start the Jokalala backend with: pnpm dev`)
      } else {
        throw new Error(`Request failed: ${error.message}`)
      }
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Perform project analysis (internal method)
   */
  private async performProjectAnalysis(
    files: ProjectFile[],
    options: ProjectAnalysisOptions | undefined,
    requestId: string
  ): Promise<ProjectAnalysisResult> {
    const { apiEndpoint, apiKey, requestTimeout } = this.settings
    const timeout = options?.timeout || Math.max(requestTimeout, 300000)

    if (!apiEndpoint) {
      throw new Error('API endpoint not configured')
    }

    // Create abort controller for this request
    const abortController = new AbortController()
    this.activeRequests.set(requestId, abortController)

    try {
      // Execute request with circuit breaker protection
      const response = await this.circuitBreaker.execute(apiEndpoint, () =>
        axios.post(
          `${apiEndpoint}/analyze-project`,
          {
            files: files.map(f => ({
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
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
            timeout,
            signal: abortController.signal,
          }
        )
      )

      if (response.data.success) {
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
          data.filesAnalyzed = files.length
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
            // Sanitize the response to ensure it has all required fields
            const sanitized = sanitizeProjectAnalysisResult(data)
            sanitized.requestId = requestId
            return sanitized
          }
          throw error
        }

        // Add request ID
        data.requestId = requestId
        return data as ProjectAnalysisResult
      } else {
        throw new Error(
          response.data.error?.message || 'Project analysis failed'
        )
      }
    } catch (error: any) {
      this.logger.error('Project analysis request failed', error)

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
        throw new Error(
          `API Error (${status}): ${error.response.data?.error?.message || error.message}`
        )
      } else if (error.request) {
        throw new Error('Cannot connect to server. Start the Jokalala backend with: pnpm dev')
      } else {
        throw new Error(`Request failed: ${error.message}`)
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
    const { apiEndpoint, apiKey } = this.settings

    if (!apiEndpoint) {
      throw new Error('API endpoint not configured')
    }

    try {
      await axios.delete(`${apiEndpoint}/cache`, {
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
      })
    } catch (error: any) {
      this.logger.error('Failed to clear cache', error)
      throw new Error(`Failed to clear cache: ${error.message}`)
    }
  }

  async testConnection(): Promise<HealthCheckResult> {
    const { apiEndpoint, apiKey, requestTimeout } = this.settings

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
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
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
