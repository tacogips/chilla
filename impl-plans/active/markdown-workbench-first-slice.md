# Markdown Workbench First Slice Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-markdown-workbench.md`
**Created**: 2026-03-19
**Last Updated**: 2026-03-19

---

## Design Document Reference

**Primary Source**: `design-docs/specs/design-markdown-workbench.md`

**Supporting Sources**:
- `design-docs/specs/architecture.md#markdown-workbench-architecture`
- `design-docs/specs/command.md#startup-contract`
- `design-docs/specs/notes.md#markdown-workbench-notes`

### Summary
Implement the first usable `marky` product slice as a Tauri + Bun desktop Markdown workbench. The plan covers repository migration from the current Rust-only scaffold, direct file-open CLI startup, backend parsing and file watching, and a Solid.js workspace with TOC, editor, and preview panes.

### Scope
**Included**:
- migrate the repository from the Rust template baseline into the target mixed-stack layout
- preserve `marky <file_name>` as the only first-slice document-open flow
- implement Rust-owned document loading, saving, Markdown rendering, heading extraction, and file watching
- implement Tauri commands/events for open, save, reload, refresh, and conflict signaling
- implement the frontend workspace shell with default TOC-open and preview-collapsed behavior
- add Bun/Tauri-aware `task` automation and mixed-stack verification commands

**Excluded**:
- bare `marky` startup without an initial file
- multi-document or recent-files workflows
- export flows, browser mode, or non-desktop targets
- advanced merge tooling for conflict resolution beyond explicit conflict state and manual reload/save retry paths

---

## Modules And Contracts

### 1. Shared Document Contract

#### `src-tauri/src/document/types.rs`

**Status**: NOT_STARTED

```rust
pub type RevisionToken = String;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocumentSnapshot {
    pub path: String,
    pub file_name: String,
    pub source_text: String,
    pub html: String,
    pub headings: Vec<HeadingNode>,
    pub revision_token: RevisionToken,
    pub last_modified: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HeadingNode {
    pub level: u8,
    pub title: String,
    pub anchor_id: String,
    pub line_start: usize,
    pub children: Vec<HeadingNode>,
}
```

#### `src/lib/tauri/document.ts`

**Status**: NOT_STARTED

```ts
export type RevisionToken = string;

export interface HeadingNode {
  level: number;
  title: string;
  anchor_id: string;
  line_start: number;
  children: HeadingNode[];
}

export interface DocumentSnapshot {
  path: string;
  file_name: string;
  source_text: string;
  html: string;
  headings: HeadingNode[];
  revision_token: RevisionToken;
  last_modified: string;
}
```

### 2. Backend Bootstrap And Command Surface

#### `src-tauri/src/cli/mod.rs`
#### `src-tauri/src/commands/document.rs`
#### `src-tauri/src/main.rs`

**Status**: NOT_STARTED

```rust
pub struct CliArgs {
    pub file_name: std::path::PathBuf,
}

pub fn parse_cli() -> anyhow::Result<CliArgs>;

#[tauri::command]
pub async fn open_document(path: String) -> Result<DocumentSnapshot, String>;

#[tauri::command]
pub async fn save_document(path: String, source_text: String) -> Result<DocumentSnapshot, String>;

#[tauri::command]
pub async fn reload_document(path: String) -> Result<DocumentSnapshot, String>;
```

### 3. Backend Document Pipeline

#### `src-tauri/src/document/service.rs`
#### `src-tauri/src/markdown/mod.rs`

**Status**: NOT_STARTED

```rust
pub struct DocumentService;

impl DocumentService {
    pub async fn open(&self, path: &std::path::Path) -> anyhow::Result<DocumentSnapshot>;
    pub async fn save(&self, path: &std::path::Path, source_text: &str) -> anyhow::Result<DocumentSnapshot>;
    pub async fn reload(&self, path: &std::path::Path) -> anyhow::Result<DocumentSnapshot>;
}

pub fn render_markdown(source_text: &str) -> anyhow::Result<RenderedDocument>;

pub struct RenderedDocument {
    pub html: String,
    pub headings: Vec<HeadingNode>,
}
```

### 4. Watcher And Refresh Events

#### `src-tauri/src/watcher/service.rs`
#### `src-tauri/src/events.rs`

**Status**: NOT_STARTED

```rust
pub const DOCUMENT_REFRESHED_EVENT: &str = "document_refreshed";
pub const DOCUMENT_CONFLICT_EVENT: &str = "document_conflict";

pub struct WatcherService;

impl WatcherService {
    pub async fn watch_active_document(&self, path: std::path::PathBuf) -> anyhow::Result<()>;
    pub async fn stop(&self) -> anyhow::Result<()>;
}
```

### 5. Frontend Workspace Shell

#### `src/app/App.tsx`
#### `src/features/workspace/state.ts`
#### `src/features/editor/EditorPane.tsx`
#### `src/features/preview/PreviewPane.tsx`
#### `src/features/toc/TocPane.tsx`

**Status**: NOT_STARTED

```ts
export interface WorkspaceViewState {
  isDirty: boolean;
  isPreviewOpen: boolean;
  isTocOpen: boolean;
  activeSnapshot: DocumentSnapshot | null;
  conflictSnapshot: DocumentSnapshot | null;
}

export interface WorkspaceActions {
  loadInitialDocument(): Promise<void>;
  saveDocument(sourceText: string): Promise<void>;
  reloadDocument(): Promise<void>;
  setPreviewOpen(next: boolean): void;
  setTocOpen(next: boolean): void;
}
```

### 6. Tooling And Repository Layout

#### `package.json`
#### `tsconfig.json`
#### `src-tauri/Cargo.toml`
#### `Taskfile.yml`

**Status**: NOT_STARTED

Required repository outcomes:
- current root Rust crate sources are relocated under `src-tauri/src/`
- root `src/` is repurposed for the frontend application
- Bun scripts exist for dev, build, typecheck, and test
- `task dev`, `task build`, and `task test` orchestrate mixed-stack workflows

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Shared document contract | `src-tauri/src/document/types.rs`, `src/lib/tauri/document.ts` | COMPLETED | Cargo + Bun |
| CLI/bootstrap and Tauri commands | `src-tauri/src/cli/`, `src-tauri/src/commands/` | COMPLETED | Cargo |
| Markdown parsing and document service | `src-tauri/src/document/`, `src-tauri/src/markdown/` | COMPLETED | Cargo |
| Watcher and refresh events | `src-tauri/src/watcher/`, `src-tauri/src/events.rs` | COMPLETED | Cargo |
| Workspace shell and panes | `src/app/`, `src/features/` | COMPLETED | Bun |
| Tooling and repository migration | `package.json`, `src-tauri/`, `Taskfile.yml` | COMPLETED | Nix + task |

## Implementation Tasks

### TASK-001: Repository Migration And Mixed-Stack Scaffold
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `package.json`, `bun.lock*`, `tsconfig.json`, `src/`, `src-tauri/`, updated root `Cargo.toml` or workspace manifest, updated `Taskfile.yml`

**Completion Criteria**:
- [x] target directory layout exists with `src/` for frontend and `src-tauri/` for backend
- [x] current placeholder Rust sources are relocated or replaced without leaving duplicate entrypoints
- [x] Bun and Tauri manifests are introduced without breaking repository task entrypoints
- [x] migration notes are captured in the progress log during execution

### TASK-002: Shared Contract And Markdown Pipeline
**Status**: COMPLETED
**Parallelizable**: Yes
**Depends On**: `TASK-001`
**Deliverables**: `src-tauri/src/document/types.rs`, `src-tauri/src/document/service.rs`, `src-tauri/src/markdown/mod.rs`, `src/lib/tauri/document.ts`

**Completion Criteria**:
- [x] `DocumentSnapshot` and `HeadingNode` exist on both Rust and TypeScript sides
- [x] one Rust parsing pass produces both HTML and heading metadata
- [x] heading anchors are deterministic and compatible with TOC navigation
- [x] parser output preserves Mermaid blocks for frontend enhancement

### TASK-003: CLI Bootstrap And Tauri Commands
**Status**: COMPLETED
**Parallelizable**: Yes
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src-tauri/src/main.rs`, `src-tauri/src/cli/mod.rs`, `src-tauri/src/commands/document.rs`, `src-tauri/src/state.rs`

**Completion Criteria**:
- [x] `marky <file_name>` is the only first-slice open flow
- [x] unsupported or unreadable paths fail before the desktop window opens
- [x] `open_document`, `save_document`, and `reload_document` return refreshed snapshots
- [x] CLI behavior aligns with the exit-code and extension policy in `command.md`

### TASK-004: Frontend Workspace Shell And Pane Integration
**Status**: COMPLETED
**Parallelizable**: Yes
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src/app/App.tsx`, `src/features/workspace/*`, `src/features/editor/*`, `src/features/preview/*`, `src/features/toc/*`

**Completion Criteria**:
- [x] initial workspace loads editor and TOC immediately
- [x] preview starts collapsed and can be toggled without frontend Markdown reparsing
- [x] TOC renders backend heading data and supports heading jumps
- [x] save flow updates editor baseline, TOC, and preview from the returned snapshot
- [x] Mermaid enhancement only runs when preview content is visible

### TASK-005: Watcher Refresh And Conflict State
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-002`, `TASK-003`, `TASK-004`
**Deliverables**: `src-tauri/src/watcher/service.rs`, `src-tauri/src/events.rs`, frontend event listeners under `src/features/workspace/`

**Completion Criteria**:
- [x] active document is watched automatically after open
- [x] debounced external refreshes update the workspace when the editor is clean
- [x] dirty editor state produces explicit conflict UI instead of silent overwrite
- [x] manual reload path is available after conflict signaling

### TASK-006: Task Automation And Mixed-Stack Verification
**Status**: IN_PROGRESS
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`, `TASK-003`, `TASK-004`, `TASK-005`
**Deliverables**: updated `Taskfile.yml`, frontend verification scripts, backend verification commands, plan progress updates

**Completion Criteria**:
- [ ] `task dev` runs the Tauri development workflow
- [x] `task build` builds frontend assets and desktop application
- [x] `task test` runs Bun verification and Cargo verification
- [x] verification guidance uses `CARGO_TERM_QUIET=true` for Cargo commands
- [x] mixed-stack checks cover command flow, parsing, watcher behavior, and workspace UI state

---

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-001 Repository migration | - | COMPLETED |
| TASK-002 Shared contract and markdown pipeline | TASK-001 | COMPLETED |
| TASK-003 CLI bootstrap and Tauri commands | TASK-001, TASK-002 | COMPLETED |
| TASK-004 Frontend workspace shell | TASK-001, TASK-002 | COMPLETED |
| TASK-005 Watcher refresh and conflict flow | TASK-002, TASK-003, TASK-004 | COMPLETED |
| TASK-006 Task automation and verification | TASK-001 through TASK-005 | IN_PROGRESS |

## Completion Criteria

- [x] repository matches the target mixed-stack layout described in the design docs
- [ ] direct open flow `marky <file_name>` works for `.md`, `.markdown`, and `.mdown`
- [x] backend owns parsing, heading extraction, persistence, and file watching
- [x] frontend owns layout, dirty state, pane toggles, TOC rendering, and Mermaid hydration
- [ ] external file changes refresh clean buffers and surface conflicts for dirty buffers
- [x] Bun and Cargo verification both pass through repository-level task entrypoints

## Progress Log

### Session: 2026-03-19 12:26 JST
**Tasks Completed**: Created initial implementation plan from the Markdown workbench design set
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Plan deliberately treats repository migration as the first task because the current worktree is still the Rust-template baseline.

### Session: 2026-03-19 13:40 JST
**Tasks Completed**: TASK-001 through TASK-005, plus most of TASK-006
**Tasks In Progress**: TASK-006 runtime smoke validation
**Blockers**: `task dev` and live external-file watcher behavior still need an interactive desktop run
**Notes**: Implemented the Tauri/Bun migration, CLI/bootstrap validation, Rust Markdown pipeline, refresh watcher, frontend workspace shell, Mermaid hydration, Nix shell updates, and verified `bun run typecheck`, `bun run test`, `cargo check`, `cargo test`, `cargo clippy`, `task test`, and `task build` via `nix develop`.

### Session: 2026-03-19 14:25 JST
**Tasks Completed**: Review-driven fixes for frontend workspace interaction regressions
**Tasks In Progress**: TASK-006 runtime smoke validation
**Blockers**: `task dev` and live external-file watcher behavior still need an interactive desktop run
**Notes**: Fixed the TOC jump-to-line editor effect so it only runs when the requested heading changes, fixed Mermaid hydration so preview updates re-render diagrams while the preview remains open, hardened Tauri event-listener cleanup during mount/unmount races, and reverified `bun run typecheck`, `bun run test`, `bun run build`, `CARGO_TERM_QUIET=true cargo test`, and `task test` via `nix develop`.

### Session: 2026-03-19 15:20 JST
**Tasks Completed**: Follow-up Markdown preview media and URL handling improvements
**Tasks In Progress**: TASK-006 runtime smoke validation
**Blockers**: External-link opening and local media rendering still need an interactive desktop smoke check in a real Tauri window
**Notes**: Added Markdown autolinking, video-file rendering from Markdown media syntax, preview-side local asset URL rewriting relative to the open document, and default-browser opening for external links via the Tauri opener plugin. Added Rust renderer tests and Bun helper tests, with full mixed-stack verification to follow.

## Related Plans

- **Previous**: None
- **Next**: None
- **Depends On**: None
