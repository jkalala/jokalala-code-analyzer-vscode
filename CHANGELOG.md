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
