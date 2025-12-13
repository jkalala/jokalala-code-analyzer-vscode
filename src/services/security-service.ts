/**
 * Security Service Implementation
 * Handles secure storage, HTTPS validation, and input sanitization
 */

import * as vscode from 'vscode'
import { ISecurityService } from '../interfaces'

const API_KEY_SECRET_KEY = 'jokalala.apiKey'

export class SecurityService implements ISecurityService {
  private secretStorage: vscode.SecretStorage

  constructor(context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets
  }

  /**
   * Store API key securely using VS Code's SecretStorage
   */
  async storeApiKey(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid API key: must be a non-empty string')
    }

    // Sanitize the key before storing
    const sanitizedKey = key.trim()

    if (sanitizedKey.length === 0) {
      throw new Error('Invalid API key: cannot be empty or whitespace only')
    }

    await this.secretStorage.store(API_KEY_SECRET_KEY, sanitizedKey)
  }

  /**
   * Retrieve API key from secure storage
   */
  async getApiKey(): Promise<string | undefined> {
    return await this.secretStorage.get(API_KEY_SECRET_KEY)
  }

  /**
   * Delete API key from secure storage
   */
  async deleteApiKey(): Promise<void> {
    await this.secretStorage.delete(API_KEY_SECRET_KEY)
  }

  /**
   * Validate that a URL uses HTTPS protocol
   */
  validateHttpsUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false
    }

    try {
      const parsedUrl = new URL(url)
      return parsedUrl.protocol === 'https:'
    } catch {
      return false
    }
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return ''
    }

    // Remove control characters and null bytes
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '')

    // Escape HTML special characters to prevent XSS
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')

    // Limit length to prevent DoS
    // Increased from 10KB to 200KB to support comprehensive analysis of real-world files
    // Industry standard: Most static analyzers support 200KB-1MB per file
    const MAX_INPUT_LENGTH = 200000
    if (sanitized.length > MAX_INPUT_LENGTH) {
      sanitized = sanitized.substring(0, MAX_INPUT_LENGTH)
    }

    return sanitized
  }

  /**
   * Sanitize error messages to prevent information disclosure
   */
  sanitizeErrorMessage(error: Error): string {
    if (!error) {
      return 'An unknown error occurred'
    }

    const message = error.message || error.toString()

    // Remove file paths that might contain sensitive information
    let sanitized = message.replace(/[A-Za-z]:\\[^\s]+/g, '[PATH]')
    sanitized = sanitized.replace(/\/[^\s]+/g, '[PATH]')

    // Remove potential API keys or tokens (patterns like long alphanumeric strings)
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]')

    // Remove email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL]'
    )

    // Remove IP addresses
    sanitized = sanitized.replace(
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      '[IP]'
    )

    // Remove potential passwords or secrets in error messages
    sanitized = sanitized.replace(
      /(password|secret|token|key)[\s:=]+[^\s]+/gi,
      '$1=[REDACTED]'
    )

    return sanitized
  }

  /**
   * Validate authentication token format
   * Checks for basic JWT structure (header.payload.signature)
   */
  validateToken(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }

    // Basic JWT format validation: three base64url-encoded parts separated by dots
    const parts = token.split('.')
    if (parts.length !== 3) {
      return false
    }

    // Check that each part is non-empty and contains valid base64url characters
    const base64UrlPattern = /^[A-Za-z0-9_-]+$/
    return parts.every(part => part.length > 0 && base64UrlPattern.test(part))
  }

  /**
   * Check if authentication token is expired
   * Decodes JWT payload and checks exp claim
   */
  isTokenExpired(token: string): boolean {
    if (!this.validateToken(token)) {
      return true
    }

    try {
      const parts = token.split('.')
      if (parts.length < 2) {
        return true
      }

      const payload = parts[1]
      if (!payload) {
        return true
      }

      // Decode base64url
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8')
      const decoded = JSON.parse(jsonPayload)

      // Check exp claim
      if (!decoded.exp || typeof decoded.exp !== 'number') {
        // If no expiration, consider it expired for safety
        return true
      }

      // exp is in seconds, Date.now() is in milliseconds
      const currentTime = Math.floor(Date.now() / 1000)
      return decoded.exp < currentTime
    } catch {
      // If we can't decode or parse, consider it expired
      return true
    }
  }

  /**
   * Migrate API key from workspace configuration to SecretStorage
   * This method detects if an API key exists in settings and prompts the user to migrate
   */
  async migrateApiKeyFromSettings(): Promise<boolean> {
    // Check if API key already exists in SecretStorage
    const existingKey = await this.getApiKey()
    if (existingKey) {
      // Already migrated
      return false
    }

    // Check if API key exists in workspace configuration
    const config = vscode.workspace.getConfiguration('jokalala')
    const settingsApiKey = config.get<string>('apiKey')

    if (!settingsApiKey || settingsApiKey.trim().length === 0) {
      // No API key in settings to migrate
      return false
    }

    // Prompt user to migrate
    const choice = await vscode.window.showInformationMessage(
      'For improved security, we recommend migrating your API key to secure storage. ' +
        'This will remove the API key from your settings file.',
      'Migrate Now',
      'Remind Me Later',
      'Keep in Settings'
    )

    if (choice === 'Migrate Now') {
      try {
        // Store in SecretStorage
        await this.storeApiKey(settingsApiKey)

        // Remove from settings
        await config.update(
          'apiKey',
          undefined,
          vscode.ConfigurationTarget.Global
        )
        await config.update(
          'apiKey',
          undefined,
          vscode.ConfigurationTarget.Workspace
        )

        vscode.window.showInformationMessage(
          'API key successfully migrated to secure storage and removed from settings.'
        )

        return true
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to migrate API key: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        return false
      }
    } else if (choice === 'Keep in Settings') {
      // User chose to keep in settings, don't prompt again
      // We could store a flag to not prompt again, but for now just return false
      return false
    }

    // User chose "Remind Me Later" or dismissed the dialog
    return false
  }

  /**
   * Get API key from either SecretStorage or settings (for backward compatibility)
   * Prioritizes SecretStorage over settings
   */
  async getApiKeyWithFallback(): Promise<string | undefined> {
    // First try SecretStorage
    const secretKey = await this.getApiKey()
    if (secretKey) {
      return secretKey
    }

    // Fall back to settings for backward compatibility
    const config = vscode.workspace.getConfiguration('jokalala')
    const settingsKey = config.get<string>('apiKey')

    if (settingsKey && settingsKey.trim().length > 0) {
      return settingsKey.trim()
    }

    return undefined
  }

  /**
   * Validate API endpoint URL and enforce HTTPS
   * Throws an error if the URL is not HTTPS
   */
  validateAndEnforceHttps(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid API endpoint: URL must be a non-empty string')
    }

    const trimmedUrl = url.trim()
    if (trimmedUrl.length === 0) {
      throw new Error('Invalid API endpoint: URL cannot be empty')
    }

    // Check if URL is valid
    let parsedUrl: URL
    try {
      parsedUrl = new URL(trimmedUrl)
    } catch {
      throw new Error(
        `Invalid API endpoint: "${trimmedUrl}" is not a valid URL. ` +
          'Please provide a valid HTTPS URL (e.g., https://api.example.com/analyze)'
      )
    }

    // Enforce HTTPS
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(
        `Security Error: API endpoint must use HTTPS protocol. ` +
          `Current URL uses "${parsedUrl.protocol}". ` +
          `Please update your configuration to use HTTPS (e.g., https://${parsedUrl.host}${parsedUrl.pathname})`
      )
    }
  }

  /**
   * Get a user-friendly error message for HTTPS validation failures
   */
  getHttpsValidationErrorMessage(url: string): string {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return 'API endpoint is not configured. Please set a valid HTTPS URL in settings.'
    }

    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol === 'http:') {
        return (
          `Security Warning: The API endpoint "${url}" uses HTTP instead of HTTPS. ` +
          `For security, please update to: https://${parsedUrl.host}${parsedUrl.pathname}`
        )
      }
      return `Invalid API endpoint: "${url}". Please provide a valid HTTPS URL.`
    } catch {
      return `Invalid API endpoint: "${url}" is not a valid URL. Please provide a valid HTTPS URL.`
    }
  }

  /**
   * Check if the current API endpoint configuration is secure
   * Returns validation result with details
   */
  validateApiEndpointConfiguration(): {
    valid: boolean
    secure: boolean
    message: string
  } {
    const config = vscode.workspace.getConfiguration('jokalala')
    const apiEndpoint = config.get<string>('apiEndpoint')

    if (!apiEndpoint || apiEndpoint.trim().length === 0) {
      return {
        valid: false,
        secure: false,
        message: 'API endpoint is not configured',
      }
    }

    try {
      const parsedUrl = new URL(apiEndpoint)
      const isHttps = parsedUrl.protocol === 'https:'

      return {
        valid: true,
        secure: isHttps,
        message: isHttps
          ? 'API endpoint is properly configured with HTTPS'
          : `API endpoint uses insecure ${parsedUrl.protocol} protocol. Please switch to HTTPS.`,
      }
    } catch {
      return {
        valid: false,
        secure: false,
        message: 'API endpoint is not a valid URL',
      }
    }
  }
}
