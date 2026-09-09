# Relative Symlink Targets

**Status**: Completed
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md#symbolic-link-presentation`
**Created**: 2026-09-08
**Last Updated**: 2026-09-08

## Scope

Display resolved symlink targets relative to the containing directory in the left
pane. Preserve absolute tooltips, accessible names, and navigation contracts.
Release work is paused and remains separate.

## Tasks

### TASK-001: Relative label presentation

**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src/features/file-view/FileBrowserPane.tsx`, a focused path
formatting helper if needed, and focused frontend tests.

- [x] Show sibling, child, parent, and same-directory targets correctly.
- [x] Fall back to absolute targets for incompatible roots.
- [x] Preserve full tooltips, accessibility, and opening behavior.

### TASK-002: Verification

**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: Independent check-and-test review and local debug app launch.

- [x] Focused tests and frontend checks pass.
- [x] Rebuild and launch the local debug app.

## Completion Criteria

- [x] Both tasks complete; no release published.

## Progress Log

### 2026-09-08

Updated the existing symlink presentation design. Implementing the user's request
as a frontend display change; the unpublished release work is preserved.

Implementation complete: 36 focused DOM/helper tests, 39 Bun tests, and full
`CARGO_TERM_QUIET=true mise run verify` passed (171 Rust unit tests plus one
additional test). Independent verification found no issues. Debug build passed.
Launched `/Users/taco/gits/tacogips/chilla/target/debug/chilla /Users/taco/gits/tacogips/chilla`
with logs at `/tmp/chilla-relative-symlink-launch.log`, confirmed the process ran,
then stopped that test process. Computer Use was unavailable; visible desktop
verification was skipped, with DOM rendering covered by tests.
