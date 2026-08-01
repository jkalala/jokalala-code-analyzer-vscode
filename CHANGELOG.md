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
