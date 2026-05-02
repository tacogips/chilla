# File View Mixed-Stack Validation

**Status**: Completed
**Design Reference**: `design-docs/specs/notes.md#file-viewer-mode-notes`
**Created**: 2026-05-02
**Last Updated**: 2026-05-01

## Design Document Reference

**Primary Source**: `design-docs/specs/notes.md` (File Viewer Mode Notes, Verification Targets For Later Implementation)

**Supporting Sources**:
- `design-docs/specs/design-file-viewer-mode.md`
- `design-docs/specs/design-csv-viewer.md`
- `design-docs/specs/command.md`

### Summary

Strengthen automated proof that Rust-side startup, directory and explicit-file-set listing, preview loading, and frontend workspace state stay coherent across the Tauri boundary as file-view features evolve.

### Scope

**Included**:
- Inventory of IPC commands and backend-emitted signals that file view mode and CSV previews depend on
- Written acceptance scenarios for selection, reload, and mode-specific preview affordances (for example CSV raw versus formatted presentation)
- New or extended automated tests where gaps are systematic (preferred: extend existing Linux WebDriver smoke under `tests/tauri/` when behavior requires a real webview)

**Excluded**:
- macOS-specific desktop automation (Linux WebDriver baseline only unless later expanded elsewhere)
- Fuzzy search, hidden-file filtering, spreadsheet editing
- Packaging or release pipelines

### TASK-001: IPC Inventory

**Status**: Completed
**Parallelizable**: Yes

**Deliverables**: Progress log entries in this plan documenting findings (no standalone code artifact required)

**Completion Criteria**:
- [x] Enumerate `open_*` / `list_*` / preview-related invoke paths used when `workspace_mode === "file_view"` and when `browser_root.kind === "explicit_file_set"`
- [x] Enumerate frontend listeners or polling that must stay aligned with watcher or refresh semantics for the selected preview file

**TASK-001 Findings** (embedded here; mirrored in Progress Log):

**Invokes relied on during `initial_mode === file_view`** (startup from `StartupContext.browser_root`, then tree or preview flows):

| Command | Roles |
| ------- | ----- |
| `get_startup_context` | Delivers `initial_mode`, `browser_root` (`directory` vs `explicit_file_set`), seeds first list page and optionally `selected_file_path`. |
| `list_directory` | Directory-root listing paging, sorting, filtering. |
| `list_explicit_file_set` | Explicit CLI file-set listing (ordered `paths` vector, same sort/query/offset contract as directory pages). |
| `open_document` | Markdown selection in file view: snapshot + starts document watch. |
| `open_file_preview` | Non-Markdown previews (including structured `csv`, media, text, etc.). |
| `stop_document_watch` | Invoked before `open_file_preview` when leaving an active Markdown watch to avoid stale watcher state. |
| `reload_document` | Reloads the open Markdown snapshot (toolbar / theme refresh path). |
| `save_document` | Not specific to file view, but part of the shared document command surface if workbench opens from file flow. |
| `render_markdown_preview` | Workbench / live preview path; orthogonal to file-view tree but same command module. |
| `set_syntax_ui_theme` | Highlighting theme; affects Markdown source HTML and preview HTML refresh paths. |

**Events / listeners**:

| Mechanism | Roles |
| --------- | ----- |
| `document_refreshed` (`listenDocumentRefreshed` in `src/lib/tauri/document.ts`) | Emitted when the backend watcher refreshes the **currently watched Markdown document**; `WorkspaceShell` replaces `markdownDoc` when the path matches. **Not** used for CSV or other `open_file_preview` kinds. |
| Debounced tree selection (`scheduleSelectionPreviewFromTree` in `WorkspaceShell`) | Clientside alignment between selected tree row and preview request coalescing (not an IPC event). |
| `reload_document` + `open_file_preview` after `stopDocumentWatch` | Used on explicit reload / theme cycle for non-Markdown preview to re-fetch preview payload. |

### TASK-002: Acceptance Scenarios

**Status**: Completed
**Parallelizable**: Yes
**Depends On**: TASK-001 (may start after partial inventory)

**Deliverables**: Checkbox list under Progress Log naming concrete user-visible scenarios

**Completion Criteria**:
- [x] At least three scenarios cover directory-root file view (navigation, preview swap, Markdown switch if applicable)
- [x] At least one scenario covers explicit CLI file-set constraint behavior
- [x] At least one scenario covers CSV `Raw` versus `Formatted` when `formatted_available` is true

**Directory-root scenarios** (TASK-002):

1. **Tree + paging + filter**: Lazy load deep rows, server-side filter surfaces a file not in the first page (`verifyLazyLoading`, `verifyServerSideFiltering`).
2. **Markdown preview + styling**: Open `README.md`, assert rendered body and dark-theme computed styles (`verifyReadmePreview`).
3. **Markdown raw vs preview**: With `README.md` open, toggle `Raw Markdown source` and `Markdown preview`; body text remains consistent (same step file as styling check).
4. **Media preview**: MP4 / MP3 inline preview stream URL and error state (`verifyVideoPreview`, `verifyAudioPreview`).
5. **CSV formatted vs raw**: Open fixture CSV, assert table cells, switch to raw highlighted source, return to formatted table (`verifyCsvPreviewFormattedRawToggle` in `tests/tauri/tauri-smoke.e2e.ts`).

**Explicit CLI file-set scenario**:

6. **Multi-file argv startup**: Launch with two file paths; banner reads `Opened from CLI selection`, both files list, first file previews, second CSV opens as formatted table (`verifyExplicitCliMultiFileStartup`).

**Deferred / covered elsewhere**:

- **Directory navigation (`h` / parent)**: Exercised indirectly by existing file-view unit tests and manual notes; no dedicated WebDriver step in this slice.
- **CSV unit coverage**: `CsvFilePreviewPane.vitest.tsx` covers formatted, padding, error notice, and raw HTML path without WebDriver.

### TASK-003: Automated Coverage

**Status**: Completed
**Parallelizable**: No
**Depends On**: TASK-002

**Deliverables**:
- `tests/tauri/` extended WebDriver specs and/or Bun-side tests where jsdom suffices
- Minimal fixture files under repo test fixture patterns already used by `tauri-smoke.e2e.ts`

**Completion Criteria**:
- [x] Each scenario from TASK-002 maps to a named test case or justified deferral documented in Progress Log
- [x] New tests pass under `scripts/run-tauri-e2e-linux.sh` prerequisites when WebDriver additions are chosen (Linux session: `bun run test:tauri:e2e:linux` green after wait-hardening; see Progress Log)

### TASK-004: Verification

**Status**: Completed
**Parallelizable**: No
**Depends On**: TASK-003

**Completion Criteria**:
- [x] `bun run typecheck` passes
- [x] `bun run test` and `bun run test:dom` pass
- [x] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` passes
- [x] `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes
- [x] `bun run test:tauri:e2e:linux` passes on Linux host with WebKitWebDriver / `tauri-driver` prerequisites

## Dependencies

| Feature                         | Depends On              | Status |
| ------------------------------- | ----------------------- | ------ |
| TASK-002 scenarios              | TASK-001 inventory      | DONE   |
| TASK-003 automated coverage     | TASK-002                | DONE   |
| TASK-004 verification           | TASK-003                | DONE   |

## Related Plans

- **Depends On**: `impl-plans/completed/file-viewer-mode.md`, `impl-plans/completed/csv-viewer.md`
- **Previous**: `impl-plans/completed/linux-tauri-e2e-webdriver.md`

## Progress Log

### Review Feedback: 2026-05-01
**Finding**: `tests/tauri/tauri-smoke.e2e.ts` still waits for `.markdown-source` in `verifyReadmePreview`, but the implementation now renders Markdown raw mode as `textarea.markdown-source-editor` in `WorkspaceShell`. The Linux Tauri E2E path will time out when it reaches the Markdown raw/preview assertion.
**Required Follow-Up**:
- [x] Update the WebDriver assertion to read `textarea.markdown-source-editor` via `getAttribute("value")` or DOM `value`.
- [x] Re-run `bun run test:tauri:e2e:linux` after the selector fix.

### Review Feedback: 2026-05-01 (current git diff)
**Finding**: The selector portion of the previous E2E feedback is addressed in the current unstaged diff for `tests/tauri/tauri-smoke.e2e.ts`: `verifyReadmePreview` now locates `.markdown-source-editor` and reads the textarea `value`.
**Required Follow-Up**:
- [x] Update the WebDriver assertion to read `textarea.markdown-source-editor`.
- [x] Stage this test change with the implementation if it is intended to be part of the review set.
- [x] Re-run `bun run test:tauri:e2e:linux` after staging/keeping the selector fix, because this review did not execute the Linux WebDriver suite.

### Session: 2026-05-01 (TASK-003 E2E hardening)

**Tasks Completed**: `tests/tauri/tauri-smoke.e2e.ts` WebDriver predicates wrapped with `waitUntil` so `WebDriver.wait` retries when `findElement` would previously throw before the markdown or CSV pane attached; MP4/MP3 readiness polling uses `maybeReadMediaState` so script failures retry; explicit CLI step polls `.file-browser__path` until the banner replaces `Loading...`. `bun run test:tauri:e2e:linux` passes end-to-end on Linux with xvfb/display as provided by `scripts/run-tauri-e2e-linux.sh`.

**Tasks In Progress**: None
**Blockers**: None

### Session: 2026-05-02

**Tasks Completed**: Plan authored; workspace branch diff independently verified (`cargo test`, `cargo clippy -D warnings`, `bun run typecheck`, `bun run test`, `bun run test:dom`).
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Phase 2 seed plan for mixed-stack validation called out under file-viewer notes after CSV and explicit-file-set delivery landed in the tree.

### Session: 2026-05-01

**Tasks Completed**: TASK-001 inventory and TASK-002 scenario list inlined above; Linux smoke extended in `tests/tauri/tauri-smoke.e2e.ts` (`fixture-data.csv` workspace fixture; CSV raw/formatted toolbar; Markdown raw/preview after README styling; explicit two-file launcher + `Opened from CLI selection` + CSV preview swap). TASK-004 static checks executed successfully.

**Tasks In Progress**: TASK-003 WebDriver prerequisite (`scripts/run-tauri-e2e-linux.sh`) not executed here initially (needs built debug binary, WebKitWebDriver/display or xvfb).

**Unresolved** (superseded by Session 2026-05-01 closing entry above):

- [x] Run `bun run test:tauri:e2e:linux` or `scripts/run-tauri-e2e-linux.sh` on Linux with WebDriver prerequisites after pulling these smoke changes.
