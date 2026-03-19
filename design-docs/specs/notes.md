# Design Notes

This document contains research findings, investigations, and miscellaneous design notes.

## Overview

Notable items that do not fit into architecture or client categories.

---

## Sections

## Markdown Workbench Notes

### Scope Corrections Applied

- The architecture documents a target Tauri + Bun + TypeScript application, not the current checked-in repository shape.
- The current repository still reflects the Rust-template baseline, so migration work has to be planned explicitly.
- Bare `marky` startup without a file was removed from the first-slice command contract to keep startup behavior internally consistent.
- Cargo development variables such as `CARGO_TERM_QUIET` belong to implementation tooling, not the product CLI surface.

### Key Assumptions

- "Editor is default hidden" was interpreted as "the preview pane is hidden by default while the editor remains the primary visible pane."
- The table of contents is generated from Markdown headings only, not from arbitrary HTML headings embedded in source.
- Mermaid support applies to fenced code blocks marked for Mermaid diagrams.
- The first-slice file-type policy accepts `.md`, `.markdown`, and `.mdown` paths only.

## File Viewer Mode Notes

### Scope Additions

- `marky` is no longer Markdown-file-only at startup; it must handle directories, Markdown files, other text files, and binary files.
- File type parsing is a Rust responsibility and should use a dedicated library rather than frontend sniffing.
- Binary files are previewable only as metadata/placeholders, not as rendered content.
- File view mode uses a yazi-style flat current-directory list, not a recursive tree widget.

### Interaction Assumptions

- The flat file list still counts as the "file tree" for product language because directory navigation preserves filesystem hierarchy through current-directory replacement.
- `Ctrl-M` should be treated as equivalent to Enter/confirm in the webview key handler.
- Markdown mode remains the only editable mode in this feature slice; non-Markdown files are view-only.

### Verification Targets For Later Implementation

- Bun typecheck and frontend tests for Solid.js workspace behavior
- Cargo checks and tests for Markdown parsing, heading extraction, and file watcher behavior
- Mixed-stack validation that Tauri events keep editor, TOC, preview, and file-view selection in sync

### Implementation Follow-Up

- Before coding begins, create an implementation plan under `impl-plans/active/` covering repository migration, CLI/bootstrap, backend parsing/watch services, frontend workspace layout, and task automation.
- Mixed-stack changes should be implemented as a Tauri feature rather than isolated frontend or Rust-only work.
- The implementation plan should include when `src/` is repurposed for frontend code and where the current Rust crate is relocated.

---
