# Source Preview Layout Implementation Plan

**Status**: Completed
**Design Reference**: [Content-first source preview](../../design-docs/specs/design-source-preview-layout.md)
**Created**: 2026-09-09

## Deliverables

- Backend source/CSV HTML footer markup in src-tauri/src/viewer/service.rs with regression tests.
- Explicit source layout mode, source-only CSS, and wiring/tests in frontend preview/workspace components.
- Minimal metadata, maximal code area, preserved source/encoding warnings, and code-only zoom.
- Independent mixed-stack verification and rebuilt desktop launch.

## Tasks

### TASK-001: Backend compact footer
**Status**: Completed
**Parallelizable**: Yes
- [x] Move source metadata after highlighted content into semantic footer.
- [x] Retain essential language/size and encoding warnings; preserve escaped source.
- [x] Update viewer service regression tests.

### TASK-002: Frontend content-first layout
**Status**: Completed
**Parallelizable**: Yes
- [x] Explicit text/raw-CSV layout mode; no extra full-HTML parsing.
- [x] Single scroll area, small source inset, full pane width/height, compact footer.
- [x] Preserve code zoom and isolate other preview modes.
- [x] Add frontend regression tests and run scoped verification.

### TASK-003: Verification and handoff
**Status**: Completed
**Parallelizable**: No (depends on TASK-001 and TASK-002)
- [x] Independent Rust/Bun review and checks.
- [x] Rebuild and launch Python/JSON previews; state visual verification limits.
- [x] Update documentation and archive this completed plan.

### TASK-004: Icon-only toolbar actions
**Status**: Completed
**Parallelizable**: Yes
- [x] Replace Open files and Git diff labels with local SVG icons; consistent return-to-file-view control.
- [x] Preserve accessible names, tooltips, handlers, visibility, and shortcuts.
- [x] Add regression tests and verify final toolbar in rebuilt app.

## Progress Log

### 2026-09-09
- User explicitly requested reducing padding and moving minimal metadata to a footer to maximize file contents.
- Found stacked 16px outer padding, bordered text card padding, Markdown pre spacing, and a backend-generated metadata paragraph before source.
- Performance work continues independently; preserve all existing dirty edits and combine final app rebuild when both changes are ready.
- Implemented semantic source footer, explicit text/raw-CSV mode, single code scroll area with 8px inset, and code-only font zoom. Source mode bypasses Markdown enhancements and duplicate HTML insertion; new setter-spy regression enforces one insertion per update.
- Implementer reports 25 affected frontend tests passing; backend footer test/formatting pass. Independent complete verification is running.
- Native Computer Use is available via the Node bridge; final layout will be visually checked after rebuilding the app bundle.
- Final native checks confirm Python/JSON full-pane content, source scrolling with footer staying below it, icon-only toolbar controls, and file-open chooser action. Automated tests cover code-only zoom and non-source isolation; native zoom-key behavior was not confirmed.
- Independent final verification: 212 Rust tests, 351 DOM tests, 39 Bun tests, Clippy, typechecking, scoped lint. Builds pass and target/debug/chilla is current.
- Existing user instances were untouched. Native checks used an isolated temporary bundle; the user took over that window, so it was left open and automation stopped. Exact commands and logs are in the design/report documents. No commit or push performed.
