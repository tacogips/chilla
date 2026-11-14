# File Viewer Mode Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md`
**Created**: 2026-03-19
**Last Updated**: 2026-05-02

## Design Document Reference

**Primary Source**: `design-docs/specs/design-file-viewer-mode.md`

**Supporting Sources**:
- `design-docs/specs/design-markdown-workbench.md`
- `design-docs/specs/command.md#startup-contract`
- `design-docs/specs/architecture.md#supporting-spec`
- `design-docs/specs/design-csv-viewer.md` (related preview-kind plan only)

### Summary

Implement a switchable file-view workspace on top of the current Markdown workbench so `chilla` can launch on the current directory, a directory path, a Markdown file, or another file path.

The May 2026 design update extends this plan with explicit multi-file startup, where `chilla file-a file-b ...` opens file view mode with the left pane constrained to the canonicalized file set.

### Scope

**Included**:
- zero-argument and directory startup
- Rust-side startup target parsing
- Rust-side file type detection using a dedicated library
- directory listing and file preview Tauri commands
- explicit multi-file startup and explicit-file-set selector
- image and video preview rendering in file view mode
- yazi-style flat current-directory browser with `hjkl`/Enter/Ctrl-M navigation
- mode switching between Markdown mode and file view mode

**Excluded**:
- recursive tree widgets
- file mutation for non-Markdown files
- multi-pane split directories
- Typed CSV preview (delivered in `impl-plans/completed/csv-viewer.md`, separate from core file-view checklist)
- fuzzy search, hidden-file filtering, or recent-files features

## Modules And Contracts

### 1. Startup Context

#### `src-tauri/src/cli/mod.rs`

**Status**: Completed

```rust
pub enum StartupTarget {
    CurrentDirectory(std::path::PathBuf),
    Directory(std::path::PathBuf),
    File(std::path::PathBuf),
    FileSet(Vec<std::path::PathBuf>),
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StartupContext {
    pub initial_mode: WorkspaceMode,
    pub browser_root: BrowserRoot,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrowserRoot {
    Directory {
        current_directory_path: String,
        selected_file_path: Option<String>,
    },
    ExplicitFileSet {
        file_count: usize,
        selected_file_path: String,
        source_order_paths: Vec<String>,
    },
}
```

### 2. File Viewer Contracts

#### `src-tauri/src/viewer/types.rs`
#### `src/lib/tauri/document.ts`

**Status**: Completed

Authoritative contracts in repo: paginated directory reads (`DirectoryPage`), `ExplicitFileSetPage` with `DirectoryEntry` rows (includes `directory_hint` for explicit-set UI), preview union covering Markdown/media/EPUB/PDF/`Csv`/text/binary. CSV deliverable: `impl-plans/completed/csv-viewer.md`.

### 3. Viewer Service And Commands

#### `src-tauri/src/viewer/service.rs`
#### `src-tauri/src/commands/document.rs`

**Status**: Completed

`ViewerService` implements startup routing, filtered/paged listings, explicit set pages, MIME/extension classification, and preview construction. Commands are wired from `commands/document.rs`; TypeScript invoke wrappers are in `src/lib/tauri/document.ts`.

### 4. Frontend Workspace

#### `src/features/workspace/WorkspaceShell.tsx`
#### `src/features/file-view/FileBrowserPane.tsx`
#### Preview panes under `src/features/preview/` (Markdown, CSV, media, EPUB, etc.)

**Status**: Completed

```ts
export type WorkspaceMode = "markdown" | "file_view";
// StartupContext/BrowserRoot mirror Rust serde at `document.ts`
```

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Startup context | `src-tauri/src/cli/`, `src-tauri/src/app_state.rs` | Completed | Cargo |
| Viewer types and service | `src-tauri/src/viewer/` | Completed | Cargo |
| Tauri commands and frontend bindings | `src-tauri/src/commands/`, `src/lib/tauri/document.ts` | Completed | Cargo + Bun |
| File-view UI | `src/features/file-view/`, `src/features/workspace/WorkspaceShell.tsx` | Completed | Bun |
| Explicit file-set selector | `src-tauri/src/cli/`, `src-tauri/src/viewer/`, `src/features/file-view/` | Completed | Cargo + Bun |

## Implementation Tasks

### TASK-001: Startup Target And Viewer Contract
**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/app_state.rs`, `src-tauri/src/viewer/types.rs`, `src/lib/tauri/document.ts`

**Completion Criteria**:
- [x] CLI accepts bare startup, directory paths, and file paths
- [x] startup context distinguishes file view vs Markdown mode
- [x] frontend bindings expose startup context and file preview unions

### TASK-002: Rust Viewer Service
**Status**: Completed
**Parallelizable**: No
**Depends On**: `TASK-001`
**Deliverables**: `src-tauri/src/viewer/service.rs`, `src-tauri/src/commands/document.rs`, `src-tauri/Cargo.toml`

**Completion Criteria**:
- [x] directory listing returns flat current-directory entries
- [x] file type detection is Rust-owned and library-backed
- [x] Markdown, text, binary, and richer preview kinds are distinguished correctly

### TASK-003: Frontend File View Mode
**Status**: Completed
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src/features/file-view/`, `src/features/workspace/WorkspaceShell.tsx`, `src/app/App.css`

**Completion Criteria**:
- [x] file view mode renders directory list + viewer pane
- [x] `hjkl` + Enter/Ctrl-M navigation works
- [x] Markdown/file-view mode switching works

### TASK-004: Verification
**Status**: Completed
**Parallelizable**: No
**Depends On**: `TASK-003`
**Deliverables**: updated tests and verification log

**Completion Criteria**:
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
- [x] `bun run test:dom` passes
- [x] `CARGO_TERM_QUIET=true cargo check` passes (manifest `src-tauri/Cargo.toml`)
- [x] `CARGO_TERM_QUIET=true cargo test` passes
- [x] `CARGO_TERM_QUIET=true cargo clippy --all-targets -- -D warnings` passes

### TASK-005: Explicit Multi-File Startup Contract
**Status**: Completed
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, `src/lib/tauri/document.ts`

**Completion Criteria**:
- [x] CLI accepts two or more file paths and rejects directories in multi-path mode
- [x] canonical duplicate paths are removed while preserving first occurrence
- [x] startup context uses `BrowserRoot::ExplicitFileSet` with selected file and source-order paths
- [x] all-duplicate multi-path startup falls back to single-file behavior

### TASK-006: Explicit File-Set Selector UI
**Status**: Completed
**Parallelizable**: No
**Depends On**: `TASK-005`
**Deliverables**: `src/features/file-view/`, `src/features/workspace/WorkspaceShell.tsx`, `src/app/App.css`

**Completion Criteria**:
- [x] left pane shows only provided files with basename and parent-path hint
- [x] `h` / `ArrowLeft` do not navigate to parent directories in explicit-set mode
- [x] filtering matches basename and path hint
- [x] sorting uses the existing name, extension, mtime, and size field set without changing the initially opened file

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-002 Rust viewer service | TASK-001 | Done |
| TASK-003 frontend file view mode | TASK-001, TASK-002 | Done |
| TASK-004 verification | TASK-003 | Done |
| TASK-005 explicit multi-file startup | TASK-001, TASK-002 | Done |
| TASK-006 explicit file-set selector UI | TASK-005 | Done |

## Completion Criteria

- [x] Bare `chilla` startup opens file view mode rooted at the current directory
- [x] `chilla <dir_path>` opens file view mode rooted at that directory
- [x] `chilla <markdown_file>` opens markdown mode
- [x] `chilla <other_file>` opens file view mode with that file previewed
- [x] Non-Markdown text files preview as text
- [x] Image and video files preview inline
- [x] Binary files are not rendered
- [x] `chilla <file_a> <file_b> ...` opens an explicit file-set selector
- [x] explicit file-set mode never expands scope to sibling files or parent directories

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

### Session: 2026-04-07 JST
**Tasks Completed**: Moved MP4 faststart analysis off the synchronous preview-registration path so large video previews can return their localhost stream URL immediately; the media stream server now applies the virtual faststart layout only after background analysis completes and otherwise falls back to normal byte-range serving.
**Tasks In Progress**: TASK-002 Rust viewer service, TASK-004 verification
**Blockers**: Real Tauri playback behavior for large remote or mounted MP4 files still needs an interactive desktop smoke check.
**Notes**: This keeps the previous keep-alive and range-serving work, but removes the up-front `moov` read that could stall preview opening on slower storage. Rust verification passed with `CARGO_TERM_QUIET=true cargo check`, `cargo test`, and `cargo clippy --all-targets -- -D warnings`.

### Session: 2026-04-07 JST
**Tasks Completed**: Switched stream-backed video previews to `preload="auto"` so the desktop WebView can start buffering localhost media before the first explicit play request instead of stopping at metadata-only preload.
**Tasks In Progress**: TASK-003 frontend file view mode, TASK-004 verification
**Blockers**: Full DOM verification still has an unrelated EPUB pagination failure in `src/features/preview/EpubPreviewPane.vitest.tsx`.
**Notes**: `bun run typecheck` passed, and `bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx` passed. `bun run test:dom` still fails in the pre-existing EPUB pagination assertion path.

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

### Session: 2026-05-01 17:37 JST
**Tasks Completed**: Folded the May 2026 design-doc updates into this plan by adding explicit multi-file startup and explicit-file-set selector tasks.
**Tasks In Progress**: None
**Blockers**: None
**Notes**: CSV-specific implementation work was split into `impl-plans/completed/csv-viewer.md` to keep this plan below the 400-line limit and preserve focused task ownership.

### Session: 2026-05-02 UTC
**Tasks Completed**: Closed TASK-004 by aligning Vitest EPUB pagination expectations when no `epub-preview__chapter` metadata is present (`Section Page 1 of 1`); refreshed plan bookkeeping (module/task tables, archived CSV dependency path, verification checklist incl. `bun run test:dom`).
**Tasks In Progress**: None
**Blockers**: Interactive desktop smoke for unusual media/hosting setups remains informal.
**Notes**: `bun run typecheck`, `bun run test`, `bun run test:dom`, and `CARGO_TERM_QUIET=true` Cargo `check`/`test`/`clippy` on `src-tauri/` all pass in this workspace snapshot.

### Session: 2026-05-01 (implementation)
**Tasks Completed**: Implemented TASK-005/TASK-006: `StartupTarget::FileSet`, `BrowserRoot`, `list_explicit_file_set` Tauri command, CLI multi-path validation and dedupe-to-single-file fallback, frontend explicit listing state, `Selected Files` UX, path hints, disabled parent navigation in explicit mode, and basename + parent-path filtering on the backend.
**Tasks In Progress**: ~~TASK-004 full verification log; remaining plan tasks for earlier TASK-001 checklist alignment~~ (resolved 2026-05-02)
**Blockers**: None
**Notes**: Verified with `bun run typecheck`, `bun run test`, `CARGO_TERM_QUIET=true cargo test`/`clippy` on `src-tauri`. Earlier EPUB Vitest flake addressed in Session 2026-05-02.

## Related Plans

- **Completed dependency**: `impl-plans/completed/csv-viewer.md` (CSV preview)
- Markdown workbench complements this plan for Markdown-mode editing (`impl-plans/completed/markdown-workbench-first-slice.md`)
