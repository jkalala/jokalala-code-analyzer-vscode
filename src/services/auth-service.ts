/**
 * AuthService
 *
 * Manages authentication between the VS Code extension and the Jokalala web app.
 *
 * Flow:
 * 1. User runs "Jokalala: Sign In" command
 * 2. Extension opens browser to https://jokalala.com/vscode-auth
 * 3. Web app authenticates user and redirects to:
 *    vscode://jokalala.code-analyzer/auth?token=<jwt>&userId=<id>
 * 4. VS Code handles the URI, extension receives token via onUri handler
 * 5. Token stored in SecretStorage — persists across restarts
 * 6. All API calls include Authorization: Bearer <token>
 */

import * as vscode from 'vscode'

const TOKEN_KEY = 'jokalala.auth.token'
const USER_ID_KEY = 'jokalala.auth.userId'
const WEB_APP_BASE = 'https://jokalala.com'

export interface AuthState {
  isAuthenticated: boolean
  token: string | null
  userId: string | null
}

export class AuthService {
  private context: vscode.ExtensionContext
  private _authState: AuthState = { isAuthenticated: false, token: null, userId: null }
  private readonly _onDidChangeAuth = new vscode.EventEmitter<AuthState>()
  readonly onDidChangeAuth = this._onDidChangeAuth.event

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  /** Load token from SecretStorage on startup */
  async initialize(): Promise<void> {
    const token = await this.context.secrets.get(TOKEN_KEY)
    const userId = await this.context.secrets.get(USER_ID_KEY)
    if (token) {
      this._authState = { isAuthenticated: true, token, userId: userId ?? null }
      this._onDidChangeAuth.fire(this._authState)
    }
  }

  get authState(): AuthState {
    return this._authState
  }

  get isAuthenticated(): boolean {
    return this._authState.isAuthenticated
  }

  get token(): string | null {
    return this._authState.token
  }

  /** Opens the browser sign-in flow */
  async signIn(): Promise<void> {
    const uri = vscode.Uri.parse(`${WEB_APP_BASE}/vscode-auth`)
    await vscode.env.openExternal(uri)
    vscode.window.showInformationMessage(
      'Opening Jokalala sign-in page. Complete authentication in your browser.'
    )
  }

  /** Called by the URI handler when VS Code receives the deep-link callback */
  async handleAuthCallback(uri: vscode.Uri): Promise<void> {
    const params = new URLSearchParams(uri.query)
    const token = params.get('token')
    const userId = params.get('userId')

    if (!token) {
      vscode.window.showErrorMessage('Authentication failed: no token received.')
      return
    }

    await this.context.secrets.store(TOKEN_KEY, token)
    if (userId) {
      await this.context.secrets.store(USER_ID_KEY, userId)
    }

    this._authState = { isAuthenticated: true, token, userId: userId ?? null }
    this._onDidChangeAuth.fire(this._authState)

    vscode.window.showInformationMessage(
      '✅ Signed in to Jokalala! Your Pro quota is now active in the extension.'
    )
  }

  /** Sign out — clear stored credentials */
  async signOut(): Promise<void> {
    await this.context.secrets.delete(TOKEN_KEY)
    await this.context.secrets.delete(USER_ID_KEY)
    this._authState = { isAuthenticated: false, token: null, userId: null }
    this._onDidChangeAuth.fire(this._authState)
    vscode.window.showInformationMessage('Signed out of Jokalala.')
  }

  /** Returns auth headers for API requests; empty object if unauthenticated */
  getAuthHeaders(): Record<string, string> {
    if (!this._authState.token) return {}
    return { Authorization: `Bearer ${this._authState.token}` }
  }

  dispose(): void {
    this._onDidChangeAuth.dispose()
  }
}
