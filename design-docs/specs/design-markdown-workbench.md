# Markdown Workbench Design

Detailed design for the `marky` desktop Markdown viewer/editor workspace.

## Overview

This document specifies the user-facing workspace behavior and the mixed-stack responsibilities for the first usable product slice.

## Status And Scope Boundary

This is a target-state design document for the first Markdown workbench slice.

- The current repository is still the Rust-template baseline and does not yet contain the frontend or `src-tauri/` layout described here.
- This document defines the intended behavior and component boundaries after the repository is migrated into a Tauri application.
- Repository restructuring is part of the implementation scope and should not be treated as already complete.

## User Experience

### Entry Point

- Launch command: `marky {file_name}`
- Supported target: one Markdown file path per window
- Supported extensions for the first slice: `.md`, `.markdown`, `.mdown`
- Expected startup behavior:
  - open the requested file
  - show the editor immediately
  - show the table of contents by default
  - keep the preview collapsed by default
- Bare `marky` startup without a file is out of scope for the first slice.

### Workspace Layout

| Region | Default State | Purpose |
|--------|---------------|---------|
| TOC sidebar | Expanded | Jump to headings and show document structure |
| Editor | Expanded | Primary authoring surface |
| Preview sidebar | Collapsed | Rendered HTML preview and Mermaid diagrams |

Layout rules:

- The center editor always keeps a usable minimum width.
- Collapsing the TOC or preview returns width to the editor.
- Expanding preview should not reparse Markdown on the frontend; it should reveal the latest backend-rendered HTML.
- Heading jumps must navigate the preview anchor and should reveal the editor location when the chosen editor component supports line-based scroll targeting.

### Interaction Model

| Action | Result |
|--------|--------|
| Click heading in TOC | Move focus to the corresponding section |
| Toggle TOC | Collapse or expand left sidebar |
| Toggle preview | Collapse or expand right sidebar |
| Save document | Persist text and request new parsed snapshot |
| External file changes | Refresh workspace or enter conflict resolution state |

## Backend Contract

Rust returns a document snapshot object to the frontend. The exact transport types belong in implementation, but the contract should contain at least:

```text
DocumentSnapshot
- path
- file_name
- source_text
- html
- headings[]
- revision_token
- last_modified
```

Heading items should contain:

```text
HeadingNode
- level
- title
- anchor_id
- line_start
- children[]
```

Design intent:

- `anchor_id` supports preview navigation.
- `line_start` supports editor navigation.
- `revision_token` allows the frontend to detect whether a save or watcher refresh supersedes the current buffer.

## Tauri Boundary

### Commands

| Command | Purpose |
|---------|---------|
| `open_document` | Load a Markdown file and return a full snapshot |
| `save_document` | Persist source text and return a refreshed snapshot |
| `reload_document` | Manually refresh from disk when needed |

Watcher subscription is backend lifecycle wiring, not a user-facing command contract. The active document should begin watching automatically after open.

### Events

| Event | Producer | Purpose |
|-------|----------|---------|
| `document_refreshed` | Rust | External file update produced a new snapshot |
| `document_conflict` | Rust or frontend policy layer | External change arrived while the editor was dirty |

## Rendering Strategy

### Markdown HTML

- Rust is the single Markdown parser.
- The frontend receives already-rendered HTML and does not run a separate Markdown parser.
- Preview rendering should sanitize or otherwise constrain HTML according to the selected Rust parser configuration and threat model agreed during implementation planning.

### Mermaid

- Mermaid code fences remain detectable in Rust-generated HTML.
- The frontend runs Mermaid after preview DOM updates.
- Mermaid rendering should be skipped when preview is collapsed.
- Expanding preview should trigger Mermaid enhancement against the current DOM once.

## File Synchronization

### Local Save

1. User edits text in the editor.
2. Frontend marks buffer dirty.
3. Save sends full text content to Rust.
4. Rust writes the file, reparses Markdown, extracts headings, and returns a new snapshot.
5. Frontend updates editor baseline, TOC, and preview.

### External Modification

1. Watcher detects a file-system event for the active file.
2. Rust reads the latest content and reparses it.
3. If the editor is clean, frontend adopts the new snapshot.
4. If the editor is dirty, the app shows a conflict prompt or banner before overwriting.

## Tooling Expectations

### Frontend

- Framework: Solid.js
- Package manager/runtime: Bun
- Typecheck/test commands should prefer project Bun scripts

### Desktop / Backend

- Framework: Tauri
- Rust handles parsing, watching, and filesystem operations

### Repository Tasks

Target-state `go-task` automation should provide at minimum:

- `task dev`: run the Tauri development workflow
- `task build`: build the desktop application and frontend assets
- `task test`: run Bun verification plus Cargo verification

Current-state note:

- The checked-in `Taskfile.yml` still exposes Cargo-only tasks.
- Adding Bun and Tauri task flows is part of the migration work implied by this design.

## Assumptions

- The first iteration targets a single open document per app window.
- Preview being "default hidden" means the right preview panel starts collapsed, not removed from the product.
- HTML rendering and Mermaid hydration occur only inside the desktop webview, not in a separate browser service.

## References

See `design-docs/references/README.md` for external references.
