# Architecture Design

This document describes system architecture and design decisions.

## Overview

Architectural patterns, system structure, and technical decisions.

---

## Sections

## Markdown Workbench Architecture

This section defines the target architecture for the desktop Markdown viewer/editor experience.

### Repository Baseline And Migration Context

The repository is still on the Rust-template baseline today:

- Rust binary and library code live under the root `src/` directory.
- `Taskfile.yml` currently exposes Cargo-oriented tasks only.
- Frontend and Tauri directories such as `package.json` and `src-tauri/` have not been introduced yet.

This design therefore describes the target mixed-stack architecture and the migration direction from the current baseline. Statements about `src/` frontend code, `src-tauri/`, Bun, and Tauri should be read as target-state design, not as a claim that those pieces already exist in the worktree.

### Product Scope

- `chilla {file_name}` opens a Markdown file directly into the desktop workbench.
- The main workspace is a three-column layout:
  - Left: collapsible table of contents generated from Markdown headings
  - Center: Markdown editor
  - Right: rendered Markdown preview
- The preview column is collapsed by default.
- The table of contents column can also be collapsed and expanded at runtime.
- File changes on disk are detected in real time and refresh the workspace when the editor is clean.
- If the editor has unsaved changes, an external file update enters an explicit conflict state instead of silently overwriting the buffer.
- Mermaid code blocks are supported in preview output and rendered on the frontend side after HTML is injected.

### Architecture Summary

The target application is a mixed Tauri desktop system with clear responsibility boundaries:

- Rust in `src-tauri/` owns file I/O, file watching, Markdown parsing, heading extraction, and CLI/bootstrap behavior.
- Solid.js in `src/` owns window layout, editor interactions, panel state, keyboard shortcuts, and Mermaid rendering orchestration.
- Tauri commands and events form the boundary between frontend state and backend processing.
- Bun is the frontend package manager and task runner for TypeScript-oriented scripts.
- `go-task` will provide repository-level `build`, `test`, and `dev` entry points that orchestrate Cargo and Bun workflows together after the mixed-stack migration is in place.

### Major Runtime Components

| Component | Stack | Responsibility |
|-----------|-------|----------------|
| CLI/bootstrap | Rust | Parse `chilla {file_name}`, validate path, launch Tauri app with initial document context |
| Document service | Rust | Load Markdown file, normalize metadata, persist editor writes, expose current document snapshot |
| Markdown pipeline | Rust | Convert Markdown to HTML, extract heading tree, derive stable anchor identifiers |
| File watch service | Rust | Detect external file modifications and emit refresh events to the frontend |
| Tauri IPC boundary | Rust + TypeScript | Commands for open/save/reload and events for file refresh state |
| Workspace shell | Solid.js | Three-column layout, collapse state, resize state, status banners, and routing of user actions |
| Editor pane | Solid.js | Text editing surface, dirty-state tracking, save triggers, and cursor/selection behavior |
| Preview pane | Solid.js | Display sanitized HTML, dispatch Mermaid enhancement, and support heading anchor navigation |
| TOC pane | Solid.js | Render heading tree, allow jump-to-heading, support collapse and active heading highlight |

### Transition Plan Constraints

The architecture has to support a staged migration from the current Rust-only scaffold.

- Root-level Rust bootstrap can remain temporarily while the Tauri backend is introduced.
- The frontend `src/` tree should only be repurposed after the current Rust sources move under `src-tauri/` or another backend location.
- Task automation should not claim Bun or Tauri support until the corresponding manifests and scripts exist.
- Implementation plans should treat repository restructuring as a first-class deliverable, not an incidental cleanup.

### Data Flow

#### Initial Open

1. The CLI receives a Markdown path from `chilla {file_name}`.
2. Rust validates the path and passes it into the Tauri app as initial state.
3. The document service reads file content.
4. The Markdown pipeline returns:
   - source text
   - rendered HTML
   - parsed heading tree
   - document metadata such as path and last modified time
5. The frontend initializes the workspace with editor content visible, TOC visible, and preview collapsed.

#### Local Edit Flow

1. The user edits the document in the center pane.
2. Frontend state marks the document dirty immediately.
3. Save actions invoke a Rust command that persists the content.
4. After save completes, Rust re-runs Markdown and TOC parsing and returns an updated snapshot.
5. The frontend refreshes the TOC and preview from the latest parsed result.

#### External File Change Flow

1. Rust file watching subscribes to the opened file path.
2. When the file changes on disk, Rust reloads the file contents.
3. Rust re-runs HTML generation and heading extraction.
4. Rust emits either a refreshed snapshot event or a conflict signal, depending on whether the frontend buffer is still clean.
5. The frontend either updates the editor, TOC, and preview in one state transition or surfaces a conflict state without overwriting in-progress edits.

### UI State Model

The frontend keeps only presentation state and in-progress editing state. Parsed document state is treated as backend-authored data.

| State | Owner | Notes |
|-------|-------|-------|
| Current file path | Rust + frontend mirror | Rust is source of truth |
| Editor text | Frontend | Becomes Rust-authored again after save or external reload |
| Rendered HTML | Rust | Returned as part of document snapshot |
| Heading tree | Rust | Returned as structured TOC data |
| Preview visibility | Frontend | Default `false` on first open |
| TOC visibility | Frontend | Default `true` on first open |
| Panel widths | Frontend | Persist locally per window if desired |
| Dirty state | Frontend | Cleared on successful save or external reload resolution |

### Markdown and TOC Parsing

Rust performs Markdown parsing to minimize duplicate parsing logic and keep expensive transformations close to the file-watch and persistence layers.

Design constraints:

- One parser pipeline should produce both rendered HTML and heading metadata from the same source text.
- Heading identifiers must be deterministic so TOC navigation and preview anchors remain stable.
- The output sent to the frontend should be structured enough to avoid reparsing headings in JavaScript.
- Parser selection must support fenced code blocks and preserve Mermaid code blocks for later frontend rendering.

### Mermaid Rendering Strategy

Mermaid rendering remains a frontend concern because diagram hydration occurs inside the webview.

Flow:

1. Rust converts Markdown code fences into HTML that preserves Mermaid code blocks in a detectable form.
2. The preview pane inserts the HTML into the DOM.
3. Frontend code scans for Mermaid-marked blocks after preview mount/update.
4. Mermaid JavaScript renders diagrams in place.

This split keeps Markdown parsing fast in Rust while allowing diagram rendering to use browser APIs.

### File Watch and Refresh Policy

The backend watches the active document path only.

Expected behavior:

- External file changes trigger a full document snapshot refresh.
- Refresh events should be debounced to avoid duplicate redraws from bursty editor writes.
- If the local editor is dirty when an external change arrives, the frontend should surface a conflict state instead of silently overwriting user input.
- Reload, overwrite, and save-retry behavior should be part of later implementation planning, but the architecture assumes explicit conflict handling.

### Performance Expectations

- Initial open should complete Markdown parse and TOC extraction in a single backend pass.
- Preview refresh after save or external change should avoid frontend reparsing of Markdown.
- Large documents should degrade primarily in editor rendering cost, not in TOC extraction cost.
- File watch event handling should avoid triggering redundant Mermaid rerenders when the preview is hidden.

### Suggested Project Structure

Current baseline:

```text
src/
  lib.rs
  main.rs
Taskfile.yml
Cargo.toml
```

Target layout after migration:

```text
src/
  app/
  components/
  features/workspace/
  features/editor/
  features/preview/
  features/toc/
  lib/tauri/
src-tauri/
  src/
    cli/
    commands/
    document/
    markdown/
    watcher/
```

### Supporting Spec

See `design-docs/specs/design-markdown-workbench.md` for the detailed workspace behavior, event contract, and implementation-oriented design notes.
See `design-docs/specs/design-file-viewer-mode.md` for the file browser, startup-mode, and typed file preview contract.
See `design-docs/specs/design-epub-navigation.md` for EPUB TOC extraction, reader navigation, and reading-location persistence.

---
