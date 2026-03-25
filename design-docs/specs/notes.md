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
- Bare `chilla` startup without a file was removed from the first-slice command contract to keep startup behavior internally consistent.
- Cargo development variables such as `CARGO_TERM_QUIET` belong to implementation tooling, not the product CLI surface.

### Key Assumptions

- "Editor is default hidden" was interpreted as "the preview pane is hidden by default while the editor remains the primary visible pane."
- The table of contents is generated from Markdown headings only, not from arbitrary HTML headings embedded in source.
- Mermaid support applies to fenced code blocks marked for Mermaid diagrams.
- The first-slice file-type policy accepts `.md`, `.markdown`, and `.mdown` paths only.

## File Viewer Mode Notes

### Scope Additions

- `chilla` is no longer Markdown-file-only at startup; it must handle directories, Markdown files, other text files, and binary files.
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

## Linux Tauri WebDriver E2E Notes

### Goal

- Add a Linux-only desktop smoke test that drives the real Tauri window through `tauri-driver` rather than relying on browser-only mocks.
- Keep the existing browser-mode Vitest coverage for fast UI checks, but document that browser checks do not prove Tauri runtime behavior.

### Runtime Decisions

- Use `tauri-driver` as the WebDriver proxy and `WebKitWebDriver` as the Linux native backend.
- Build the app with `bun run tauri build --debug --no-bundle` before running the smoke test so the harness always targets the current code.
- Run against the real workspace root and assert that the Tauri app opens the current directory, filters to `README.md`, and renders the real Markdown preview.
- When no `DISPLAY` is available, provide an `Xvfb` fallback so Linux desktop verification can run headlessly inside the dev shell.

### Scope Boundaries

- This slice adds a smoke test and local developer workflow only.
- CI wiring and non-Linux native-driver support remain follow-up work.

### Verification Targets

- `bun run test:tauri:e2e:linux`
- `task test-tauri-e2e-linux`
- Existing browser-mode tests remain the fast path for UI-only changes.

## Browser Test Migration to Tauri E2E Notes

### Goal

- Replace the repo's browser-only Vitest suite with real Linux desktop Tauri-driver coverage.
- Keep the verification focused on behaviors that matter at the Tauri runtime boundary:
  startup path resolution, directory paging/filtering, file selection, and rendered Markdown/theme output.

### Runtime Decisions

- Use a generated temporary fixture workspace for deterministic desktop E2E instead of a browser-only fallback path.
- Launch the built Tauri binary through a temporary wrapper script so the test can pass a fixture startup path.
- Consolidate the current browser assertions into a single real-runtime suite rather than keeping one browser test file per UI slice.

### Scope Boundaries

- This slice removes the automated browser-mode test command and browser test files from the repository.
- DOM-unit tests under `src/**/*.vitest.*` remain in place for fast non-runtime coverage.
- Workspace/document behavior is no longer expected to run meaningfully in plain browser mode without the desktop runtime.

### Verification Targets

- `bun run typecheck`
- `bun run test`
- `bun run test:tauri:e2e:linux`
- `nix build .#chilla --no-link`

## Real Runtime Only Verification Notes

### Goal

- Make workspace and document behavior depend on the real Tauri runtime only.
- Keep fast unit tests only for frontend-local code that does not pretend to replace the desktop
  boundary.

### Runtime Decisions

- `src/lib/tauri/document.ts` should always call the Tauri API surface.
- Tests and UI startup checks that relied on a fake desktop boundary should be removed instead of
  rewritten around a simulated runtime.
- Real runtime validation for workspace/document startup behavior should remain in the Linux
  Tauri-driver E2E suite.

### Scope Boundaries

- This slice removes the browser-only fallback path and tests that existed only to prove that
  fallback.
- Pure helper/unit tests that do not claim to emulate desktop behavior remain allowed.
- Rust command contracts are unchanged in this slice.

### Verification Targets

- `bun run typecheck`
- `bun run test`
- `bun run test:dom`
- `bun run test:tauri:e2e:linux`

---
