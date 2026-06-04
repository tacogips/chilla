# Numeric View Shortcuts Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#shared-presentation-shortcut-model`; `design-docs/specs/design-markdown-workbench.md#view-switching-shortcuts`; `design-docs/specs/design-csv-viewer.md#entry-and-activation`
**Created**: 2026-06-04
**Last Updated**: 2026-06-04

---

## Design Document Reference

**Primary Sources**:
- `design-docs/specs/architecture.md#shared-presentation-shortcut-model`
- `design-docs/specs/design-markdown-workbench.md#view-switching-shortcuts`
- `design-docs/specs/design-csv-viewer.md#entry-and-activation`

**Codex Agent References**:
- `src/features/pr-diff/PrDiffWorkspace.tsx`: existing `1` / `2` / `3` direct view switching and editable-target guard.
- `src/features/workspace/WorkspaceShell.tsx`: target Markdown and CSV presentation state, controls, shortcut help, and global keydown handling.
- `src/lib/keyboard.ts`: shared `isEditableKeyboardTarget` guard.

### Summary

Add direct numeric selection shortcuts to workspace screens that expose finite presentation controls. Markdown should support `1` for raw source and `2` for preview. CSV should support `1` for raw source and `2` for formatted table only when formatted output is available. Existing git diff numeric shortcuts remain unchanged.

### Scope

**Included**:
- Add workspace numeric shortcut handling for Markdown and CSV presentation modes.
- Preserve editable-target behavior by keeping numeric handling after `isEditableKeyboardTarget`.
- Treat unavailable indexes as no-ops, including Markdown `3` and CSV `2` when `formatted_available` is false.
- Update user-facing shortcut help and view-control titles to mention the direct numeric selectors.
- Add focused DOM tests for Markdown and CSV numeric shortcuts and editable-target preservation.

**Excluded**:
- Rust or Tauri command changes.
- New view modes, CSV parsing changes, Markdown rendering changes, or document mutation.
- Changes to `src/features/pr-diff/PrDiffWorkspace.tsx` beyond using it as a behavior reference.
- Numeric shortcuts for file-tree sorting or media navigation.

---

## Modules And Contracts

### 1. Workspace Shortcut Handling

#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: COMPLETED

Required behavior:
- Add a small helper or branch in the existing `handleGlobalKeyDown` flow that handles unmodified numeric keys only after editable-target guarding.
- Map Markdown active document:
  - `1` -> `setMarkdownPane("raw")`
  - `2` -> `setMarkdownPane("preview")`
  - other numeric keys -> no-op
- Map active CSV preview:
  - `1` -> `setCsvPaneMode("raw")`
  - `2` -> `setCsvPaneMode("formatted")` only when `formatted_available` is true
  - unavailable numeric keys -> no-op
- Call `event.preventDefault()` only when a shortcut performs an available presentation change or intentionally selects the already-active available mode.
- Do not call Tauri commands, reload files, save files, or mutate document content.
- Keep existing `Shift+P`, save, open, TOC, file-tree, and git diff behavior intact.

**Checklist**:
- [x] Markdown numeric selectors implemented in workspace keydown handling.
- [x] CSV numeric selectors implemented with `formatted_available` gating.
- [x] Editable targets continue to bypass numeric shortcut handling.
- [x] Numeric selectors do not interfere with existing git diff view handling.

### 2. Shortcut Help And Button Titles

#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: COMPLETED

Planning decision from Step 3 feedback:
- User-facing help should expose the new direct selectors because the issue asks for consistent shortcut behavior and the controls already show keyboard hints.
- Button titles should include both direct numeric selectors and the existing `Shift+P` toggle so discoverability improves without removing the toggle.

Required labels:
- Shortcut help includes `1` / `2` for Markdown Raw / Preview and CSV Raw / Formatted.
- Markdown Raw title mentions `1`; Markdown Preview title mentions `2`.
- CSV Raw title mentions `1`; CSV Formatted title mentions `2` and remains disabled when formatted output is unavailable.
- Existing `Shift+P` help remains as the toggle shortcut.

**Checklist**:
- [x] Shortcut help lists direct view selection for Markdown and CSV.
- [x] View-control titles include numeric selector hints.
- [x] `Shift+P` help remains present.

### 3. Frontend DOM Tests

#### `src/features/workspace/WorkspaceShell.vitest.tsx`

**Status**: COMPLETED

Required coverage:
- Markdown active document: dispatching `keydown` `1` activates raw mode.
- Markdown active document: dispatching `keydown` `2` activates preview mode.
- Markdown editable target: dispatching `keydown` `1` while a textarea/input/contenteditable target is focused does not switch modes.
- CSV active preview with formatted available: `1` activates raw mode and `2` activates formatted mode.
- CSV active preview with formatted unavailable: `2` is a no-op and does not enable formatted mode.
- User-facing shortcut text or title changes are asserted if practical within the DOM fixture.

**Checklist**:
- [x] Tests cover Markdown numeric selection.
- [x] Tests cover CSV numeric selection and unavailable formatted no-op.
- [x] Tests cover editable-target preservation.
- [x] Tests are added to the existing Vitest DOM suite.

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Workspace numeric shortcut handling | `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Vitest DOM |
| Shortcut help and control titles | `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Vitest DOM |
| Workspace shortcut tests | `src/features/workspace/WorkspaceShell.vitest.tsx` | COMPLETED | Vitest DOM |

## Implementation Tasks

### TASK-001: Add Workspace Numeric View Selectors
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src/features/workspace/WorkspaceShell.tsx`

**Dependencies**: None

**Completion Criteria**:
- [x] Markdown `1` and `2` select raw and preview.
- [x] CSV `1` and available `2` select raw and formatted.
- [x] Unavailable numeric indexes are no-ops.
- [x] Existing `Shift+P` toggle still works.

### TASK-002: Update Shortcut Discoverability
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src/features/workspace/WorkspaceShell.tsx`

**Dependencies**: `TASK-001`

**Completion Criteria**:
- [x] Shortcut help exposes direct numeric selectors.
- [x] View button titles include `1` or `2` hints.
- [x] Existing shortcut help for `Shift+P` remains.

### TASK-003: Add DOM Shortcut Tests
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src/features/workspace/WorkspaceShell.vitest.tsx`

**Dependencies**: `TASK-001`, `TASK-002`

**Completion Criteria**:
- [x] Markdown raw/preview numeric switching tested.
- [x] CSV raw/formatted numeric switching tested.
- [x] CSV formatted-unavailable `2` no-op tested.
- [x] Editable-target preservation tested.
- [x] User-facing shortcut text/title expectations tested where stable.

### TASK-004: Verification And Plan Progress Update
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: updated progress log in this plan

**Dependencies**: `TASK-003`

**Completion Criteria**:
- [x] `bun run typecheck` passes.
- [x] `bun run test:dom` passes.
- [x] `bun run test` passes if touched utilities are covered by Bun tests or if implementation wants repo-standard frontend verification.
- [x] Cargo remains unnecessary; if a Rust change becomes necessary, run Cargo commands with `CARGO_TERM_QUIET=true`.
- [x] Progress log records completed tasks, verification commands, and any residual risks.

---

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-001 workspace numeric selectors | accepted Step 3 design review | COMPLETED |
| TASK-002 shortcut discoverability | TASK-001 | COMPLETED |
| TASK-003 DOM tests | TASK-001, TASK-002 | COMPLETED |
| TASK-004 verification | TASK-003 | COMPLETED |

## Parallelizable Tasks

No tasks are marked parallelizable. The implementation, help labels, and tests all touch `src/features/workspace/WorkspaceShell.tsx` behavior or its DOM fixture, so write scopes overlap.

## Verification Plan

Run after implementation:
- `bun run typecheck`
- `bun run test:dom`
- `bun run test`

Optional only if Rust/Tauri files are unexpectedly touched:
- `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`
- `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`
- `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`

## Completion Criteria

- [x] Markdown view controls support `1` raw and `2` preview outside editable controls.
- [x] CSV view controls support `1` raw and `2` formatted only when formatted is available.
- [x] Git diff `1` / `2` / `3` behavior remains unchanged.
- [x] Numeric shortcuts do not intercept typing in editors, inputs, textareas, selects, or contenteditable elements.
- [x] Shortcut help and button titles explicitly expose direct numeric view selection.
- [x] Required Bun verification commands pass.
- [x] This plan's progress log is updated after implementation.

## Progress Log

### Session: 2026-06-04 00:00 JST
**Tasks Completed**: Created implementation plan from accepted design review.
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Step 3 low feedback was addressed by planning shortcut-help and button-title updates for direct numeric selectors.

### Session: 2026-06-04 22:36 JST
**Tasks Completed**: TASK-001, TASK-002, TASK-003, TASK-004.
**Tasks In Progress**: None
**Blockers**: None
**Verification**:
- `bun run typecheck` passed.
- `bun run test:dom` passed after fixing the new editable-target test fixture; final result was 11 files / 82 tests passed.
- `bun run test` passed with 19 tests.
- `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` passed and rebuilt `/Users/taco/gits/tacogips/chilla/target/debug/chilla`.
- `nohup /Users/taco/gits/tacogips/chilla/target/debug/chilla >/tmp/chilla-numeric-view-shortcuts.log 2>&1 &` was executed; shell PID 61763 exited with an empty log while a pre-existing `chilla` bundle process remained running.
**Notes**: Implemented workspace-local numeric view selection for Markdown and CSV only after editable-target guarding. CSV `2` remains gated by `formatted_available`; Markdown `3` and unavailable indexes remain no-ops. No Rust or Tauri command files changed, so Cargo verification was not needed.

## Related Plans

- **Depends On**: `impl-plans/completed/markdown-workbench-first-slice.md`, `impl-plans/completed/csv-viewer.md`
- **Related Active Reference**: `impl-plans/active/local-git-diff-viewer.md`
