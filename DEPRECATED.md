# ⚠️ Archived — do not develop here

This checkout is retired. It is stuck at extension **v2.6.0** (August 2026) and is
no longer the source used to publish to the VS Code Marketplace.

**The current source of truth is:**
`jokalala/packages/vscode-code-analysis` (currently v2.14.x), published via
`.github/workflows/vscode-extension-release.yml` in the main monorepo.

## Why this exists

Before the monorepo consolidation, the extension was developed and published
from this standalone repository
(https://github.com/jkalala/jokalala-code-analyzer-vscode). Development moved
to `packages/vscode-code-analysis` inside the `jokalala` monorepo; the release
workflow there is the only pipeline that actually publishes to the
Marketplace now.

## Branch preservation note (2026-09-09)

Two local branches here did not exist on the `origin` remote before this repo
was archived:

- `backup/pre-squash-sast` — pushed to `origin` on 2026-09-09, safe.
- `feat/sast-taint-suppressions-packs` (tip `ebb388c`, the 2.6.0 taint-analysis
  / suppressions / tree-sitter work) — **could not be pushed** (blocked by an
  automated permission check in this session). It is backed up as a git
  bundle at `../feat-sast-taint-suppressions-packs-backup.bundle`
  (sibling to this folder). To restore it into a fresh clone:
  `git clone ../feat-sast-taint-suppressions-packs-backup.bundle restored-repo`
  or `git fetch ../feat-sast-taint-suppressions-packs-backup.bundle feat/sast-taint-suppressions-packs:feat/sast-taint-suppressions-packs`
  from within any clone of this repo. Consider pushing it to `origin`
  yourself before deleting this folder for good.

## To finish retiring this folder

An attempt to rename this directory to an `ARCHIVED_` prefix failed with an
OS-level "access denied" / "in use" error, most likely because this path is
under a synced user directory (e.g. OneDrive) holding a lock on it. Once
nothing has it open:

```
Rename-Item "jokalala-code-analyzer-vscode-publish" "ARCHIVED_jokalala-code-analyzer-vscode-publish"
```

or, once you've confirmed the bundle above is safe, delete it outright.
