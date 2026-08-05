/**
 * Shared auth-header builder for authenticated calls to the Jokalala API.
 *
 * Single source of truth for "how does the extension authenticate a request":
 * prefer the Sign-In JWT from AuthService, fall back to an API key (jkl_…)
 * from SecurityService (SecretStorage) or the deprecated plaintext setting.
 *
 * Extracted from CodeAnalysisService.buildAuthHeaders so IdeBridgeService
 * (and any future caller) shares the exact same logic instead of each
 * maintaining its own divergent copy — that kind of duplication is what
 * caused the 2.4.4 auth regression (see CHANGELOG 2.4.5).
 */

import { AuthService } from './auth-service'
import { SecurityService } from './security-service'

export async function buildAuthHeaders(
  authService: AuthService | undefined,
  securityService: SecurityService | undefined,
  settingsApiKey?: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const fromAuth = authService?.getAuthHeaders()
  if (fromAuth?.Authorization) {
    Object.assign(headers, fromAuth)
    return headers
  }
  const apiKey =
    (await securityService?.getApiKeyWithFallback()) ?? settingsApiKey?.trim()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}
