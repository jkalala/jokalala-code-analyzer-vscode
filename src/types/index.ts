/**
 * Shared Type Definitions
 * Common types used across the extension
 */

/**
 * Analysis mode types
 */
export type AnalysisMode = 'quick' | 'deep' | 'full'

/**
 * Priority levels
 */
export type Priority = 'low' | 'normal' | 'high'

/**
 * Severity levels
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/**
 * Issue source types
 */
export type IssueSource = 'static' | 'llm'

/**
 * Impact levels
 */
export type Impact = 'low' | 'medium' | 'high'

/**
 * Request status types
 */
export type RequestStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Request types
 */
export type RequestType = 'file' | 'selection' | 'project'

/**
 * Log level types
 */
export type LogLevelType = 'debug' | 'info' | 'warn' | 'error'

/**
 * Utility type for making all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Utility type for making all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P]
}

/**
 * Utility type for readonly properties
 */
export type Immutable<T> = {
  readonly [P in keyof T]: T[P] extends object ? Immutable<T[P]> : T[P]
}

/**
 * Utility type for nullable values
 */
export type Nullable<T> = T | null | undefined

/**
 * Utility type for async function return types
 */
export type AsyncReturnType<T extends (...args: any) => Promise<any>> =
  T extends (...args: any) => Promise<infer R> ? R : never

/**
 * Utility type for function parameters
 */
export type FunctionParams<T extends (...args: any) => any> = T extends (
  ...args: infer P
) => any
  ? P
  : never
