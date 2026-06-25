/**
 * Typed Error Hierarchy
 *
 * Replaces the widespread `catch (error: any)` pattern throughout the
 * codebase with a structured error hierarchy. This enables:
 *  - Predictable error handling (no accidental `error.message` on non-Error values)
 *  - Error categorisation for the audit log
 *  - Proper TypeScript narrowing without `as any` casts
 */

// ── Type guards ──────────────────────────────────────────────────────────────

/** Returns true if `e` is an Error instance (not just any truthy value). */
export function isError(e: unknown): e is Error {
  return e instanceof Error
}

/** Safely extracts a message string from any thrown value. */
export function getErrorMessage(e: unknown): string {
  if (isError(e)) return e.message
  if (typeof e === 'string') return e
  if (e !== null && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message)
  }
  return 'An unknown error occurred'
}

/** Safely extracts a stack trace from any thrown value. */
export function getErrorStack(e: unknown): string | undefined {
  if (isError(e)) return e.stack
  return undefined
}

// ── Base application error ───────────────────────────────────────────────────

export class AppError extends Error {
  /** Machine-readable error code for logging and telemetry */
  readonly code: string
  /** Whether this error is safe to surface to the user without sanitisation */
  readonly isUserFacing: boolean

  constructor(message: string, code: string, isUserFacing = false) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.isUserFacing = isUserFacing
    // Restore prototype chain (needed when targeting ES5)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ── Specialised error types ──────────────────────────────────────────────────

/** Thrown when a network or HTTP request fails */
export class NetworkError extends AppError {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message, 'NETWORK_ERROR', true)
    this.statusCode = statusCode
  }
}

/** Thrown when response or input data fails schema validation */
export class ValidationError extends AppError {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', false)
    this.field = field
  }
}

/** Thrown for authentication / authorisation failures */
export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', true)
  }
}

/** Thrown when a plugin violates security constraints */
export class PluginSecurityError extends AppError {
  readonly pluginId: string

  constructor(pluginId: string, reason: string) {
    super(
      `Plugin "${pluginId}" blocked — ${reason}`,
      'PLUGIN_SECURITY_ERROR',
      false
    )
    this.pluginId = pluginId
  }
}

/** Thrown when HTTPS or URL validation fails */
export class SecurityError extends AppError {
  constructor(message: string) {
    super(message, 'SECURITY_ERROR', false)
  }
}

/** Thrown when an analysis operation is cancelled */
export class CancellationError extends AppError {
  constructor() {
    super('Operation cancelled', 'CANCELLED', false)
  }
}

// ── Normalisation helper ─────────────────────────────────────────────────────

/**
 * Wraps any thrown value in the appropriate AppError subclass.
 * Avoids `as any` casts in catch blocks.
 *
 * Usage:
 *   ```ts
 *   try { ... }
 *   catch (e: unknown) {
 *     throw normaliseError(e, 'Code analysis failed')
 *   }
 *   ```
 */
export function normaliseError(e: unknown, fallbackMessage?: string): AppError {
  if (e instanceof AppError) return e

  const message = fallbackMessage ?? getErrorMessage(e)

  // Axios-style HTTP error
  if (
    e !== null &&
    typeof e === 'object' &&
    'response' in e &&
    (e as { response?: { status?: number } }).response?.status !== undefined
  ) {
    const status = (e as { response: { status: number } }).response.status
    return new NetworkError(message, status)
  }

  if (isError(e)) {
    return new AppError(e.message, 'UNKNOWN_ERROR', false)
  }

  return new AppError(message, 'UNKNOWN_ERROR', false)
}
