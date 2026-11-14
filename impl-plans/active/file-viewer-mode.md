# File Viewer Mode Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md`
**Created**: 2026-03-19
**Last Updated**: 2026-03-21

## Design Document Reference

**Primary Source**: `design-docs/specs/design-file-viewer-mode.md`

**Supporting Sources**:
- `design-docs/specs/design-markdown-workbench.md`
- `design-docs/specs/command.md#startup-contract`
- `design-docs/specs/architecture.md#supporting-spec`

### Summary

Implement a switchable file-view workspace on top of the current Markdown workbench so `chilla` can launch on the current directory, a directory path, a Markdown file, or another file path.

### Scope

**Included**:
- zero-argument and directory startup
- Rust-side startup target parsing
- Rust-side file type detection using a dedicated library
- directory listing and file preview Tauri commands
- image and video preview rendering in file view mode
- yazi-style flat current-directory browser with `hjkl`/Enter/Ctrl-M navigation
- mode switching between Markdown mode and file view mode

**Excluded**:
- recursive tree widgets
- file mutation for non-Markdown files
- multi-pane split directories
- fuzzy search, hidden-file filtering, or recent-files features

## Modules And Contracts

### 1. Startup Context

#### `src-tauri/src/cli/mod.rs`
#### `src-tauri/src/app_state.rs`

**Status**: NOT_STARTED

```rust
pub enum StartupTarget {
    CurrentDirectory(std::path::PathBuf),
    Directory(std::path::PathBuf),
    File(std::path::PathBuf),
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StartupContext {
    pub initial_mode: WorkspaceMode,
    pub current_directory_path: String,
    pub selected_file_path: Option<String>,
}
```

### 2. File Viewer Contracts

#### `src-tauri/src/viewer/types.rs`
#### `src/lib/tauri/document.ts`

**Status**: NOT_STARTED

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct DirectorySnapshot {
    pub current_directory_path: String,
    pub parent_directory_path: Option<String>,
    pub entries: Vec<DirectoryEntry>,
    pub selected_path: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DirectoryEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FilePreview {
    Markdown(DocumentSnapshot),
    Text(TextPreview),
    Binary(BinaryPreview),
}
```

### 3. Viewer Service And Commands

#### `src-tauri/src/viewer/service.rs`
#### `src-tauri/src/commands/document.rs`

**Status**: NOT_STARTED

```rust
pub struct ViewerService;

impl ViewerService {
    pub fn startup_context(&self, target: &StartupTarget) -> AppResult<StartupContext>;
    pub fn list_directory(&self, path: &std::path::Path, selected_path: Option<&std::path::Path>) -> AppResult<DirectorySnapshot>;
    pub fn open_file_preview(&self, path: &std::path::Path) -> AppResult<FilePreview>;
}

#[tauri::command]
pub fn get_startup_context(state: tauri::State<'_, AppState>) -> Result<StartupContext, String>;

#[tauri::command]
pub fn list_directory(path: String, selected_path: Option<String>, state: tauri::State<'_, AppState>) -> Result<DirectorySnapshot, String>;

#[tauri::command]
pub fn open_file_preview(path: String, state: tauri::State<'_, AppState>) -> Result<FilePreview, String>;
```

### 4. Frontend Workspace

#### `src/features/workspace/WorkspaceShell.tsx`
#### `src/features/file-view/FileBrowserPane.tsx`
#### `src/features/file-view/FilePreviewPane.tsx`

**Status**: NOT_STARTED

```ts
export type WorkspaceMode = "markdown" | "file_view";

export interface StartupContext {
  readonly initial_mode: WorkspaceMode;
  readonly current_directory_path: string;
  readonly selected_file_path: string | null;
}
```

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Startup context | `src-tauri/src/cli/`, `src-tauri/src/app_state.rs` | NOT_STARTED | Cargo |
| Viewer types and service | `src-tauri/src/viewer/` | NOT_STARTED | Cargo |
| Tauri commands and frontend bindings | `src-tauri/src/commands/`, `src/lib/tauri/document.ts` | NOT_STARTED | Cargo + Bun |
| File-view UI | `src/features/file-view/`, `src/features/workspace/WorkspaceShell.tsx` | NOT_STARTED | Bun |

## Implementation Tasks

### TASK-001: Startup Target And Viewer Contract
**Status**: IN_PROGRESS
**Parallelizable**: No
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/app_state.rs`, `src-tauri/src/viewer/types.rs`, `src/lib/tauri/document.ts`

**Completion Criteria**:
- [ ] CLI accepts bare startup, directory paths, and file paths
- [ ] startup context distinguishes file view vs Markdown mode
- [ ] frontend bindings expose startup context and file preview unions

### TASK-002: Rust Viewer Service
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-001`
**Deliverables**: `src-tauri/src/viewer/service.rs`, `src-tauri/src/commands/document.rs`, `src-tauri/Cargo.toml`

**Completion Criteria**:
- [ ] directory listing returns flat current-directory entries
- [ ] file type detection is Rust-owned and library-backed
- [ ] Markdown, text, and binary previews are distinguished correctly

### TASK-003: Frontend File View Mode
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src/features/file-view/`, `src/features/workspace/WorkspaceShell.tsx`, `src/app/App.css`

**Completion Criteria**:
- [ ] file view mode renders directory list + viewer pane
- [ ] `hjkl` + Enter/Ctrl-M navigation works
- [ ] Markdown/file-view mode switching works

### TASK-004: Verification
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-003`
**Deliverables**: updated tests and verification log

**Completion Criteria**:
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] `CARGO_TERM_QUIET=true cargo check` passes
- [ ] `CARGO_TERM_QUIET=true cargo test` passes
- [ ] `CARGO_TERM_QUIET=true cargo clippy --all-targets -- -D warnings` passes

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-002 Rust viewer service | TASK-001 | BLOCKED |
| TASK-003 frontend file view mode | TASK-001, TASK-002 | BLOCKED |
| TASK-004 verification | TASK-003 | BLOCKED |

## Completion Criteria

- [ ] Bare `chilla` startup opens file view mode rooted at the current directory
- [ ] `chilla <dir_path>` opens file view mode rooted at that directory
- [ ] `chilla <markdown_file>` opens markdown mode
- [ ] `chilla <other_file>` opens file view mode with that file previewed
- [ ] Non-Markdown text files preview as text
- [ ] Image and video files preview inline
- [ ] Binary files are not rendered

## Progress Log

### Session: 2026-03-19 16:20 JST
**Tasks Completed**: Created design and implementation plan for file-view mode
**Tasks In Progress**: TASK-001 startup target and viewer contract
**Blockers**: None
**Notes**: The current app is centered on a single Markdown startup path. The feature will be implemented by adding startup context plus separate directory-listing/file-preview commands, while preserving the existing Markdown editor flow for Markdown mode. Image and video previews are part of the file-view contract.

### Session: 2026-03-21 JST
**Tasks Completed**: Refactored directory listing contract to keep selection frontend-owned
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode
**Blockers**: Runtime keyboard behavior still needs manual validation in the app
**Notes**: Removed `selected_path` / `selected_index` from the `list_directory` Tauri contract so the backend acts as a stateless page query service over `path`, `offset`, `limit`, `query`, and `sort`. Frontend selection is now owned locally in `WorkspaceShell`, including page-boundary keyboard navigation. Verified with `bun run typecheck`, `bun test`, `CARGO_TERM_QUIET=true cargo check -p chilla`, and `CARGO_TERM_QUIET=true cargo test -p chilla`.
**Tasks Completed**: Extended the directory-entry contract with file size and modified-time metadata; added frontend file-tree sort modes and keyboard shortcuts for name, mtime, and size.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Sort metadata remains Rust-owned via the directory listing contract, while the active sort mode is frontend-owned so `a/A`, `m/M`, and `s/S` can reorder the current list without extra IPC calls.

### Session: 2026-03-21 JST
**Tasks Completed**: Polished video preview playback initiation so file-tree autoplay requests trigger the overlay button or direct playback reliably; replaced the text play CTA with an icon-only control that keeps an accessible label.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: The play overlay remains keyboard reachable, and the autoplay request id is now consumed once per preview load so repeated reactive updates do not retrigger stale playback requests.

### Session: 2026-03-21 JST
**Tasks Completed**: Tuned large-directory file-tree rendering by virtualizing the visible rows, moving scrolling into a dedicated viewport, and removing per-row truncation measurement observers that scaled with entry count.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: The file tree now renders only the visible slice plus overscan, which keeps navigation responsive for large directories while preserving existing keyboard and focus behavior.

### Session: 2026-03-21 JST
**Tasks Completed**: Moved file-tree sort and filter evaluation to Rust, changed the directory-list contract to return a paged window with total counts and selection metadata, and updated the frontend file browser to request new windows as scroll/keyboard navigation moves across large directories.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Large directories such as `/nix/store` no longer require sending the entire entry list over Tauri in one response. The frontend now treats the Rust response as a movable window over the full sorted directory.
