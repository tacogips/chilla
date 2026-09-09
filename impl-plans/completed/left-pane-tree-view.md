# Left Pane Tree View Implementation Plan

**Status**: Completed
**Design Reference**: [Left Pane Tree View](../../design-docs/specs/design-file-viewer-mode.md#left-pane-tree-view)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Scope and Deliverables

Add an inline expandable view rooted at the current directory to the ordinary
file browser, and default the Git/PR diff browser to its own changed-file tree.
Use existing IPC contracts; preserve pre-existing working-tree changes.

| Module | Deliverable | Status |
| --- | --- | --- |
| Directory tree | `src/features/file-view/` tree component/model and pane integration | Implemented |
| Diff tree | `src/features/pr-diff/` path hierarchy and view integration | Implemented |
| Presentation | `src/app/App.css` tree indentation and controls | Implemented |
| Verification | Relevant DOM/model tests and debug app launch | Completed |

## Tasks

### TASK-001: Directory tree
**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: Tree/List control, lazy children and paging, visible-row keyboard
navigation, root isolation, nested file preview, regression tests.

### TASK-002: Diff tree
**Status**: Completed
**Parallelizable**: Yes (separate files from TASK-001)
**Deliverables**: Changed-path hierarchy, default tree, List switch, collapse and
expand, filter ancestors, file-selection reveal, status/count preservation, tests.

### TASK-003: Integration and verification
**Status**: Completed
**Parallelizable**: No (depends on TASK-001 and TASK-002)
**Deliverables**: Styles, README usage, independent verification, debug rebuild
and launch, final plan status.

## Completion Criteria

- [x] Ordinary directory Tree view expands without moving the root.
- [x] Nested file preview and keyboard selection work.
- [x] Lazy loading, failures, paging, filtering, and root changes are handled.
- [x] Git/PR diff defaults to Tree and offers List.
- [x] Diff filtering and file navigation preserve and reveal the hierarchy.
- [x] Relevant tests, typecheck, formatting, and build pass.
- [x] Debug app rebuilt and launched; visible verification limitations recorded.

## Progress Log

### Session: 2026-09-09
Inspected both existing browsers and existing uncommitted changes. No backend
contract changes are needed. Implementation uses repository-required coding
agents; work remains local without committing or pushing.

Diff implementation passes 35 DOM tests, TypeScript checks, scoped Biome checks,
and 39 Bun tests. Independent verification is underway. Shared presentation and
README usage have been updated.

Directory implementation passes 20 targeted DOM tests and typecheck, including
same-root refresh, stale responses, paging/retry, and keyboard focus. Independent
review identified a diff-row focus restoration issue; a regression fix is in
progress before final full-suite verification and debug launch.

Final independent review fixes cover diff cursor/focus restoration and tree sort
reset after changing sort. `CARGO_TERM_QUIET=true mise run verify` passed all
typechecks, Biome, Rust formatting/clippy, 39 Bun tests, and 172 Rust tests.
`bun run test:dom` passed 185 tests across 15 files.
`CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` passed.

Launched `target/debug/chilla --verbose .` from the repository root, with output
redirected to `/tmp/chilla-tree-view-launch.log`. The foreground tool session kept
the app running; the earlier detached attempt exited before observation. The
observed test process was terminated after the startup smoke check. The log was
empty. Visible macOS interaction was not verified because Computer Use tools were
unavailable. No commit or push was performed.
