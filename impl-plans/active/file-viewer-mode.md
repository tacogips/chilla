# File Viewer Mode Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md`
**Created**: 2026-03-19
**Last Updated**: 2026-04-06

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
**Tasks Completed**: Aligned packaged-build behavior with the Tauri custom-protocol requirement used by this repository's Cargo/Nix path; adjusted the global `Y` shortcut to copy the currently selected file-browser path; tightened preview/raw-pane layout with shared inner-width wrappers; updated README to match the shipped shortcut and build behavior.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: `task nix-build` was reverified after the packaged-build fix. The current implementation now treats the selected browser entry, not only the open document, as the source of truth for copy-path behavior in file view mode.

### Session: 2026-03-22 JST
**Tasks Completed**: Switched the file-view directory IPC contract to stateless server-side sorting plus paged reads (`path`, `sort`, `offset`, `limit`); capped directory pages at 200 entries; added canonical row paths so the frontend can match startup or parent-navigation selections without server session state; updated the frontend file browser to lazy-load additional pages while preserving keyboard navigation and active selection.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Default sorting no longer requires metadata reads for the entire directory before the first render, which improves large-directory behavior such as `/nix/store`. Verification passed with `bun run typecheck`, `bun run test`, `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.

### Session: 2026-03-22 JST
**Tasks Completed**: Restored file-tree filtering to the stateless server contract via a `query` parameter so searches cover not-yet-loaded entries; updated the frontend state and file browser input to use server-filtered pages instead of local filtering; added regressions proving the filter keeps focus while typing and can surface `notes-220.md` without loading all prior pages.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: The file-tree filter remains stateless because the backend only receives `path`, `sort`, `query`, `offset`, and `limit`. Verification passed with `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`.

### Session: 2026-03-22 JST
**Tasks Completed**: Hardened Rust directory enumeration so dangling symlinks and other unreadable entries are skipped instead of aborting the whole listing; added a regression covering a broken `.manpath`-style symlink alongside a valid visible file.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-004 verification
**Blockers**: None
**Notes**: This fixes the case where launching `chilla` on `~/` failed to show any entries because a single broken symlink caused the backend directory page request to error out.

### Session: 2026-03-27 JST
**Tasks Completed**: Extended Linux WebKit media recovery so audio previews retry via a blob URL after direct `asset://` playback failures; added a regression covering an uppercase `.MP3` path with non-ASCII characters.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: The file-view media pane already retried failed Linux video playback through `fetch(...).blob()` + `URL.createObjectURL(...)`; this session applies the same recovery path to audio previews so standard MP3 files are not stranded on the direct custom-protocol source.

### Session: 2026-04-06 JST
**Tasks Completed**: Added paginated EPUB reading in the frontend preview layer using CSS multi-column layout, explicit next/previous controls, and workspace keyboard routing for `J/K`, arrow keys, and `Ctrl+U`/`Ctrl+D`; added frontend and desktop runtime regressions for EPUB pagination.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Verification passed with `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle`, and a real Linux Tauri runtime check against `/home/taco/Downloads/40_Algorithms_Every_Programmer_Should_Know.epub`, which advanced from `Page 1 of 784` to `Page 2 of 784`.

### Session: 2026-03-27 JST
**Tasks Completed**: Added an explicit media-failure fallback action that opens the current audio/video file in the system default application when inline playback still fails.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Local reproduction showed the target MP3 decodes in `mpv`, so the remaining failure is consistent with Linux WebKit/GStreamer inline playback limitations rather than a bad file path or broken media asset.

### Session: 2026-03-27 JST
**Tasks Completed**: Switched audio preview behavior on Linux and macOS desktop WebViews to prefer external playback instead of unreliable inline playback; kept Linux-only inline recovery for video.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: This avoids repeating the same inline audio failure mode across the two desktop WebView stacks used by Tauri in this repository while preserving embedded video where the current UX already depends on it.

### Session: 2026-03-27 JST
**Tasks Completed**: Replaced the eager MP3 decode path with a localhost media stream service for desktop audio playback, then extended the same stream-backed transport to MP4 previews so large media files use HTTP range requests for inline playback instead of direct `asset://` loading.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: The frontend preview contract now carries optional `stream_url` values for desktop audio and video previews, and Linux Tauri E2E covers both MP3 and MP4 through the localhost stream path.

### Session: 2026-04-05 20:14 JST
**Tasks Completed**: Added EPUB file preview support to the Rust viewer service and frontend file-preview union; EPUB previews now parse the archive spine, inline linked CSS and image assets as data URLs, and render through the existing HTML preview pane with a paper-style layout.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: None
**Notes**: Verification will cover repository checks plus a real Linux Tauri runtime check against an EPUB file under `~/Downloads`.
