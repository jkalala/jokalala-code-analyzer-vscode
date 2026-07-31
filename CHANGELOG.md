## [2.4.2] - 2026-07-31

### Added
- Local deterministic Tier-1 engine (shared rule packs + JS/TS AST)
- `jokalala.analysisTier` (`local` | `hybrid` | `cloud`) and `jokalala.localPackProfile` (`precision` | `full`)
- Precision-first defaults, CWE+line dedupe, safe-sink suppressions
- esbuild single-file bundle for lower IDE footprint

### Changed
- On-save auto-analyze uses quick/local Tier-1 only ($0 infra)
- Hybrid merge keeps local findings when cloud fails
