# Git Diff Paging Shortcuts Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#diff-workspace-paging-shortcuts`
**Created**: 2026-06-07
**Last Updated**: 2026-06-07

---

## Design Document Reference

**Primary Source**:
- `design-docs/specs/architecture.md#diff-workspace-paging-shortcuts`

**Workflow Issue Reference**:
- Source: `workflowInput`
- Title: Fix Ctrl-D/Ctrl-U paging in chilla Git diff view
- Issue URL / number / repository: not supplied

**Codex Agent References**:
- No codex-agent reference inputs were supplied.
- No Cursor CLI behavior mapping is applicable.
- Existing local repository behavior references:
  - `src/features/pr-diff/PrDiffWorkspace.tsx`: active diff workspace keyboard handling, editable-target guard, and diff file viewport.
  - `src/features/pr-diff/PrDiffWorkspace.vitest.ts`: focused diff workspace DOM tests.
  - `src/lib/keyboard.ts`: shared editable keyboard target guard.

### Summary

Fix `Ctrl-D` and `Ctrl-U` so they page the visible GitHub or local Git diff file viewport when the diff workspace is active. The target viewport is the selected file's rendered diff view, currently `.pr-diff-fileview` inside `.pr-diff-pane__body`, across left/right, stack, and full-file modes.

### Scope

**Included**:
- Confirm the current shortcut behavior in the diff workspace before implementation.
- Route `Ctrl-D` to page the selected diff file view down.
- Route `Ctrl-U` to page the selected diff file view up.
- Keep editable diff controls from triggering paging.
- Keep the behavior scoped to the diff viewer pane, not the changed-file browser/sidebar and not the regular document preview pane.
- Add focused frontend regression tests for paging direction and editable-target exclusion.

**Excluded**:
- Rust or Tauri command changes.
- Changes to Git diff parsing, source adapters, or persisted document formats.
- README capture work. Existing uncommitted `README.md` and `doc/captures/git-diff-capture.png` changes must be preserved.
- New diff modes, lazy rendering, or diff-specific page-size tuning beyond the existing active-document page amount.

---

## Modules And Contracts

### 1. Diff Workspace Shortcut Handling

#### `src/features/pr-diff/PrDiffWorkspace.tsx`

**Status**: COMPLETED

Required behavior:
- Add or keep a single diff viewport ref for the selected file content surface, bound to `.pr-diff-fileview`.
- Handle `Ctrl-D` and `Ctrl-U` only after the existing editable-target guard.
- Page the viewport by the same active-document page amount used elsewhere unless existing local code already defines an equivalent helper.
- Treat no selected file, no text diff, missing viewport, or non-scrollable viewport as scoped no-ops.
- Call `preventDefault()` only when the diff workspace owns the shortcut.
- Preserve existing `G`, `1`, `2`, `3`, `Tab`, file browser navigation, and `O` behavior.

**Checklist**:
- [x] `Ctrl-D` pages `.pr-diff-fileview` down.
- [x] `Ctrl-U` pages `.pr-diff-fileview` up.
- [x] Editable controls bypass paging.
- [x] Sidebar/file-browser focus does not become the scroll target.
- [x] Existing diff navigation and mode shortcuts continue to work.

### 2. Focused Frontend Tests

#### `src/features/pr-diff/PrDiffWorkspace.vitest.ts`

**Status**: COMPLETED

Required coverage:
- Render an active diff workspace with a selected text diff.
- Install deterministic JSDOM scroll metrics or test doubles for `.pr-diff-fileview`.
- Dispatch `Ctrl-D` and assert the diff file view scroll position increases.
- Dispatch `Ctrl-U` and assert the diff file view scroll position decreases.
- Focus an editable diff control, dispatch `Ctrl-D` or `Ctrl-U`, and assert the diff file view does not page.
- Keep or extend existing assertions for numeric diff mode shortcuts and changed-file browser navigation as needed.

**Checklist**:
- [x] Down paging is covered.
- [x] Up paging is covered.
- [x] Editable-target exclusion is covered.
- [x] Tests assert the diff file view rather than the sidebar/document pane.

### 3. Verification And Progress Tracking

#### `impl-plans/completed/git-diff-paging-shortcuts.md`

**Status**: COMPLETED

Required behavior:
- Update task statuses and this progress log after implementation.
- Record exact verification commands and outcomes.
- Confirm protected uncommitted files remain present and not overwritten.

**Checklist**:
- [x] Plan progress log updated after implementation.
- [x] Required Bun verification commands recorded.
- [x] `git status --short` confirms protected README/capture changes were preserved.

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Diff workspace paging shortcuts | `src/features/pr-diff/PrDiffWorkspace.tsx` | COMPLETED | `PrDiffWorkspace.vitest.ts` |
| Diff workspace paging tests | `src/features/pr-diff/PrDiffWorkspace.vitest.ts` | COMPLETED | Vitest DOM |
| Plan progress tracking | `impl-plans/completed/git-diff-paging-shortcuts.md` | COMPLETED | N/A |

## Implementation Tasks

### TASK-001: Confirm Current Diff Paging Behavior
**Status**: COMPLETED
**Parallelizable**: Yes
**Deliverables**: notes in the progress log

**Dependencies**: accepted Step 3 design review

**Completion Criteria**:
- [x] Current `Ctrl-D` / `Ctrl-U` behavior is reproduced or characterized.
- [x] The selected scroll target is confirmed as `.pr-diff-fileview`.
- [x] Protected `README.md` and `doc/captures/git-diff-capture.png` changes remain untouched.

### TASK-002: Implement Diff File View Paging
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src/features/pr-diff/PrDiffWorkspace.tsx`

**Dependencies**: TASK-001

**Completion Criteria**:
- [x] `Ctrl-D` pages the selected diff file view down.
- [x] `Ctrl-U` pages the selected diff file view up.
- [x] Editable targets do not page the view.
- [x] No document preview, EPUB, media, or sidebar paging path runs while the diff workspace owns the shortcut.

### TASK-003: Add Focused Regression Tests
**Status**: COMPLETED
**Parallelizable**: Yes
**Deliverables**: `src/features/pr-diff/PrDiffWorkspace.vitest.ts`

**Dependencies**: accepted Step 3 design review; can be authored before TASK-002 but must pass with TASK-002

**Completion Criteria**:
- [x] Test covers `Ctrl-D` increasing `.pr-diff-fileview` scroll position.
- [x] Test covers `Ctrl-U` decreasing `.pr-diff-fileview` scroll position.
- [x] Test covers editable controls not paging the diff view.
- [x] Existing diff workspace keyboard tests still pass.

### TASK-004: Run Verification And Update Plan
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: updated progress log in this plan

**Dependencies**: TASK-002, TASK-003

**Completion Criteria**:
- [x] `bunx vitest run --config vitest.config.ts src/features/pr-diff/PrDiffWorkspace.vitest.ts` passes.
- [x] `bun run typecheck` passes.
- [x] `src/features/workspace/WorkspaceShell.tsx` was unchanged, so the conditional WorkspaceShell test was not required.
- [x] `git status --short` reviewed for preserved `README.md` and `doc/captures/git-diff-capture.png`.
- [x] Cargo remains unnecessary; if Rust changes become necessary, run Cargo with `CARGO_TERM_QUIET=true`.

---

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-001 behavior confirmation | Step 3 accepted design | COMPLETED |
| TASK-002 diff paging implementation | TASK-001 | COMPLETED |
| TASK-003 frontend regression tests | Step 3 accepted design | COMPLETED |
| TASK-004 verification and progress update | TASK-002, TASK-003 | COMPLETED |

## Parallelizable Tasks

- `TASK-001` and `TASK-003` are parallelizable because behavior-confirmation notes and test-file edits have disjoint write scopes.
- `TASK-002` is not parallelizable with other edits to `src/features/pr-diff/PrDiffWorkspace.tsx`.
- `TASK-004` is not parallelizable because it depends on implementation and tests being complete.

## Verification Plan

Required after implementation:
- `bunx vitest run --config vitest.config.ts src/features/pr-diff/PrDiffWorkspace.vitest.ts`
- `bun run typecheck`
- `git status --short`

Conditional:
- `bun test src/features/workspace/WorkspaceShell.vitest.tsx` if `src/features/workspace/WorkspaceShell.tsx` changes.
- `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` only if Rust/Tauri files unexpectedly change.

## Completion Criteria

- [x] Active GitHub/local Git diff workspace owns `Ctrl-D` and `Ctrl-U` paging.
- [x] Paging targets `.pr-diff-fileview`, not the changed-file browser/sidebar or document preview pane.
- [x] `Ctrl-D` pages down and `Ctrl-U` pages up by the existing active-document page amount.
- [x] Editable diff controls retain normal text-entry behavior.
- [x] Existing `G`, `1`, `2`, `3`, `Tab`, changed-file browser navigation, and `O` behavior are preserved.
- [x] Focused frontend tests cover down paging, up paging, and editable-target exclusion.
- [x] Required Bun verification commands pass.
- [x] Existing uncommitted `README.md` and `doc/captures/git-diff-capture.png` changes are preserved.
- [x] Plan progress log records completed tasks, verification commands, and residual risks.

## Progress Log

### Session: 2026-06-07 00:00 JST
**Tasks Completed**: Created implementation plan from accepted Step 3 design review.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Step 3 had no high or mid findings. Plan intentionally scopes changes to the diff workspace and focused frontend tests unless global workspace shortcut routing proves necessary during implementation.

### Session: 2026-06-07 16:45 JST
**Tasks Completed**: TASK-001, TASK-002, TASK-003, TASK-004.
**Tasks In Progress**: None.
**Verification**:
- `bash .agents/scripts/format-ts.sh` passed.
- `bunx vitest run --config vitest.config.ts src/features/pr-diff/PrDiffWorkspace.vitest.ts` passed: 23 tests.
- `bun run typecheck` passed.
- `bun run test` passed: 19 tests.
**Notes**: Confirmed the previous implementation path only targeted regular document panes, while the diff workspace scroll surface is `.pr-diff-fileview`. Implemented diff-scoped `Ctrl-D` / `Ctrl-U` paging after the editable-target guard and preserved existing uncommitted README/capture changes.
