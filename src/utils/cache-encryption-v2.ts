/**
 * Cache Encryption V2 with HMAC integrity verification
 */

import * as crypto from 'crypto'
import * as vscode from 'vscode'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const SALT_LENGTH = 32
const KEY_VERSION = 2

export interface EncryptedDataV2 {
  iv: string
  data: string
  tag: string
  hmac: string
  version: number
  timestamp: number
}

export class CacheEncryptionV2 {
  private encryptionKey: Buffer | null = null
  private hmacKey: Buffer | null = null
  private initialized = false
  private context: vscode.ExtensionContext | null = null

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) return
    this.context = context

    const keyMaterial = await this.getOrCreateKeyMaterial()
    const machineId = vscode.env.machineId
    const salt = Buffer.from(keyMaterial.salt, 'base64')

    this.encryptionKey = crypto.pbkdf2Sync(machineId, salt, 100000, KEY_LENGTH, 'sha256')
    this.hmacKey = crypto.pbkdf2Sync(
      machineId,
      Buffer.concat([salt, Buffer.from('hmac')]),
      100000,
      KEY_LENGTH,
      'sha256'
    )
    this.initialized = true
  }

  private async getOrCreateKeyMaterial() {
    const KEY = 'jokalala.cache.keyMaterial'
    const stored = await this.context!.secrets.get(KEY)

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.version === KEY_VERSION) return parsed
      } catch {
        // Invalid stored data, create new
      }
    }

    const material = {
      salt: crypto.randomBytes(SALT_LENGTH).toString('base64'),
      version: KEY_VERSION,
      createdAt: Date.now(),
    }
    await this.context!.secrets.store(KEY, JSON.stringify(material))
    return material
  }

  encrypt<T>(data: T): EncryptedDataV2 | null {
    if (!this.initialized || !this.encryptionKey || !this.hmacKey) return null

    try {
      const iv = crypto.randomBytes(IV_LENGTH)
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })

      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final(),
      ])
      const authTag = cipher.getAuthTag()
      const timestamp = Date.now()

      const hmac = crypto
        .createHmac('sha256', this.hmacKey)
        .update(Buffer.concat([iv, encrypted, authTag, Buffer.from(timestamp.toString())]))
        .digest()

      return {
        iv: iv.toString('base64'),
        data: encrypted.toString('base64'),
        tag: authTag.toString('base64'),
        hmac: hmac.toString('base64'),
        version: KEY_VERSION,
        timestamp,
      }
    } catch {
      return null
    }
  }

  decrypt<T>(enc: EncryptedDataV2): T | null {
    if (!this.initialized || !this.encryptionKey || !this.hmacKey) return null
    if (enc.version !== KEY_VERSION) return null

    try {
      const iv = Buffer.from(enc.iv, 'base64')
      const encrypted = Buffer.from(enc.data, 'base64')
      const authTag = Buffer.from(enc.tag, 'base64')
      const storedHmac = Buffer.from(enc.hmac, 'base64')

      // Verify HMAC FIRST - before attempting decryption
      const computedHmac = crypto
        .createHmac('sha256', this.hmacKey)
        .update(Buffer.concat([iv, encrypted, authTag, Buffer.from(enc.timestamp.toString())]))
        .digest()

      if (!crypto.timingSafeEqual(storedHmac, computedHmac)) {
        console.warn('HMAC verification failed - data may be tampered')
        return null
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })
      decipher.setAuthTag(authTag)

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
      return JSON.parse(decrypted.toString('utf8'))
    } catch {
      return null
    }
  }

  isEncryptedV2(data: unknown): data is EncryptedDataV2 {
    if (typeof data !== 'object' || !data) return false
    const d = data as EncryptedDataV2
    return d.version === KEY_VERSION && typeof d.hmac === 'string'
  }

  async rotateKeys(): Promise<void> {
    this.dispose()
    await this.context!.secrets.delete('jokalala.cache.keyMaterial')
    await this.initialize(this.context!)
  }

  dispose(): void {
    this.encryptionKey?.fill(0)
    this.hmacKey?.fill(0)
    this.encryptionKey = null
    this.hmacKey = null
    this.initialized = false
  }
}

export const cacheEncryptionV2 = new CacheEncryptionV2()