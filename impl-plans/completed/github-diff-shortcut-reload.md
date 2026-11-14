# GitHub Diff Shortcut and Reload

**Status**: Completed
**Design Reference**: ../../design-docs/specs/design-file-viewer-mode.md#github-diff-startup-and-reload
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables

| Task | Files / deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | CLI GitHub shorthand and diff URL normalization, Rust regression tests, help | Completed | Design; Rust agent |
| 2 | Diff reload integration through workspace header and existing configurable document.reload action, frontend tests | Completed | Existing IPC; TS agent |
| 3 | README, independent mixed checks, debug build/launch | Completed | Tasks 1 and 2; root/checker |

## Requirements

- [x] Existing PR/files/commit/compare URLs remain supported; standard .diff URLs normalize correctly.
- [x] `chilla github:owner/repo PR_ID` opens the same read-only GitHub PR target; invalid shorthand is rejected clearly.
- [x] Cache-disabling flags and verbose remain usable with shorthand.
- [x] GitHub changed files remain a navigable Tree by default.
- [x] Header reload and configured document.reload (default r) fetch fresh diff data, bypassing cached snapshot reuse.
- [x] Reload preserves valid selection/tree context, safely resets stale lazy content, and rejects stale overlapping results.
- [x] Failed reload reports dismissible error, keeps recoverable prior content, and permits retry.
- [x] Tests, typechecks, app-scoped lint and debug launch verified; unrelated work preserved.

## Progress Log

### 2026-09-09
Existing GitHub fetching and Tree UI confirmed. Implement missing shorthand,
.diff URL normalization and user-triggered refresh using existing target/cache IPC.

Implementation completed with strict shorthand validation and .diff/.patch
canonicalization. CLI/GitHub unit tests extracted to keep touched Rust modules
below 1000 lines. No IPC or dependency changes. Header and configured reload
use the active diff callback, clone GitHub target with use_cache:false, retain
surviving browsing state, and guard snapshot/lazy reads by generation. Lazy reads
are deferred while reloading; keyed target changes dispose obsolete callbacks.

Independent checks passed: TS/Cargo check, Rust fmt/Clippy, app Biome (79 files),
Bun (39 tests), Rust (194 unit + 1 integration), DOM (283 tests / 22 files).
Scoped lint excludes unrelated pubpage formatting; no remaining review findings.
Debug app bundle built with `CARGO_TERM_QUIET=true bun run tauri build --debug --bundles app`.
Build log: /tmp/chilla-github-build.log. Launched
`target/debug/chilla --verbose github:tacogips/chilla 13`, log:
/tmp/chilla-github-launch.log, and opened the debug app bundle with the same
shorthand. Public API read confirmed PR 13 and six changed files. CLI help
confirmed the new syntax. Computer Use still resolved an existing file-open
sheet; left user state untouched and do not claim visible GitHub UI verification.
README documents startup/reload and transport-suffix escaping. No commit/push.
