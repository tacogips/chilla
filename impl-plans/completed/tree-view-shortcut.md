# Tree View Shortcut Implementation Plan

**Status**: Completed
**Design Reference**: [Left Pane Tree View](../../design-docs/specs/design-file-viewer-mode.md#left-pane-tree-view)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables

Plain `t` switches List/Tree in the ordinary directory and Git/PR diff panes.
Existing mode handlers remain responsible for loading and selection. Ignore
editable/composing input, modifiers, and explicit file sets. Add shortcut help
and control tooltips.

## Tasks

1. Implement guarded shortcut handlers and help in file-view, pr-diff, and
   workspace shortcut modules. Status: Completed. Parallelizable: No.
2. Verify mode toggling and exclusions with relevant DOM tests, lint/typecheck,
   and a debug build/launch. Status: Completed. Depends on task 1.

## Completion Criteria

- [x] Plain t toggles both directory and diff views.
- [x] Typing, composition, modified keys, and explicit file sets are unaffected.
- [x] Help and README describe the shortcut.
- [x] Verification and debug launch complete.

## Progress Log

### 2026-09-09
User requested a Tree enable/disable shortcut. Plain t is available; Shift+T
already toggles the table of contents. Reuse existing mode handlers.

Implemented guarded t handlers and help/tooltips using the TypeScript coding
agent. Independent verification passed: `CARGO_TERM_QUIET=true mise run verify`
(typechecks, Biome, Rust formatting/clippy, 39 Bun tests, 172 Rust tests) and
`bun run test:dom` (189 tests). No shortcut conflicts found.

Debug rebuild passed via `CARGO_TERM_QUIET=true bun run tauri build --debug
--no-bundle`. Launched `target/debug/chilla --verbose .` from repository root,
redirecting output to `/tmp/chilla-tree-shortcut-launch.log`, observed the process
running, and stopped the smoke-test process. Visible UI automation unavailable;
the launch log was empty. Build log: `/tmp/chilla-tree-shortcut-build.log`.
