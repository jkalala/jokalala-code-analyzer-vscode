# Local Deterministic Tier-1 Engine

## Architecture

```
IDE save / analyze
  → Tier 1 LocalDeterministicEngine (bundled JSON packs + JS/TS AST)
       → instant findings, $0 infra
  → Tier 2 Cloud Stage-1 (hybrid / deep / full / project)
       → EnhancedStaticCodeAnalyzer v2, same pack IDs
  → Tier 3 Cloud Stage-2 LLM/CVE (deferred — Deep Audit later)
```

## Shared packs

Source of truth: `packages/analyzer-rule-packs/`

| Pack | Role |
|------|------|
| `jokalala.secrets@1.0.0` | Hardcoded secrets |
| `jokalala.patterns@1.6.0` | Semgrep-lite surface patterns |
| `jokalala.javascript@1.0.0` | JS/TS XSS / injection / AST visitors |

Cloud Stage-1 loads the same JSON via `getBuiltinPacksDir()` (prefers the shared package path). Responses stamp `metadata.rulePackVersions` for parity.

## VS Code settings

| Setting | Values | Default |
|---------|--------|---------|
| `jokalala.analysisTier` | `local` \| `hybrid` \| `cloud` | `hybrid` |
| `jokalala.analysisMode` | `quick` \| `deep` \| `full` | `full` |
| `jokalala.localPackProfile` | `precision` \| `full` | `precision` |

Mapping:

- **quick** → always **local** Tier-1 (on-save auto-analyze uses quick)
- **precision** packs → secrets + JS/TS high-signal rules (low noise)
- **full** packs → also loads Semgrep-lite `jokalala.patterns`
- **deep / full** → respect `analysisTier` (hybrid merges local + cloud, dedupe by CWE+line)
- **Network down** → same Tier-1 engine (no quality cliff)
- **Zero-noise** → skip AST rules if parse fails; suppress known-safe sinks (DOMPurify, `shell:false`, …)

Finding metadata includes `source: 'local-pack' | 'cloud'`, `packId`, `packVersion`, `engineTier: 1|2`.

## When cloud runs

- Explicit Analyze File/Project with hybrid or cloud tier
- deep/full modes when tier is hybrid/cloud
- Not on default on-save (local-only)

## Bundle budget

Extension is **esbuild-bundled** (single `dist/extension.js` with packs + Babel). Host loads one JS file instead of 400+ modules. CI checks VSIX size via `scripts/check-vsix-size.js` (default **1.4MB** ceiling).

## Parity tests

```bash
cd packages/analyzer-rule-packs
pnpm run compile && pnpm run test:parity
```
