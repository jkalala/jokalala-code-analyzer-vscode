/**
 * Security Service Interface
 * Handles secure storage, HTTPS validation, and input sanitization
 */

export interface ISecurityService {
  /**
   * Store API key securely using VS Code's SecretStorage
   * @param key The API key to store
   */
  storeApiKey(key: string): Promise<void>

  /**
   * Retrieve API key from secure storage
   * @returns The stored API key or undefined if not found
   */
  getApiKey(): Promise<string | undefined>

  /**
   * Delete API key from secure storage
   */
  deleteApiKey(): Promise<void>

  /**
   * Validate that a URL uses HTTPS protocol
   * @param url The URL to validate
   * @returns True if URL uses HTTPS, false otherwise
   */
  validateHttpsUrl(url: string): boolean

  /**
   * Sanitize user input to prevent injection attacks
   * @param input The input string to sanitize
   * @returns Sanitized input string
   */
  sanitizeInput(input: string): string

  /**
   * Sanitize error messages to prevent information disclosure
   * @param error The error to sanitize
   * @returns Sanitized error message
   */
  sanitizeErrorMessage(error: Error): string

  /**
   * Validate authentication token format
   * @param token The token to validate
   * @returns True if token is valid format
   */
  validateToken(token: string): boolean

  /**
   * Check if authentication token is expired
   * @param token The token to check
   * @returns True if token is expired
   */
  isTokenExpired(token: string): boolean
}
