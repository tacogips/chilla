# Default Shortcut Collision Fix

**Status**: Completed
**Design Reference**: [Default Shortcut Collision Audit](../../design-docs/specs/notes.md#default-shortcut-collision-audit)
**Created**: 2026-09-10
**Last Updated**: 2026-09-10

## Deliverables

Existing keymap types and dispatch interfaces stay unchanged.

### TASK-001: Audit and update defaults
**Status**: Completed
**Parallelizable**: No
**Deliverables**: src/features/keymap/keymap.ts; src/features/workspace/workspaceShortcuts.tsx; affected frontend tests.
- [x] Audit actual default and hard-coded collisions.
- [x] Move theme to Shift+D; preserve search and intentional contextual keys.
- [x] Update help/tooltips and meaningful dispatch regression coverage.

### TASK-002: Documentation
**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: README.md; design audit notes.
- [x] Document new shortcut and collision policy.

### TASK-003: Verification
**Status**: Completed
**Parallelizable**: No (depends on TASK-001 and TASK-002)
**Deliverables**: verification evidence in this plan.
- [x] Typecheck, formatting and relevant tests pass.
- [x] Independent verification agent review completes.
- [x] Rebuild and launch local debug app.

## Progress Log

### 2026-09-10
Confirmed Shift+S search/theme overlap; unused Shift+D selected for theme.

### TASK-004: Search keyboard return flow
**Status**: Completed
**Parallelizable**: Yes (separate search component files; coordinate dispatcher changes)
**Deliverables**: DirectorySearchPanel.tsx, FileBrowserPane.tsx, associated tests; KeymapProvider.tsx if required for configured refocus.
- [x] Enter/Ctrl+M focuses first result after search or from cached results.
- [x] Search shortcuts refocus input and preserve query by mode across reopen.
- [x] Typing and custom search bindings remain correct.
- [x] Containing-directory action uses a right arrow icon.
- [x] Regression checks cover new flows.

User expanded scope to search navigation, retained text/refocus, and reveal icon.

Shortcut slice: independent review accepted; mise run lint-ts and 83 targeted DOM
tests passed. Search follow-up implementation and final build remain pending.

Final independent review accepted. mise run lint-ts passed; mise exec -- bun run
test passed 39 tests; mise exec -- bun run test:dom passed 365 tests across 25 files.
git diff --check passed. No Rust source changes. Native debug build in progress.

Native verification completed: `CARGO_TERM_QUIET=true mise exec -- bun run tauri
build --debug --no-bundle` passed (existing Vite chunk-size warning). Build log:
`/tmp/chilla-shortcuts-build.log`. Launched `target/debug/chilla` via a detached
Python subprocess; it remained running for the five-second startup check, then
the test instance was terminated. Launch log: `/tmp/chilla-shortcuts-launch.log`.
Visible macOS UI verification was skipped because Computer Use was unavailable.
No commits or pushes were performed.
