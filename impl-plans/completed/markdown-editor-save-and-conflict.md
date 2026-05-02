# Markdown Editor, Save, And External-Change Conflict

**Status**: Completed
**Design Reference**: `design-docs/specs/design-markdown-workbench.md` (File Synchronization, Tauri Boundary events)
**Created**: 2026-05-01
**Last Updated**: 2026-05-01

## Design Document Reference

**Primary Source**: `design-docs/specs/design-markdown-workbench.md`

**Supporting Sources**:
- `design-docs/specs/design-file-viewer-mode.md` (Markdown mode ownership of snapshot and save/reload)
- `impl-plans/completed/markdown-workbench-first-slice.md` (TASK-005; `document_conflict` remains unused while the frontend infers conflict from refresh plus dirty buffer)

### Summary

Restore the Markdown workbench slice that the design describes but the current workspace shell does not fully expose: user-editable source, explicit save, dirty tracking, and safe handling of `document_refreshed` when the buffer has unsaved edits.

### Scope

**Included**:
- Editable Markdown source surface while a Markdown document is active (minimum viable: plain text editing aligned with `DocumentSnapshot.source_text`, not necessarily syntax highlighting in the edit surface)
- `saveDocument` invoke wired from the UI with keyboard shortcut consistent with `command.md` / existing shortcuts inventory
- Dirty state derived from comparing the edit buffer to the last adopted snapshot baseline (`revision_token` and/or normalized source equality)
- On `listenDocumentRefreshed`: if the refresh targets the active path and the editor is clean, replace `markdownDoc` as today; if dirty, do not overwrite the buffer; enter explicit conflict state (banner or modal) with actions to reload from disk or keep editing until user chooses
- Clear conflict state on successful save, reload, or open of a different file
- Bun unit tests for any extracted pure helpers (for example baseline comparison); optional Vitest for banner logic if kept modular

**Excluded**:
- Merge or three-way conflict resolution
- Collaborative editing
- Auto-save
- Changing CSV/media/file-preview refresh semantics (`document_refreshed` remains Markdown-focused)

### TASK-001: Edit Buffer And Dirty Semantics

**Status**: COMPLETED
**Parallelizable**: No

**Deliverables**:
- `src/features/workspace/WorkspaceShell.tsx` (or small colocated module): signals/memos for `editorSourceText`, dirty flag, initialization rules when `openDocument` / `reloadDocument` / `saveDocument` resolve

**Completion Criteria**:
- [x] Opening a Markdown file sets the edit buffer from `DocumentSnapshot.source_text`
- [x] Dirty is false when buffer matches last server-adopted baseline for that path
- [x] Dirty becomes true when the user types and the buffer diverges

### TASK-002: Save And Reload Commands From UI

**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: TASK-001

**Deliverables**:
- `src/lib/tauri/document.ts` unchanged unless a thin helper improves testability
- Workspace UI affordance(s): save action, reload-from-disk action (reload may reuse existing paths used for syntax refresh)

**Completion Criteria**:
- [x] Save persists via `save_document` and updates baseline, TOC, and preview-related state from returned snapshot
- [x] Reload from disk without conflict uses `reload_document` and resets dirty for that snapshot (`R` reload and theme refresh path)

### TASK-003: External Refresh Versus Dirty Buffer

**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: TASK-001

**Deliverables**:
- `listenDocumentRefreshed` handler update in `WorkspaceShell.tsx`
- Pure policy helper `decideMarkdownDocumentRefresh` in `documentRefreshDecision.ts` (wired from `WorkspaceShell`)
- Optional: `listen` wrapper for `document_conflict` only if backend starts emitting it; otherwise frontend policy layer performs conflict branching on refresh payload

**Completion Criteria**:
- [x] Clean editor: external refresh replaces `markdownDoc` and syncs buffer to new `source_text`
- [x] Dirty editor: external refresh does not clobber buffer; user sees conflict UX with disk revision available for explicit reload/keep

### TASK-004: Conflict Presentation

**Status**: COMPLETED
**Parallelizable**: Yes (after TASK-003 contract is stable)
**Depends On**: TASK-003

**Deliverables**:
- Banner or inline alert region using existing `banner` / pane styling in `src/app/App.css` where practical

**Completion Criteria**:
- [x] User can dismiss conflict only through explicit choices (reload disk, keep local and continue)
- [x] No silent data loss when external file changes during dirty editing

### TASK-005: Verification

**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: TASK-002, TASK-003, TASK-004

**Completion Criteria**:
- [x] `bun run typecheck`
- [x] `bun run test` and `bun run test:dom`
- [x] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`
- [x] `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [x] Focused Vitest for refresh-vs-dirty policy (`documentRefreshDecision.vitest.ts`)

## Module Status

| Module | Location | Status |
|--------|----------|--------|
| Edit buffer + dirty | `WorkspaceShell` | COMPLETED |
| Save (`Ctrl`/`Cmd`+`S`) + reload | `WorkspaceShell` | COMPLETED |
| Refresh vs conflict | `listenDocumentRefreshed` + `documentRefreshDecision` | COMPLETED |
| Banner actions | `WorkspaceShell`, `App.css` | COMPLETED |

## Related Plans

- **Depends On**: `impl-plans/completed/markdown-workbench-first-slice.md`, `impl-plans/completed/file-viewer-mode.md`
- **Previous**: `impl-plans/completed/file-view-mixed-stack-validation.md`

### Review Feedback: 2026-05-01
**Finding**: `WorkspaceShell.refreshSyntaxHighlights` still calls `reloadDocument` and `applyMarkdownSnapshot` for an active Markdown document. `cycleColorScheme` invokes that path, so toggling the theme while the Markdown editor is dirty silently replaces `markdownEditorBuffer` with disk content and drops unsaved edits.
**Required Follow-Up**:
- [x] Guard theme-triggered refresh so it does not reload or adopt a snapshot while `markdownIsDirty()` is true.
- [x] Add a frontend regression proving `Shift+S` / theme cycling preserves dirty Markdown editor text.

### Review Feedback: 2026-05-01 (current git diff)
**Finding**: The staged implementation still preserves the dirty-buffer data-loss path. `src/features/workspace/WorkspaceShell.tsx` calls `reloadDocument(doc.path)` inside `refreshSyntaxHighlights`, then `applyMarkdownSnapshot(nextSnapshot)`, and `cycleColorScheme` always awaits that function after updating the theme.
**Required Follow-Up**:
- [x] When `markdownIsDirty()` is true, theme cycling should update theme state without reloading or adopting the disk snapshot.
- [x] Add a focused Vitest or DOM test that edits the raw Markdown textarea, triggers the theme toggle path, and asserts the textarea value is unchanged.

**Review Verification**: `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed during review. Linux WebDriver E2E was not re-run in this review.

### Session: 2026-05-02 (theme reload guard)

**Tasks Completed**: `canReloadMarkdownSnapshotForPresentationRefresh` + Vitest coverage; `refreshSyntaxHighlights` skips `reload_document` while the Markdown buffer differs from the adopted baseline.

### Session: 2026-05-01 (closure)

**Tasks Completed**: TASK-005 Vitest coverage for `decideMarkdownDocumentRefresh`; plan archived after verification.

**Notes**: Conflict unit tests encode the branching previously inlined in `WorkspaceShell`.

### Session: 2026-05-01 (implementation)

**Tasks Completed**: TASK-001 through TASK-004 in `WorkspaceShell` / `App.css`; raw pane is an editable textarea (syntax highlighting removed for this slice); save shortcut registered before editable-target guard so it works while the textarea is focused; preview subtitle explains stale preview when dirty.

**Blockers**: None

**Notes**: Table of contents still reflects last saved snapshot headings until save.

### Session: 2026-05-01

**Tasks Completed**: Plan authored; Phase 3 unblocked in `impl-plans/README.md` after Phase 2 mixed-stack validation completed.

**Tasks In Progress**: None

**Blockers**: None

**Notes**: Superseded by implementation session above.
