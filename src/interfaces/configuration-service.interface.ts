/**
 * Enhanced Configuration Service Interface
 * Provides type-safe configuration access with validation and migration support
 */

import * as vscode from 'vscode'

export interface IConfigurationService {
  /**
   * Get all extension settings
   * @returns Complete extension settings object
   */
  getSettings(): ExtensionSettings

  /**
   * Get a specific setting value
   * @param key The setting key
   * @returns The setting value
   */
  getSetting<K extends keyof ExtensionSettings>(key: K): ExtensionSettings[K]

  /**
   * Validate the current configuration
   * @returns Validation result with errors and warnings
   */
  validateConfiguration(): ValidationResult

  /**
   * Migrate configuration from an older version
   * @param fromVersion The version to migrate from
   */
  migrateConfiguration(fromVersion: string): Promise<void>

  /**
   * Watch for configuration changes
   * @param callback Function to call when configuration changes
   * @returns Disposable to stop watching
   */
  watch(callback: (changes: ConfigurationChanges) => void): vscode.Disposable

  /**
   * Reset all settings to default values
   */
  resetToDefaults(): Promise<void>

  /**
   * Export configuration as JSON string
   * @returns JSON string of current configuration
   */
  exportConfiguration(): string

  /**
   * Import configuration from JSON string
   * @param config JSON string containing configuration
   */
  importConfiguration(config: string): Promise<void>
}

export interface ExtensionSettings {
  apiEndpoint: string
  apiKey: string
  analysisMode: 'quick' | 'deep' | 'full'
  autoAnalyze: boolean
  showInlineWarnings: boolean
  enableDiagnostics: boolean
  maxFileSize: number
  maxProjectFiles: number
  maxProjectFileSize: number
  requestTimeout: number
  enableTelemetry: boolean

  // New settings for enhanced features
  cacheEnabled?: boolean
  cacheTTL?: number
  maxCacheSize?: number
  retryEnabled?: boolean
  maxRetries?: number
  retryDelay?: number
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  circuitBreakerEnabled?: boolean
  circuitBreakerThreshold?: number
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  setting: string
  message: string
  currentValue: any
  expectedType?: string
  allowedValues?: any[]
}

export interface ValidationWarning {
  setting: string
  message: string
  currentValue: any
  suggestedValue?: any
}

export interface ConfigurationChanges {
  added: Partial<ExtensionSettings>
  modified: Partial<ExtensionSettings>
  removed: string[]
}

export interface ConfigurationSchema {
  [key: string]: {
    type: string
    default: any
    description: string
    minimum?: number
    maximum?: number
    enum?: any[]
    required?: boolean
  }
}
