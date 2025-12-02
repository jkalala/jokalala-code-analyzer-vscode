import * as vscode from 'vscode'
import {
  ConfigurationChanges,
  ConfigurationSchema,
  ExtensionSettings,
  IConfigurationService,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from '../interfaces/configuration-service.interface'

export type AnalysisMode = 'quick' | 'deep' | 'full'

// Configuration schema for validation
const CONFIGURATION_SCHEMA: ConfigurationSchema = {
  apiEndpoint: {
    type: 'string',
    default: 'https://localhost:3000/api/agents/dev-assistant',
    description: 'API endpoint for code analysis service',
    required: true,
  },
  apiKey: {
    type: 'string',
    default: '',
    description: 'API key for authentication (deprecated - use SecretStorage)',
    required: false,
  },
  analysisMode: {
    type: 'string',
    default: 'full',
    description: 'Analysis mode: quick, deep, or full',
    enum: ['quick', 'deep', 'full'],
    required: true,
  },
  autoAnalyze: {
    type: 'boolean',
    default: false,
    description: 'Automatically analyze files on save',
    required: true,
  },
  showInlineWarnings: {
    type: 'boolean',
    default: true,
    description: 'Show inline warnings in editor',
    required: true,
  },
  enableDiagnostics: {
    type: 'boolean',
    default: true,
    description: 'Enable diagnostics integration',
    required: true,
  },
  maxFileSize: {
    type: 'number',
    default: 50_000,
    description: 'Maximum file size for analysis (characters)',
    minimum: 1000,
    maximum: 500_000,
    required: true,
  },
  maxProjectFiles: {
    type: 'number',
    default: 40,
    description: 'Maximum number of files to analyze in project',
    minimum: 1,
    maximum: 200,
    required: true,
  },
  maxProjectFileSize: {
    type: 'number',
    default: 120_000,
    description: 'Maximum file size for project analysis (characters)',
    minimum: 1000,
    maximum: 1_000_000,
    required: true,
  },
  requestTimeout: {
    type: 'number',
    default: 60_000,
    description: 'Request timeout in milliseconds',
    minimum: 5_000,
    maximum: 300_000,
    required: true,
  },
  enableTelemetry: {
    type: 'boolean',
    default: true,
    description: 'Enable anonymous telemetry collection',
    required: true,
  },
  cacheEnabled: {
    type: 'boolean',
    default: true,
    description: 'Enable result caching',
    required: false,
  },
  cacheTTL: {
    type: 'number',
    default: 1800_000, // 30 minutes
    description: 'Cache time-to-live in milliseconds',
    minimum: 60_000, // 1 minute
    maximum: 86_400_000, // 24 hours
    required: false,
  },
  maxCacheSize: {
    type: 'number',
    default: 104_857_600, // 100 MB
    description: 'Maximum cache size in bytes',
    minimum: 10_485_760, // 10 MB
    maximum: 1_073_741_824, // 1 GB
    required: false,
  },
  retryEnabled: {
    type: 'boolean',
    default: true,
    description: 'Enable request retry logic',
    required: false,
  },
  maxRetries: {
    type: 'number',
    default: 3,
    description: 'Maximum number of retry attempts',
    minimum: 0,
    maximum: 10,
    required: false,
  },
  retryDelay: {
    type: 'number',
    default: 1000,
    description: 'Initial retry delay in milliseconds',
    minimum: 100,
    maximum: 10_000,
    required: false,
  },
  logLevel: {
    type: 'string',
    default: 'info',
    description: 'Logging level',
    enum: ['debug', 'info', 'warn', 'error'],
    required: false,
  },
  circuitBreakerEnabled: {
    type: 'boolean',
    default: true,
    description: 'Enable circuit breaker pattern',
    required: false,
  },
  circuitBreakerThreshold: {
    type: 'number',
    default: 5,
    description: 'Circuit breaker failure threshold',
    minimum: 1,
    maximum: 20,
    required: false,
  },
}

// Helper functions removed - not currently used
// Can be re-added if needed in the future

// Create default settings from schema (not used but kept for reference)
// const DEFAULT_SETTINGS: ExtensionSettings = {
//   apiEndpoint: getSchemaDefault<string>('apiEndpoint'),
//   apiKey: getSchemaDefault<string>('apiKey'),
//   analysisMode: getSchemaDefault<AnalysisMode>('analysisMode'),
//   autoAnalyze: getSchemaDefault<boolean>('autoAnalyze'),
//   showInlineWarnings: getSchemaDefault<boolean>('showInlineWarnings'),
//   enableDiagnostics: getSchemaDefault<boolean>('enableDiagnostics'),
//   maxFileSize: getSchemaDefault<number>('maxFileSize'),
//   maxProjectFiles: getSchemaDefault<number>('maxProjectFiles'),
//   maxProjectFileSize: getSchemaDefault<number>('maxProjectFileSize'),
//   requestTimeout: getSchemaDefault<number>('requestTimeout'),
//   enableTelemetry: getSchemaDefault<boolean>('enableTelemetry'),
//   cacheEnabled: getOptionalSchemaDefault<boolean>('cacheEnabled'),
//   cacheTTL: getOptionalSchemaDefault<number>('cacheTTL'),
//   maxCacheSize: getOptionalSchemaDefault<number>('maxCacheSize'),
//   retryEnabled: getOptionalSchemaDefault<boolean>('retryEnabled'),
//   maxRetries: getOptionalSchemaDefault<number>('maxRetries'),
//   retryDelay: getOptionalSchemaDefault<number>('retryDelay'),
//   logLevel: getOptionalSchemaDefault<'debug' | 'info' | 'warn' | 'error'>('logLevel'),
//   circuitBreakerEnabled: getOptionalSchemaDefault<boolean>('circuitBreakerEnabled'),
//   circuitBreakerThreshold: getOptionalSchemaDefault<number>('circuitBreakerThreshold'),
// }

export class ConfigurationService implements IConfigurationService {
  private settings: ExtensionSettings
  private changeListeners: Array<(changes: ConfigurationChanges) => void> = []
  private previousSettings: ExtensionSettings

  constructor(private readonly section: string = 'jokalala') {
    this.settings = this.readSettings()
    this.previousSettings = { ...this.settings }
  }

  getSettings(): ExtensionSettings {
    return { ...this.settings }
  }

  getSetting<K extends keyof ExtensionSettings>(key: K): ExtensionSettings[K] {
    return this.settings[key]
  }

  validateConfiguration(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Validate each setting against schema
    for (const [key, schema] of Object.entries(CONFIGURATION_SCHEMA)) {
      const value = this.settings[key as keyof ExtensionSettings]

      // Check required fields
      if (
        schema.required &&
        (value === undefined || value === null || value === '')
      ) {
        errors.push({
          setting: key,
          message: `${key} is required but not set`,
          currentValue: value,
          expectedType: schema.type,
        })
        continue
      }

      // Skip validation for optional undefined values
      if (!schema.required && (value === undefined || value === null)) {
        continue
      }

      // Type validation
      if (!this.validateType(value, schema.type)) {
        errors.push({
          setting: key,
          message: `${key} must be of type ${schema.type}`,
          currentValue: value,
          expectedType: schema.type,
        })
        continue
      }

      // Enum validation
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({
          setting: key,
          message: `${key} must be one of: ${schema.enum.join(', ')}`,
          currentValue: value,
          allowedValues: schema.enum,
        })
        continue
      }

      // Numeric bounds validation
      if (schema.type === 'number' && typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) {
          errors.push({
            setting: key,
            message: `${key} must be at least ${schema.minimum} (current: ${value})`,
            currentValue: value,
            expectedType: schema.type,
          })
          continue
        }

        if (schema.maximum !== undefined && value > schema.maximum) {
          errors.push({
            setting: key,
            message: `${key} must be at most ${schema.maximum} (current: ${value})`,
            currentValue: value,
            expectedType: schema.type,
          })
          continue
        }
      }

      // URL validation for apiEndpoint
      if (key === 'apiEndpoint' && typeof value === 'string') {
        try {
          const url = new URL(value)
          if (url.protocol !== 'https:') {
            warnings.push({
              setting: key,
              message: 'API endpoint should use HTTPS for security',
              currentValue: value,
              suggestedValue: value.replace('http:', 'https:'),
            })
          }
        } catch (error) {
          errors.push({
            setting: key,
            message: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
            currentValue: value,
          })
        }
      }

      // Deprecated apiKey warning
      if (
        key === 'apiKey' &&
        value &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        warnings.push({
          setting: key,
          message:
            'Storing API key in settings is deprecated. Use SecretStorage instead.',
          currentValue: '[REDACTED]',
          suggestedValue: 'Move to SecretStorage',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  async migrateConfiguration(fromVersion: string): Promise<void> {
    // Migration logic for different versions
    const config = vscode.workspace.getConfiguration(this.section)

    // Example migration from version 1.x to 2.x
    if (fromVersion.startsWith('1.')) {
      // Migrate HTTP to HTTPS
      const apiEndpoint = config.get<string>('apiEndpoint')
      if (apiEndpoint && apiEndpoint.startsWith('http:')) {
        await config.update(
          'apiEndpoint',
          apiEndpoint.replace('http:', 'https:'),
          vscode.ConfigurationTarget.Global
        )
      }

      // Set new default values for new settings
      if (config.get('cacheEnabled') === undefined) {
        await config.update(
          'cacheEnabled',
          true,
          vscode.ConfigurationTarget.Global
        )
      }

      if (config.get('retryEnabled') === undefined) {
        await config.update(
          'retryEnabled',
          true,
          vscode.ConfigurationTarget.Global
        )
      }
    }

    // Refresh settings after migration
    this.refresh()
  }

  watch(callback: (changes: ConfigurationChanges) => void): vscode.Disposable {
    this.changeListeners.push(callback)

    const disposable = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.section)) {
        const newSettings = this.readSettings()
        const changes = this.calculateChanges(
          this.previousSettings,
          newSettings
        )

        this.previousSettings = { ...this.settings }
        this.settings = newSettings

        // Notify all listeners
        this.changeListeners.forEach(listener => {
          try {
            listener(changes)
          } catch (error) {
            console.error('Error in configuration change listener:', error)
          }
        })
      }
    })

    return {
      dispose: () => {
        const index = this.changeListeners.indexOf(callback)
        if (index >= 0) {
          this.changeListeners.splice(index, 1)
        }
        disposable.dispose()
      },
    }
  }

  async resetToDefaults(): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.section)

    // Reset all settings to defaults
    for (const key of Object.keys(CONFIGURATION_SCHEMA)) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global)
    }

    this.refresh()
  }

  exportConfiguration(): string {
    const exportData = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      settings: { ...this.settings },
    }

    // Redact sensitive information
    if (exportData.settings.apiKey) {
      exportData.settings.apiKey = '[REDACTED]'
    }

    return JSON.stringify(exportData, null, 2)
  }

  async importConfiguration(configJson: string): Promise<void> {
    try {
      const importData = JSON.parse(configJson)

      if (!importData.settings) {
        throw new Error('Invalid configuration format: missing settings')
      }

      const config = vscode.workspace.getConfiguration(this.section)

      // Import each setting with validation
      for (const [key, value] of Object.entries(importData.settings)) {
        if (key === 'apiKey') {
          // Skip API key import for security
          continue
        }

        if (CONFIGURATION_SCHEMA[key]) {
          await config.update(key, value, vscode.ConfigurationTarget.Global)
        }
      }

      this.refresh()
    } catch (error) {
      throw new Error(
        `Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  refresh(): ExtensionSettings {
    this.settings = this.readSettings()
    return this.settings
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'array':
        return Array.isArray(value)
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        )
      default:
        return true
    }
  }

  private calculateChanges(
    previous: ExtensionSettings,
    current: ExtensionSettings
  ): ConfigurationChanges {
    const added: Partial<ExtensionSettings> = {}
    const modified: Partial<ExtensionSettings> = {}
    const removed: string[] = []

    // Check for added and modified settings
    for (const key in current) {
      const typedKey = key as keyof ExtensionSettings
      if (!(key in previous)) {
        ;(added as any)[typedKey] = current[typedKey]
      } else if (previous[typedKey] !== current[typedKey]) {
        ;(modified as any)[typedKey] = current[typedKey]
      }
    }

    // Check for removed settings
    for (const key in previous) {
      if (!(key in current)) {
        removed.push(key)
      }
    }

    return { added, modified, removed }
  }

  private readSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(this.section)
    const settings: ExtensionSettings = {} as ExtensionSettings

    // Read each setting with proper defaults
    for (const [key, schema] of Object.entries(CONFIGURATION_SCHEMA)) {
      const typedKey = key as keyof ExtensionSettings
      const value = config.get(key, schema.default)
      // Type assertion needed because ExtensionSettings has mixed types
      ;(settings as unknown as Record<string, unknown>)[typedKey] = value
    }

    return settings
  }
}
