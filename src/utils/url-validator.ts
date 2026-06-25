/**
 * URL Validator — centralised HTTPS enforcement and safe URL construction.
 *
 * Every external API call in the extension must go through these helpers so
 * that user-configurable endpoints can never redirect data to plain-HTTP or
 * to unexpected hosts.
 */

/** Localhost origins that are allowed to use HTTP during development. */
const DEV_ORIGINS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
])

/** Result of a URL validation check. */
export interface UrlValidationResult {
  valid: boolean
  /** Human-readable reason when valid === false */
  reason?: string
  /** Suggested HTTPS replacement when the only problem is the scheme */
  suggestion?: string
}

/**
 * Validate that a URL is safe to use as an API endpoint.
 *
 * Rules enforced:
 * - Must parse as a valid URL
 * - Must use HTTPS — HTTP is only allowed for localhost/127.0.0.1 in development
 * - Must not contain user credentials (username:password@host)
 * - Must not use `javascript:` or `data:` schemes
 */
export function validateApiUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL must be a non-empty string' }
  }

  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return { valid: false, reason: `Not a valid URL: "${url}"` }
  }

  // Block dangerous schemes unconditionally
  if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:' || parsed.protocol === 'file:') {
    return { valid: false, reason: `Scheme "${parsed.protocol}" is not permitted` }
  }

  // Block credentials embedded in URL (SSRF / credential-leak vector)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: 'Credentials must not be embedded in the URL',
    }
  }

  // Enforce HTTPS — allow HTTP only for localhost in development
  if (parsed.protocol !== 'https:') {
    const isLocalhost = DEV_ORIGINS.has(parsed.hostname)
    if (!isLocalhost) {
      const suggestion = url.replace(/^http:/, 'https:')
      return {
        valid: false,
        reason: `API endpoint must use HTTPS (received "${parsed.protocol}"). Update your jokalala.apiEndpoint setting.`,
        suggestion,
      }
    }
  }

  return { valid: true }
}

/**
 * Safely join a base URL and a path segment.
 *
 * Unlike template literals (`${base}/${path}`), this uses the URL constructor
 * to prevent double-slash issues, and ensures the resulting URL stays under
 * the same origin so callers can't inject a different host.
 *
 * @throws {Error} when base URL is invalid, the result would change origin, or the
 *         base URL fails HTTPS validation.
 */
export function safeJoinUrl(base: string, ...segments: string[]): string {
  const validation = validateApiUrl(base)
  if (!validation.valid) {
    throw new Error(`Invalid base URL: ${validation.reason}`)
  }

  const baseUrl = new URL(base)
  const baseOrigin = baseUrl.origin

  // Strip leading/trailing slashes from segments; strip trailing slash from base path
  const basePath = baseUrl.pathname.replace(/\/$/, '')
  const joined = segments
    .map(s => s.replace(/^\/+|\/+$/g, '').replace(/\.\./g, '')) // strip path traversal attempts
    .filter(Boolean)
    .join('/')

  const result = new URL(`${basePath}/${joined}`, `${baseUrl.protocol}//${baseUrl.host}`)

  // Ensure the result stays on the same origin
  if (result.origin !== baseOrigin) {
    throw new Error(`URL segment would change origin: "${segments.join('/')}"`)
  }

  return result.toString()
}

/**
 * Quick guard — throws a descriptive error if the URL does not pass
 * validateApiUrl.  Use this as a one-liner before fetch/axios calls.
 */
export function assertHttpsUrl(url: string, label = 'API URL'): void {
  const result = validateApiUrl(url)
  if (!result.valid) {
    throw new Error(`${label}: ${result.reason}`)
  }
}
