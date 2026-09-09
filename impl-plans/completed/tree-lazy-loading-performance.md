# Tree Lazy Loading Performance Implementation Plan

**Status**: Completed
**Design Reference**: [Left Pane Tree View](../../design-docs/specs/design-file-viewer-mode.md#left-pane-tree-view)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Findings and Scope

Filesystem listing already reads one directory level. Tree switching discards
cache and rereads the loaded root; refresh reloads retained hidden expansions.
The list_directory Tauri command runs synchronously. Switching back to List can
search all pages for a selected nested file. Fix these sources of redundant work
and keep immediate-child loading explicit and regression-tested.

## Tasks and Deliverables

| Task | Deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | `directory-tree.ts`, `FileBrowserPane.tsx`, `WorkspaceShell.tsx`: compatible root seed, cache retention, visible-only refresh, safe List return, tests | Completed | None; parallelizable |
| 2 | `src-tauri/src/commands/document.rs`: async directory command using spawn_blocking; unchanged IPC; regression for immediate children | Completed | None; parallelizable |
| 3 | Independent mixed-stack verification, README update, debug rebuild and launch | Completed | 1 and 2 |

## Contracts

The existing list_directory invoke name, input, output and error mapping remain
unchanged. Frontend root-cache reuse requires matching root, sort, empty query,
ignore setting and known pagination state. Explicit refresh invalidates stale
children. Unopened or collapsed branches must not trigger filesystem requests.

## Completion Criteria

- [x] Compatible List-to-Tree switch performs no redundant root request.
- [x] Expansion fetches only immediate children, never unopened grandchildren.
- [x] Collapse/reopen and view toggles reuse valid cache without loading another page.
- [x] Refresh does not read descendants hidden under a collapsed ancestor.
- [x] Root/sort/ignore changes and stale in-flight replies handled correctly.
- [x] Tree-to-List does not scan pages to search for a nested file.
- [x] Directory I/O runs off UI thread and IPC remains compatible.
- [x] Relevant tests, full verification, debug rebuild and launch completed.

## Progress Log

### 2026-09-09
User reports long Tree switching delay. Verified nonrecursive backend reads and
identified frontend redundant loading plus synchronous command dispatch. Plan
uses existing IPC and dependencies; preserves all prior working-tree edits.

Implemented compatible root-page reuse, cached branch retention, reactive late
List-page merging, explicit refresh identity, visible-only lazy branch loading,
and constant-time row metadata lookup. Root list pagination no longer searches
for known nested selections. Directory command now uses spawn_blocking with
unchanged arguments, output and error mapping.

Deterministic request-count tests verify zero redundant root calls, immediate
children only, paginated cache reopening, hidden refresh, and incompatible seed
rejection. Rust fixtures cover immediate child results across all four sorts.
Independent review reported no significant remaining findings.

Passed `CARGO_TERM_QUIET=true mise run verify` (typechecks, Biome, Rust format and
Clippy, 39 Bun tests, 173 Rust tests) and `bun run test:dom` (196 tests / 16 files).
Debug build passed: `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle`.
Build log: `/tmp/chilla-lazy-tree-build.log`.

Launched `target/debug/chilla` from the repository root with output redirected to
`/tmp/chilla-lazy-tree-launch.log`. New process observed running and left open per
the user's launch preference; the prior app instance was preserved. The log is
empty. Computer Use is unavailable, so no visual interaction or end-to-end timing
measurement is claimed. A very large single directory still requires examining
its immediate entries for sorting; no descendants are traversed.
