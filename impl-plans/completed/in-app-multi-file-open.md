# In-App Multi-File Open Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md#explicit-file-set-contract`
**Created**: 2026-05-02
**Last Updated**: 2026-05-02

## Design Document Reference

**Primary Source**: `design-docs/specs/design-file-viewer-mode.md`

### Summary

Add an in-app multi-file picker that reuses the existing explicit-file-set viewer mode so users can open one or more files without restarting `chilla` from the CLI.

### Scope

**Included**:
- Tauri dialog plugin wiring and permissions
- workspace action and shortcut to pick one or more files
- frontend state transition into directory mode or explicit-file-set mode based on the selection count
- mixed-stack verification for Bun and Cargo paths

**Excluded**:
- recent-files history
- drag-and-drop multi-file open
- separate directory-picker UX
- changes to the existing CLI startup contract

## Modules And Contracts

### 1. Tauri Dialog Integration

#### `src-tauri/Cargo.toml`
#### `src-tauri/src/lib.rs`
#### `src-tauri/capabilities/default.json`

**Status**: Completed

```rust
// src-tauri/src/lib.rs
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
```

Frontend contract uses the Tauri dialog plugin with multi-select enabled and normalizes the result into zero, one, or many filesystem paths.

### 2. Workspace File-Picker Flow

#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: Completed

```ts
type PickedOpenTarget =
  | {
      readonly kind: "single_file";
      readonly filePath: string;
      readonly directoryPath: string;
    }
  | {
      readonly kind: "file_set";
      readonly selectedFilePath: string;
      readonly filePaths: readonly string[];
    };
```

The workspace shell owns:
- launching the picker
- deduplicating / classifying returned paths
- switching into existing directory or explicit-file-set browser state
- previewing the initial file immediately

### 3. Frontend Dependencies

#### `package.json`

**Status**: Completed

Add `@tauri-apps/plugin-dialog` and keep the frontend on typed Tauri plugin APIs rather than DOM-only file inputs.

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Dialog plugin wiring | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` | Completed | Cargo |
| Workspace open-files action | `src/features/workspace/WorkspaceShell.tsx`, `src/features/workspace/openFiles.ts` | Completed | Bun |
| Frontend dependency | `package.json` | Completed | Bun |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| In-app multi-file picker | Completed explicit-file-set viewer flow in `impl-plans/completed/file-viewer-mode.md` | Available |

## Completion Criteria

- [x] Users can trigger an in-app file picker from the workspace
- [x] Selecting one file opens that file and its parent directory context
- [x] Selecting multiple files opens explicit-file-set mode
- [x] Canceling the picker leaves the current workspace untouched
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
- [x] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` passes

## Progress Log

### Session: 2026-05-02 18:20 JST
**Tasks Completed**: Created focused implementation plan for in-app multi-file open.
**Tasks In Progress**: Tauri dialog plugin wiring and workspace-shell integration.
**Blockers**: None.
**Notes**: The repo already supports explicit-file-set mode for CLI startup, so this plan intentionally reuses that contract instead of introducing a new backend listing model.

### Session: 2026-05-02 18:35 JST
**Tasks Completed**: Added Tauri dialog plugin wiring and capability, implemented `Open files` button plus `Ctrl/Cmd+O`, added picker classification helpers with tests, and verified Bun/Cargo checks.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Single-file picks now re-enter the existing directory-backed flow with the selected file focused, while multi-file picks reuse explicit-file-set mode and open the first unique selected file immediately.
