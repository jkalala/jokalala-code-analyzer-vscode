## [2.5.0] - 2026-08-04

### Added

- **Dev Chat IDE bridge.** The web app's Dev Chat "Accept" button (`vscode://jokalala.jokalala-code-analysis/apply-patch?proposalId=…`) previously opened this extension but did nothing — the URI handler only recognized `/auth`, so Accept silently no-opped for every real installed user while only working against an unreleased development build. The handler now also recognizes `apply-patch` and `hydrate`, wired to two new commands: `jokalala.applyProposal` (fetches the proposal, previews it with `vscode.diff`, and applies it via `WorkspaceEdit` only after an explicit "Apply" confirmation — never writes without that confirmation) and `jokalala.hydrateFile` (pushes a local file into the Dev Chat cloud snapshot on demand).
- **Multi-root workspace support for the IDE bridge.** Unlike the reference implementation this was backported from, `applyProposalDiff`/`hydrateWorkspaceFile` resolve the correct workspace folder instead of always assuming `workspaceFolders[0]`, prompting the user to choose when a path doesn't disambiguate.
- **Opt-in delta sync on save** (`jokalala.ideBridge.deltaSync`, default `false`) — keeps the Dev Chat cloud snapshot aligned with what's actually on disk, so `remediate_finding`/Accept see fresh content instead of a stale scan-time snapshot.
- Shared `buildAuthHeaders` helper (`services/auth-headers.ts`) — `CodeAnalysisService` and the new `IdeBridgeService` now share one auth-header implementation instead of each carrying its own copy, which is exactly the kind of duplication that caused the 2.4.4 regression (see below).

### Fixed

- **`applyHunksToContent` could silently overwrite the wrong lines** when a file changed since a diff was generated but the net line count at the hunk's claimed position happened to stay the same — the context check only compared line count, never content. Now verifies the actual text (leading/trailing-whitespace tolerant, to stay compatible with diff-builder.ts's indexOf fallback which trims indentation off some hunks) before trusting the claimed line number, falling back to a content search otherwise. Caught by the new unit test suite added alongside this backport, then re-verified against the web app's own SQLi/XSS remediation fixtures to make sure the fix didn't regress a real caller.
- **`shouldDeltaSyncDocument`'s "outside workspace" guard never actually fired** — it checked `asRelativePath(...).startsWith('..')`, but VS Code's `asRelativePath` returns the path unchanged (not `../`-prefixed) for paths outside the workspace. Replaced with `vscode.workspace.getWorkspaceFolder(uri)`.

### Not included in this release

- The reference implementation's "local verify after apply" (run an allowlisted `pnpm test`/`pnpm lint` after a patch, optionally feeding failures back to Dev Chat) was intentionally left out of this backport. It's a larger, separate security-review surface (shell command execution, even allowlisted) than the apply-patch/hydrate flow above, and is deferred to its own change.

## [2.4.5] - 2026-08-01

### Security

- **Executable plugins no longer run unconditionally.** `jokalala.plugins.enabled` used to be defined but never actually read by the plugin loader — any workspace with a `.jokalala/plugins/` directory containing an executable plugin (`manifest.main`) had that JS `require()`'d and run automatically, regardless of the setting. The setting now actually gates execution, defaults to `false`, and each plugin additionally requires a one-time "Run Plugin" confirmation before its code executes. Declarative JSON rule plugins are unaffected — they were never code, just data.
- **Plugin sandbox rewritten for real isolation.** A plugin's `activate()` now runs inside a Node `worker_thread` (see `plugin-sandbox.ts` / `plugin-worker.ts`) instead of the extension host's main thread. The 5s timeout is now enforced via `worker.terminate()`, which can actually stop a hung (`while (true)`) plugin — the previous `Promise.race`-based timeout could not preempt synchronous code. Plugins no longer receive a live reference to the rule engine or any VS Code API; rule contributions go through a validated message-passing RPC instead. This is still defense-in-depth, not a full OS sandbox — see the README's Plugin System section for the honest scope of what it does and doesn't protect against.

### Fixed

- **Project-wide scans ("Jokalala: Analyze Entire Project") now show results in the editor**, not just the Jokalala sidebar. Findings previously only populated the custom Issues tree view; the Problems panel and inline squiggles stayed empty even on a scan with real findings.
- Project scans now show a warning toast when files are skipped for exceeding `maxProjectFileSize`, instead of only logging it.
- Removed a second, divergent token-format validator (`security-service.ts`'s `validateToken`/`isTokenExpired`) that disagreed with the one actually used in the sign-in path (`auth-service.ts`) — this exact kind of drift is what caused the 2.4.4 regression. `auth-service.ts`'s `isJwtShapedToken` is now the single source of truth, and it has unit tests for the first time.

### Removed

- Deleted `offline-rules-extended.ts` (35 unreachable "extended" security rules, SEC016–050) and the unused `core/index.ts` orchestration barrel. Neither was referenced by any live code path — the rule-matching engine the extended rules depended on was already replaced by the shared rule-pack system in 2.4.2, and the barrel's `initializeCoreSystem` was never called anywhere. Their presence overstated actual detection coverage.

### Infrastructure

- `npm test` (used by CI and the release workflow) previously ran only a smoke check that `dist/extension.js` exists — the real unit test suite (`mocha`) was never invoked, and `mocha`/`c8` weren't even installed (present in `@types/mocha` only, never as real dependencies). Every prior point release since at least 2.4.2 shipped without the test suite actually running once. Fixed: `mocha` and `c8` are now real dependencies, a `compile:test` step emits runnable test JS, and `npm test` runs the full suite before packaging or publishing.
- Removed two CI steps that referenced npm scripts that didn't exist (`lint`, `test:vscode`) and were failing/no-op on every run.
- `check:vsix-size` (1.4MB budget) is now actually wired into CI and the release workflow, not just runnable manually.

## [2.4.4] - 2026-07-31

### Fixed
- Sign-in now stores a persistent `jkl_…` API key instead of the 15-minute web session token, fixing sessions expiring ~15 minutes after **Jokalala: Sign In**
- Auth callback token-format check now accepts `jkl_…` keys (previously only accepted 3-segment JWTs, rejecting the new key with "unexpected format")

## [2.4.3] - 2026-07-31

### Added
- `Jokalala: Set API Key` / `Jokalala: Clear API Key` commands, storing the key in VS Code SecretStorage (the setting's deprecation notice referenced this command, but it never existed)
- One-time prompt to migrate an existing plaintext `jokalala.apiKey` setting into SecretStorage

### Fixed
- Project / cloud analysis now sends the Sign-In JWT (not only a settings API key), fixing 401 after **Jokalala: Sign In**
- API key fallback (used when not signed in) now checks SecretStorage before the plaintext setting, so keys saved via `Jokalala: Set API Key` are actually honored

## [2.4.2] - 2026-07-31

### Added
- Local deterministic Tier-1 engine (shared rule packs + JS/TS AST)
- `jokalala.analysisTier` (`local` | `hybrid` | `cloud`) and `jokalala.localPackProfile` (`precision` | `full`)
- Precision-first defaults, CWE+line dedupe, safe-sink suppressions
- esbuild single-file bundle for lower IDE footprint

### Changed
- On-save auto-analyze uses quick/local Tier-1 only ($0 infra)
- Hybrid merge keeps local findings when cloud fails
