# Design Notes

This document contains research findings, investigations, and miscellaneous design notes.

## Overview

Notable items that do not fit into architecture or client categories.

---

## Sections

## macOS DMG Release Notes

### Design Reference

- See `design-docs/specs/design-macos-dmg-release.md` for the release-shape decision that keeps the current Darwin tarball contract but adds a separate Tauri `app,dmg` distribution path for signed/notarized macOS builds.

## Markdown Workbench Notes

### Scope Corrections Applied

- The architecture now treats the checked-in Tauri + Bun + TypeScript structure as the current project baseline.
- The root Rust manifest is workspace-level; backend crate implementation belongs under `src-tauri/`.
- Bare `chilla` startup without a file opens the current working directory in file view mode.
- Cargo development variables such as `CARGO_TERM_QUIET` belong to implementation tooling, not the product CLI surface.

### Key Assumptions

- "Editor is default hidden" was interpreted as "the preview pane is hidden by default while the editor remains the primary visible pane."
- The table of contents is generated from Markdown headings only, not from arbitrary HTML headings embedded in source.
- Mermaid support applies to fenced code blocks marked for Mermaid diagrams.
- Markdown mode recognizes `.md`, `.markdown`, and `.mdown`; file view mode handles additional previewable file types.

## File Viewer Mode Notes

### Scope Additions

- `chilla` is no longer Markdown-file-only at startup; it must handle directories, Markdown files, other text files, and binary files.
- `chilla` also needs an explicit multi-file startup path where the left pane is constrained to only the provided filepaths.
- File type parsing is a Rust responsibility and should use a dedicated library rather than frontend sniffing.
- Binary files are previewable only as metadata/placeholders, not as rendered content.
- File view mode uses a yazi-style flat current-directory list, not a recursive tree widget.
- CSV should be promoted from generic text preview to a dedicated structured preview kind with raw/formatted switching.

### Interaction Assumptions

- The flat file list still counts as the "file tree" for product language because directory navigation preserves filesystem hierarchy through current-directory replacement.
- Multi-file startup should not pretend to be directory navigation; it should use a dedicated explicit-file-set selector view in the same left-pane slot.
- `Ctrl-M` should be treated as equivalent to Enter/confirm in the webview key handler.
- Markdown mode remains the only editable mode in this feature slice; non-Markdown files are view-only.
- CSV formatted view should not infer a schema/header row in the first slice; numeric row/column labels preserve data fidelity.
- CSV raw/formatted switching should reuse the existing source/rendered workspace control instead of introducing a CSV-only toolbar.

### Design Reference

- See `design-docs/specs/design-file-viewer-mode.md` for the detailed explicit-file-set selector design, startup contract, and left-pane behavior.
- See `design-docs/specs/design-csv-viewer.md` for CSV preview classification, payload shape, and table rendering behavior.

### Verification Targets

- Keep Bun typecheck, Vitest (`bun run test:dom`), and Cargo checks/tests/clippy aligned with Markdown parsing, heading extraction, watcher behavior, and new preview kinds such as CSV.
- Linux WebDriver smoke (`bun run test:tauri:e2e:linux`) remains the authoritative mixed-stack probe for startup roots, listing, selection, Markdown preview styling, CSV raw/formatted toggles, and explicit argv file sets (`impl-plans/completed/file-view-mixed-stack-validation.md`).

### Implementation Follow-Up

- File-view mode, CSV preview, Markdown workbench first slice, DMG packaging, mixed-stack smoke validation, and Markdown save/conflict slices are archived under `impl-plans/completed/`; see `impl-plans/README.md` for the authoritative index before extending those areas.
- New features in this surface should still start from `impl-plans/active/` plans that enumerate CLI/bootstrap, backend parsing/watch, frontend workspace behavior, task automation impacts, and every Rust/TypeScript IPC contract change.
- Mixed-stack changes should be implemented as a Tauri feature rather than isolated frontend or Rust-only work.

## EPUB Navigation Notes

### Reference Alignment

- Foliate / Foliate JS is the UX and architecture reference for this slice, specifically its TOC tree model, href-based navigation, and anchor-based relocation across repagination.
- Persisting raw page numbers would be incorrect because the current EPUB reader uses CSS multi-column pagination, so page counts change with viewport and layout.

### Design Direction

- Rust should own EPUB TOC extraction and href normalization.
- The frontend should own the last-reading-location store because it is lightweight view state and the repo already persists small UI settings in `localStorage`.
- TOC interaction for EPUB should reuse the same workspace slot and toggle behavior as Markdown instead of adding a second navigation paradigm.

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
