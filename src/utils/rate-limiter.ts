/**
 * Rate Limiter Utility
 * Token bucket algorithm with queueing and priority support
 */

export interface RateLimitConfig {
  requestsPerMinute: number
  burstSize: number
  refillRate: number
  enableQueue: boolean
  maxQueueSize: number
  queueTimeout: number
}

export interface RateLimitStatus {
  availableTokens: number
  maxTokens: number
  queuedRequests: number
  nextTokenIn: number
  isLimited: boolean
  requestsInWindow: number
  windowResetTime: number
}

interface QueuedRequest<T> {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
  priority: 'high' | 'normal' | 'low'
  createdAt: number
  timeout: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 60,
  burstSize: 10,
  refillRate: 1,
  enableQueue: true,
  maxQueueSize: 20,
  queueTimeout: 30000,
}

export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private requestQueue: QueuedRequest<unknown>[] = []
  private isProcessingQueue = false
  private requestLog: number[] = []
  private readonly config: RateLimitConfig

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.tokens = this.config.burstSize
    this.lastRefill = Date.now()
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const tokensToAdd = elapsed * this.config.refillRate
    this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  private cleanRequestLog(): void {
    const oneMinuteAgo = Date.now() - 60000
    this.requestLog = this.requestLog.filter(time => time > oneMinuteAgo)
  }

  canMakeRequest(): boolean {
    this.refillTokens()
    this.cleanRequestLog()
    return this.tokens >= 1 && this.requestLog.length < this.config.requestsPerMinute
  }

  private consumeToken(): boolean {
    this.refillTokens()
    this.cleanRequestLog()

    if (this.tokens >= 1 && this.requestLog.length < this.config.requestsPerMinute) {
      this.tokens -= 1
      this.requestLog.push(Date.now())
      return true
    }
    return false
  }

  getTimeUntilNextToken(): number {
    this.refillTokens()
    if (this.tokens >= 1) return 0
    const timeForToken = (1 - (this.tokens % 1)) / this.config.refillRate * 1000
    if (this.requestLog.length >= this.config.requestsPerMinute && this.requestLog.length > 0) {
      const windowReset = this.requestLog[0] + 60000 - Date.now()
      return Math.max(timeForToken, windowReset)
    }
    return timeForToken
  }

  async execute<T>(fn: () => Promise<T>, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<T> {
    if (this.consumeToken()) return fn()

    if (this.config.enableQueue) {
      if (this.requestQueue.length >= this.config.maxQueueSize) {
        throw new RateLimitError('Rate limit queue is full', this.getTimeUntilNextToken())
      }
      return this.queueRequest(fn, priority)
    }

    throw new RateLimitError(
      \`Rate limited. Wait \${Math.ceil(this.getTimeUntilNextToken() / 1000)}s\`,
      this.getTimeUntilNextToken()
    )
  }

  private queueRequest<T>(fn: () => Promise<T>, priority: 'high' | 'normal' | 'low'): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        execute: fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        createdAt: Date.now(),
        timeout: this.config.queueTimeout,
      }

      const priorityOrder = { high: 0, normal: 1, low: 2 }
      const insertIndex = this.requestQueue.findIndex(
        r => priorityOrder[r.priority] > priorityOrder[priority]
      )

      if (insertIndex === -1) {
        this.requestQueue.push(request as QueuedRequest<unknown>)
      } else {
        this.requestQueue.splice(insertIndex, 0, request as QueuedRequest<unknown>)
      }

      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return
    this.isProcessingQueue = true

    try {
      while (this.requestQueue.length > 0) {
        const now = Date.now()
        this.requestQueue = this.requestQueue.filter(req => {
          if (now - req.createdAt > req.timeout) {
            req.reject(new RateLimitError('Request timed out', 0))
            return false
          }
          return true
        })

        if (this.requestQueue.length === 0) break

        const waitTime = this.getTimeUntilNextToken()
        if (waitTime > 0) {
          await new Promise(r => setTimeout(r, Math.min(waitTime, 1000)))
          continue
        }

        if (this.consumeToken()) {
          const request = this.requestQueue.shift()
          if (request) {
            try {
              request.resolve(await request.execute())
            } catch (e) {
              request.reject(e instanceof Error ? e : new Error(String(e)))
            }
          }
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  getStatus(): RateLimitStatus {
    this.refillTokens()
    this.cleanRequestLog()
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.config.burstSize,
      queuedRequests: this.requestQueue.length,
      nextTokenIn: this.getTimeUntilNextToken(),
      isLimited: !this.canMakeRequest(),
      requestsInWindow: this.requestLog.length,
      windowResetTime: this.requestLog[0] ? this.requestLog[0] + 60000 : Date.now() + 60000,
    }
  }

  reset(): void {
    this.tokens = this.config.burstSize
    this.lastRefill = Date.now()
    this.requestLog = []
    this.requestQueue.forEach(r => r.reject(new RateLimitError('Reset', 0)))
    this.requestQueue = []
  }
}

export class RateLimitError extends Error {
  readonly retryAfter: number
  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

export class RateLimiterManager {
  private limiters = new Map<string, RateLimiter>()
  private globalLimiter: RateLimiter

  constructor(config?: Partial<RateLimitConfig>) {
    this.globalLimiter = new RateLimiter(config)
  }

  getLimiter(endpoint: string, config?: Partial<RateLimitConfig>): RateLimiter {
    if (!this.limiters.has(endpoint)) {
      this.limiters.set(endpoint, new RateLimiter(config))
    }
    return this.limiters.get(endpoint)!
  }

  getAllStatus(): Record<string, RateLimitStatus> {
    const status: Record<string, RateLimitStatus> = { global: this.globalLimiter.getStatus() }
    this.limiters.forEach((l, k) => status[k] = l.getStatus())
    return status
  }

  resetAll(): void {
    this.globalLimiter.reset()
    this.limiters.forEach(l => l.reset())
  }
}

export const globalRateLimiter = new RateLimiterManager()