# Release Notes — Jokalala Code Analyzer v2.4.0

**Release Date:** 25 June 2026  
**Type:** Security Hardening Release  
**Severity of Breaking Changes:** Low — two default values changed; existing configurations are unaffected  
**VS Code Minimum Version:** 1.85.0  
**Distribution:** [jokalala-code-analyzer-vscode](https://github.com/jkalala/jokalala-code-analyzer-vscode) · VS Code Marketplace

---

## Executive Summary

Version 2.4.0 is a focused security hardening release responding to a professional audit of the extension codebase. Six critical vulnerabilities have been remediated, three enterprise-grade security features have been introduced, and test coverage has been expanded from approximately 10% to a significantly higher baseline with 121 new security-focused test cases.

No features have been removed. All changes are backwards-compatible with existing user configurations.

---

## Security Advisories Resolved

### CVE-CLASS-001 — Unvalidated HTTPS for outbound API calls (HIGH)

**Affected versions:** All prior versions  
**Component:** `code-analysis-service.ts`, `user-feedback-service.ts`, `submit-feedback.ts`

All outbound API calls were constructed via string template literals with no protocol validation. An attacker who could influence the `jokalala.apiEndpoint` or `jokalala.feedbackApiUrl` settings (for example, through workspace `.vscode/settings.json` in a shared repository) could redirect code snippets and analysis results to an arbitrary HTTP endpoint, including one they control.

**Resolution:** A centralised `url-validator` module (`src/utils/url-validator.ts`) now validates every endpoint before network access. HTTP is permitted only for `localhost`/`127.0.0.1` development targets; all other endpoints must use HTTPS. Validation errors surface as informative messages rather than silent failures.

---

### CVE-CLASS-002 — Plugin path traversal allowing module escape (HIGH)

**Affected versions:** All prior versions  
**Component:** `plugin-manager.ts`

The plugin loader called `require(path.join(pluginPath, manifest.main))` without verifying that the resolved path remained within the plugin directory. A malicious plugin manifest containing `"main": "../../node_modules/evil"` would cause the extension to load an arbitrary module from outside the plugin's own directory.

**Resolution:** Both `path.resolve()` outputs are compared before `require()` is invoked. Any `manifest.main` value that resolves outside `pluginPath` causes the plugin to be rejected with an audit event and a `PluginSecurityError`.

---

### CVE-CLASS-003 — Authentication deep-link token injection (HIGH)

**Affected versions:** All prior versions  
**Component:** `auth-service.ts`

The OAuth2 deep-link URI handler (`vscode://jokalala.code-analysis/auth?token=...`) stored any string value from the `token` query parameter into VS Code's SecretStorage without format validation. A crafted `vscode://` URI could inject arbitrary content into the secure credential store.

**Resolution:** The token is validated as a structurally correct JWT (three dot-separated Base64url segments) before storage. The `userId` parameter is validated against an alphanumeric allowlist (`/^[a-zA-Z0-9_-]{1,128}$/`). Inputs that fail validation are rejected with a user-visible error and an audit event; no data is stored.

---

### CVE-CLASS-004 — Feedback URL accepting arbitrary HTTP endpoints (MEDIUM)

**Affected versions:** All prior versions  
**Component:** `user-feedback-service.ts`

The `jokalala.feedbackApiUrl` configuration value was passed directly to `fetch()` without validation. Code snippets and accuracy metrics could be silently transmitted to any URL, including plain HTTP endpoints or attacker-controlled servers.

**Resolution:** The URL is validated with `validateApiUrl()` before `sendToBackend()` is called. Invalid or insecure URLs are logged with a clear reason; no data is transmitted.

---

### CVE-CLASS-005 — Submit-feedback URL concatenation without validation (MEDIUM)

**Affected versions:** All prior versions  
**Component:** `commands/submit-feedback.ts`

Feedback submissions constructed the target URL as `` `${apiEndpoint}/analysis-feedback` `` without validating the base URL. Additionally, `options.location.file` contained the absolute filesystem path of the open file (e.g., `/home/user/secret-project/src/auth.ts`), which was transmitted in the feedback payload.

**Resolution:** The URL is built through `assertHttpsUrl()` + `safeJoinUrl()`, which validate the base URL and prevent path-segment injection. `location.file` is now anonymised to `path.basename(file)` only — absolute paths are never transmitted.

---

### CVE-CLASS-006 — Default API endpoint pointed to local development server (MEDIUM)

**Affected versions:** All prior versions  
**Component:** `configuration-service.ts`, `package.json`

The default value for `jokalala.apiEndpoint` was `http://localhost:3000/api/agents/dev-assistant`. Users who accepted the defaults without reading the documentation were silently connecting to a non-existent local server, receiving unhelpful errors, and potentially falling back to plain HTTP if they self-hosted without reading the HTTPS guidance.

**Resolution:** Default changed to `https://jokalala.com/api/agents/dev-assistant`. HTTP endpoints for non-localhost origins are now treated as configuration errors (not warnings), blocking analysis until corrected.

---

## New Features

### Compliance Audit Trail

**Module:** `src/services/audit-service.ts`

An immutable, append-only audit log is now written to `globalStorageUri/audit.jsonl` for every security-relevant action the extension performs.

**Design properties:**
- **Tamper-evident chain hashing:** Each log entry includes a SHA-256 hash computed over the previous entry's hash, the sequence number, the timestamp, the event type, and the sanitised details. Modifying any historical entry breaks all subsequent chain hashes, which SIEM tools can detect automatically.
- **PII-free by design:** User identifiers are hashed (SHA-256, first 16 hex characters) before storage. Raw code, tokens, and API keys are never written to the log — the detail sanitiser redacts keys matching a blocklist and truncates values longer than 512 characters.
- **20 event types** covering authentication lifecycle, analysis requests and outcomes, plugin lifecycle events, configuration changes, and security enforcement blocks.
- **SIEM-compatible output:** JSONL format, one event per line, directly ingestible by Splunk, Elasticsearch, Datadog, and other standard SIEM pipelines.
- **Export command:** `Jokalala: Export Audit Log` copies the log to a user-chosen location.

**Audit events recorded:**

| Category | Events |
|---|---|
| Authentication | `AUTH_SIGN_IN_INITIATED`, `AUTH_SIGN_IN_SUCCESS`, `AUTH_SIGN_IN_FAILED`, `AUTH_SIGN_OUT`, `AUTH_TOKEN_INVALID_FORMAT` |
| Analysis | `ANALYSIS_REQUESTED`, `ANALYSIS_COMPLETED`, `ANALYSIS_FAILED`, `ANALYSIS_CANCELLED`, `ANALYSIS_SECRETS_DETECTED`, `ANALYSIS_CONSENT_DENIED` |
| Plugins | `PLUGIN_LOADED`, `PLUGIN_BLOCKED_PATH_TRAVERSAL`, `PLUGIN_BLOCKED_INTEGRITY`, `PLUGIN_INTEGRITY_CHANGED`, `PLUGIN_ERROR`, `PLUGIN_DISABLED` |
| Configuration | `SETTING_CHANGED`, `ENDPOINT_VALIDATION_FAILED` |
| Security | `HTTPS_ENFORCEMENT_BLOCKED`, `FEEDBACK_URL_BLOCKED` |

---

### Secrets Pre-Transmission Screening

**Module:** `src/utils/secrets-prescreener.ts`

Before any code is transmitted to the Jokalala API, it is now scanned for 12 categories of hardcoded credential patterns. If a potential secret is found, the user is shown a modal consent dialog listing the finding types and severities. Analysis is blocked until the user explicitly clicks **"Send Anyway"** or dismisses the dialog.

**Patterns screened:**

| Pattern | Severity |
|---|---|
| Private key blocks (RSA, EC, OpenSSH) | Critical |
| AWS Access Key IDs (`AKIA...`) | Critical |
| AWS Secret Access Keys | Critical |
| GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghr_`) | Critical |
| GitLab PATs (`glpat-`) | Critical |
| Database connection strings with credentials | Critical |
| JSON Web Tokens (inline JWTs) | Critical |
| Stripe secret keys (`sk_live_`, `sk_test_`) | Critical |
| Bearer token / API key assignments | High |
| Password literal assignments | High |
| Twilio auth tokens | High |

**Design note:** Finding snippets displayed in the consent dialog are redacted — only the first eight characters of the matching line are shown, with the remainder replaced by asterisks. The actual secret value is never surfaced in the UI or written to any log.

---

### Plugin Sandbox with Timeout Enforcement

**Module:** `src/services/plugin-sandbox.ts`

Plugin `activate()` functions now execute inside a controlled environment that provides defence-in-depth beyond the path-traversal and integrity checks.

**Controls enforced:**
- **Hard 5-second timeout:** If `activate()` does not complete within 5 seconds, a `Promise.race()` cancels the activation and records a failure. The plugin is marked as errored and the extension continues normally.
- **Restricted `PluginContext`:** The context provided to plugins exposes `globalState` and `workspaceState` as **read-only proxies** — `update()` is intercepted and silently discarded. VS Code's `SecretStorage` is not exposed at all.
- **Captured log output:** All `ctx.logger.*` calls are intercepted, stored, and forwarded to the extension's output channel after activation completes. Plugins cannot write directly to VS Code's output.
- **Structured error capture:** All synchronous throws and async rejections are caught, normalised through the typed error hierarchy, and recorded in the audit log without crashing the extension.

**Limitation (acknowledged):** Node.js `vm.createContext` is not a complete security boundary; it does not prevent all module-level escapes. The sandbox is one layer in a defence-in-depth stack alongside path-traversal prevention, integrity verification, and restricted context exposure.

---

### Plugin Integrity Verification

**Module:** `src/services/plugin-manager.ts`

A SHA-256 hash of all files in a plugin directory is computed on first load and stored as a trusted baseline in VS Code's `globalState`. Every subsequent load compares the computed hash against the stored baseline.

If any file in the plugin directory has changed since the baseline was recorded, the plugin is blocked with a `PluginSecurityError` and a `PLUGIN_INTEGRITY_CHANGED` audit event is emitted. The developer must manually review the changes and clear the baseline to re-enable the plugin.

This control detects supply-chain attacks in which a legitimate plugin directory is replaced or modified after initial installation.

---

### Typed Error Hierarchy

**Module:** `src/utils/typed-errors.ts`

A structured error hierarchy replaces the `catch (error: any)` pattern that appeared in 47 locations across the codebase. Typed errors enable predictable handling, correct audit categorisation, and clean TypeScript narrowing without unsafe casts.

```
AppError (base)
├── NetworkError      — HTTP and connection failures (statusCode stored)
├── ValidationError   — Schema and format failures (field name stored)
├── AuthError         — Authentication and authorisation failures
├── PluginSecurityError — Plugin security constraint violations (pluginId stored)
├── SecurityError     — URL validation and HTTPS enforcement failures
└── CancellationError — User-cancelled operations
```

Helper functions `isError()`, `getErrorMessage()`, `getErrorStack()`, and `normaliseError()` provide safe handling of any `unknown` thrown value.

---

## Breaking Changes

### Default `apiEndpoint` value

| | Before | After |
|---|---|---|
| Default value | `http://localhost:3000/api/agents/dev-assistant` | `https://jokalala.com/api/agents/dev-assistant` |
| HTTP (non-localhost) | Warning shown, analysis proceeds | **Error — analysis blocked** |

**Impact:** Users who have explicitly set `jokalala.apiEndpoint` in their settings are unaffected. Users relying on the default who self-host over HTTP must update their endpoint to HTTPS.

### Default `enableTelemetry` value

| | Before | After |
|---|---|---|
| Default value | `true` (opt-out) | `false` (opt-in) |

**Impact:** Telemetry is disabled on new installs and for users who have not explicitly set this value. Users who want to contribute anonymous diagnostic data must set `"jokalala.enableTelemetry": true`.

---

## Quality Improvements

### Test Coverage — Security Utilities

Five new test suites add 121 test cases focused exclusively on security-critical code paths:

| Test file | Cases | Coverage area |
|---|---|---|
| `url-validator.test.ts` | 25 | HTTPS enforcement, safeJoinUrl, path-segment injection, credentials-in-URL |
| `typed-errors.test.ts` | 30 | All error subclasses, normaliseError, type guards, Axios error detection |
| `secrets-prescreener.test.ts` | 24 | All 12 secret patterns, redaction verification, multi-secret detection |
| `audit-service.test.ts` | 26 | Chain hash integrity, tamper detection, detail sanitisation, userId hashing |
| `plugin-sandbox.test.ts` | 16 | Timeout enforcement, read-only context, log capture, error handling |

**Redaction verification test (notable):** The secrets-prescreener suite explicitly asserts that no finding's `snippet` field contains the raw secret value, ensuring the redaction logic is tested independently of the detection logic.

### Debug Log Purge

Fourteen `[DEBUG]` log statements were removed from `code-analysis-service.ts`. These statements logged full request URLs, Axios configuration objects, error responses including status codes, and connection parameters to VS Code's output channels — information that could assist an attacker performing reconnaissance on a developer's environment.

---

## Upgrade Guide

### From v2.3.x

1. Install `jokalala-code-analysis-2.4.0.vsix` via **Extensions → Install from VSIX**.
2. Existing settings are preserved. No configuration migration is required.
3. If you use a self-hosted backend over HTTP, update `jokalala.apiEndpoint` to an HTTPS URL before the next analysis — the extension will show a configuration error on startup if HTTP is detected.
4. If you previously relied on default telemetry opt-out, add `"jokalala.enableTelemetry": true` to your settings explicitly.
5. On first activation, the audit log is initialised at `<globalStoragePath>/audit.jsonl`. No action required.

### From v2.2.x or earlier

Follow the steps above and additionally review the [v2.3.0 changelog](CHANGELOG.md) for plugin system and SCA changes introduced in that release.

---

## Known Issues

| Issue | Workaround |
|---|---|
| Plugin sandbox does not prevent all Node.js module-level escapes | Mitigated by integrity verification and path-traversal prevention |
| Audit log is not automatically rotated (grows indefinitely) | Use `Jokalala: Export Audit Log` and clear the file manually for long sessions |
| `enableTelemetry` default change may surprise users who relied on opt-out | Set `"jokalala.enableTelemetry": true` explicitly if desired |

---

## SHA-256 Checksums

```
jokalala-code-analysis-2.4.0.vsix
```

*Compute with:*
```bash
# Linux / macOS
shasum -a 256 jokalala-code-analysis-2.4.0.vsix

# Windows (PowerShell)
Get-FileHash jokalala-code-analysis-2.4.0.vsix -Algorithm SHA256
```

*Verify the computed hash matches the value published in the [GitHub release](https://github.com/jkalala/jokalala-code-analyzer-vscode/releases/tag/v2.4.0) before installation in security-sensitive environments.*

---

## Acknowledgements

Security audit and remediation performed by the Jokalala engineering team with automated assistance from Claude (Anthropic). All changes reviewed and validated through TypeScript strict-mode compilation and the expanded test suite.

---

## Resources

| Resource | URL |
|---|---|
| Repository | https://github.com/jkalala/jokalala-code-analyzer-vscode |
| VS Code Marketplace | https://marketplace.visualstudio.com/items?itemName=jokalala.jokalala-code-analysis |
| Security reporting | security@jokalala.com |
| Full changelog | [CHANGELOG.md](CHANGELOG.md) |
| Previous release (v2.3.1) | [RELEASE_NOTES_2.3.1](https://github.com/jkalala/jokalala-code-analyzer-vscode/releases) |

---

*Jokalala Code Analyzer is MIT licensed. See [LICENSE](LICENSE) for terms.*
