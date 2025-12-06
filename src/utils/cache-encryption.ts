/**
 * Cache Encryption Utility
 * Provides encryption/decryption for sensitive cached data using AES-256-GCM
 *
 * Security Features:
 * - Uses AES-256-GCM for authenticated encryption
 * - Generates unique IV for each encryption operation
 * - Uses machine-specific key derivation for key isolation
 * - Provides data integrity verification via GCM authentication tag
 */

import * as crypto from 'crypto'
import * as vscode from 'vscode'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32 // 256 bits

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  iv: string // Base64 encoded IV
  data: string // Base64 encoded encrypted data
  tag: string // Base64 encoded authentication tag
  version: number // Encryption version for future upgrades
}

/**
 * Cache encryption service
 * Encrypts sensitive data before storing in cache
 */
export class CacheEncryption {
  private key: Buffer | null = null
  private initialized = false

  /**
   * Initialize the encryption service with a machine-specific key
   * Derives key from VS Code machine ID for machine isolation
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Use VS Code machine ID as base for key derivation
      // This ensures cached data is only readable on the same machine
      const machineId = vscode.env.machineId

      // Derive a 256-bit key using PBKDF2
      this.key = crypto.pbkdf2Sync(
        machineId,
        'jokalala-cache-salt-v1', // Static salt (machine-specific via machineId)
        100000, // Iterations
        KEY_LENGTH,
        'sha256'
      )

      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize cache encryption:', error)
      throw new Error('Cache encryption initialization failed')
    }
  }

  /**
   * Encrypt data for secure storage
   * @param data The data to encrypt (will be JSON serialized)
   * @returns Encrypted data structure or null if encryption fails
   */
  encrypt<T>(data: T): EncryptedData | null {
    if (!this.initialized || !this.key) {
      console.warn('Cache encryption not initialized, storing unencrypted')
      return null
    }

    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(IV_LENGTH)

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })

      // Encrypt the data
      const jsonData = JSON.stringify(data)
      const encrypted = Buffer.concat([
        cipher.update(jsonData, 'utf8'),
        cipher.final(),
      ])

      // Get authentication tag
      const authTag = cipher.getAuthTag()

      return {
        iv: iv.toString('base64'),
        data: encrypted.toString('base64'),
        tag: authTag.toString('base64'),
        version: 1,
      }
    } catch (error) {
      console.error('Encryption failed:', error)
      return null
    }
  }

  /**
   * Decrypt data from secure storage
   * @param encryptedData The encrypted data structure
   * @returns Decrypted data or null if decryption fails
   */
  decrypt<T>(encryptedData: EncryptedData): T | null {
    if (!this.initialized || !this.key) {
      console.warn('Cache encryption not initialized')
      return null
    }

    try {
      // Validate version
      if (encryptedData.version !== 1) {
        console.warn(
          `Unsupported encryption version: ${encryptedData.version}`
        )
        return null
      }

      // Decode from base64
      const iv = Buffer.from(encryptedData.iv, 'base64')
      const encrypted = Buffer.from(encryptedData.data, 'base64')
      const authTag = Buffer.from(encryptedData.tag, 'base64')

      // Validate lengths
      if (iv.length !== IV_LENGTH) {
        console.warn('Invalid IV length')
        return null
      }

      if (authTag.length !== AUTH_TAG_LENGTH) {
        console.warn('Invalid auth tag length')
        return null
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })

      // Set auth tag for verification
      decipher.setAuthTag(authTag)

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ])

      // Parse JSON
      return JSON.parse(decrypted.toString('utf8')) as T
    } catch (error) {
      // This could be:
      // - Authentication failure (tampered data)
      // - Key mismatch (different machine)
      // - Corrupted data
      console.error('Decryption failed:', error)
      return null
    }
  }

  /**
   * Check if data is encrypted
   */
  isEncrypted(data: unknown): data is EncryptedData {
    if (typeof data !== 'object' || data === null) {
      return false
    }

    const encrypted = data as EncryptedData
    return (
      typeof encrypted.iv === 'string' &&
      typeof encrypted.data === 'string' &&
      typeof encrypted.tag === 'string' &&
      typeof encrypted.version === 'number'
    )
  }

  /**
   * Clear encryption key from memory
   * Should be called on extension deactivation
   */
  dispose(): void {
    if (this.key) {
      // Overwrite key in memory before clearing
      this.key.fill(0)
      this.key = null
    }
    this.initialized = false
  }
}

// Singleton instance
export const cacheEncryption = new CacheEncryption()
