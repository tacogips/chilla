# Verbose Diagnostic Logging File-I/O Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#file-io-observability`
**Issue Reference**: None (`null`)
**Workflow Mode**: `issue-resolution`
**Created**: 2026-07-29
**Last Updated**: 2026-07-30

---

## Design Document Reference

### Summary

Instrument the accepted document, startup-path, general-preview, and watcher boundaries after the core plan provides the process-global verbose diagnostic API. Each actual filesystem operation emits one record; command and watcher layers emit only semantic markers that do not duplicate service records.

### Included Scope

- Document canonicalization, reads, and metadata.
- Viewer path canonicalization and metadata used by startup resolution and preview validation.
- Non-Markdown preview reads and metadata, including delegated EPUB archive open and entry reads.
- Watcher-triggered reload outcomes, including failures the UI does not surface.
- Focused success, failure, disabled-mode, and duplicate-record tests.

### Excluded Scope

- CLI normalization, sink formatting, Tauri lifecycle, frontend-ready markers, and startup-load correlation, which belong to the core plan.
- File writes, rendering, watcher behavior changes, TypeScript, IPC payloads, new dependencies, and general-purpose logging.

## Existing Rust Interfaces

These public signatures remain unchanged; instrumentation observes results at existing operation boundaries.

```rust
impl DocumentService {
    pub fn open(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<DocumentSnapshot>;
    pub fn reload(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<DocumentSnapshot>;
}

impl ViewerService {
    pub fn open_file_preview(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview>;
}

impl WatcherService {
    pub fn watch_active_document(
        &self,
        path: PathBuf,
        app_handle: AppHandle,
        document_service: DocumentService,
        syntax_ui_theme: Arc<RwLock<SyntaxUiTheme>>,
    ) -> AppResult<()>;
}
```

## Task Breakdown

### IO-001: Document and Viewer Filesystem Operations

**Status**: COMPLETED
**Parallelizable**: Yes; disjoint from IO-002
**Write Scope**: `src-tauri/src/document/service.rs`, `src-tauri/src/viewer/path_utils.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/viewer/epub.rs`
**Dependencies**: CORE-002 in `verbose-diagnostic-logging-core.md`

Deliverables:

- Observe document canonicalization, reads, and metadata before mapping `std::io::Error` to `AppError`.
- Observe startup/file-preview canonicalization and metadata in `viewer/path_utils.rs`.
- Observe general non-Markdown preview reads and metadata in `viewer/service.rs`.
- Observe delegated EPUB archive open and entry reads in `viewer/epub.rs` before typed I/O failures are converted into preview parse errors.
- Record operation, full path, duration, byte size when known, outcome, error text, and raw OS code.
- Represent unavailable size explicitly on failure.
- Emit one completion record at each actual filesystem operation and avoid duplicate records across delegated reload/command paths.
- Guard disabled diagnostics before timing, formatting, metadata additions, or writer locking.
- Add focused success/failure tests using controllable diagnostic sinks.

Completion criteria:

- [x] Read and metadata failures retain underlying OS details in verbose records.
- [x] Successful reads use returned bytes or metadata for size without redundant filesystem calls.
- [x] Disabled mode does not add metadata calls, path formatting, or output.
- [x] Existing document, startup-resolution, preview, conflict, save, and reload behavior remains unchanged.

### IO-002: Watcher Failure Visibility

**Status**: COMPLETED
**Parallelizable**: Yes; disjoint from IO-001
**Write Scope**: `src-tauri/src/watcher/service.rs`
**Dependencies**: CORE-002 in `verbose-diagnostic-logging-core.md`

Deliverables:

- Record watcher-triggered reload success or failure at the semantic callback boundary.
- Record failure before the callback intentionally discards it, including typed error details still available there.
- Preserve debounce timing, event filtering, locking, reload behavior, and event emission.
- Avoid duplicating underlying read/metadata records owned by `DocumentService`.
- Add a focused test around swallowed reload failure observability where practical without weakening existing watcher tests.

Completion criteria:

- [x] A swallowed watcher refresh failure produces one semantic verbose failure marker.
- [x] Successful refreshes retain existing event behavior.
- [x] Quiet mode remains output-free.

### IO-003: File-I/O Verification and Plan Handoff

**Status**: COMPLETED
**Parallelizable**: No; verification gate
**Write Scope**: `impl-plans/completed/verbose-diagnostic-logging-io.md`
**Dependencies**: IO-001, IO-002

Deliverables:

- Run focused and full Rust verification commands defined by the core plan.
- Verify successful and failed document, preview, startup-resolution, and watcher records contain the accepted fields without duplicates.
- Update task status, completion criteria, and the progress log.
- Hand off to CORE-005 for runtime validation and archive both plans only after the integrated gate passes.

## Module Status

| Task | File Paths | Status | Tests |
|---|---|---|---|
| IO-001 | `src-tauri/src/document/service.rs`, `src-tauri/src/viewer/path_utils.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/viewer/epub.rs` | COMPLETED | Document/viewer/EPUB tests |
| IO-002 | `src-tauri/src/watcher/service.rs` | COMPLETED | Watcher tests |
| IO-003 | This plan | COMPLETED | Full Rust verification |

## Dependencies

| Task | Depends On | Reason |
|---|---|---|
| IO-001 | CORE-002 | Uses the diagnostic record API and controllable test sinks |
| IO-002 | CORE-002 | Uses the semantic event API and controllable test sinks |
| IO-003 | IO-001, IO-002 | Requires all I/O instrumentation |
| CORE-005 | IO-003 | Owns integrated runtime validation and plan archival |

Safe execution waves:

1. Complete CORE-002 from the core plan.
2. Run IO-001 and IO-002 in parallel because their write scopes are disjoint.
3. Run IO-003, then hand off to CORE-005.

## Verification

- [x] Focused document service tests cover successful filesystem records and failed read records; startup-resolution tests cover failed canonicalization. No forced metadata-failure test is claimed.
- [x] Focused viewer tests cover startup path resolution and general preview read/metadata records.
- [x] Focused EPUB tests cover quiet parity, successful archive construction/entry lookup and reads, missing-file open failure, corrupt-entry read failure, and injected `ZipError::Io` failures at archive-construction and entry-lookup boundaries.
- [x] Focused watcher tests cover swallowed reload failure markers and unchanged success behavior.
- [x] Duplicate-record assertions distinguish filesystem records from watcher semantic markers.
- [x] `CARGO_TERM_QUIET=true cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
- [x] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`.
- [x] `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`.
- [x] `CARGO_TERM_QUIET=true NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 cargo nextest run --manifest-path src-tauri/Cargo.toml` passed 159 tests with 0 skipped after the asynchronous bounded-sink revision.
- [x] `git diff --check -- src-tauri/src/document/service.rs src-tauri/src/viewer/path_utils.rs src-tauri/src/viewer/service.rs src-tauri/src/viewer/epub.rs src-tauri/src/watcher/service.rs impl-plans/completed/verbose-diagnostic-logging-io.md`.

## Completion Criteria

- [x] All accepted document, viewer, delegated EPUB, and watcher boundaries are instrumented.
- [x] Records include full path, duration, size when known, outcome, and underlying OS error details.
- [x] Failed operations represent unavailable size explicitly.
- [x] Failures hidden from the UI remain diagnostically visible.
- [x] Filesystem and semantic markers do not duplicate records.
- [x] Quiet mode adds no output, filesystem work, or artifacts.
- [x] Existing error mapping, retry behavior, UI behavior, watcher behavior, and file contents remain unchanged.
- [x] All verification commands pass.
- [x] Progress is logged and CORE-005 is unblocked.

## Risks and Mitigations

- **Duplicate records**: assign actual filesystem records to document/viewer boundaries and semantic reload markers to the watcher.
- **Changed error behavior**: observe typed results before existing mapping or swallowing without altering return values.
- **Quiet-mode overhead**: guard before timing, formatting, or optional metadata work.
- **Removed startup file**: preserve the original operation path and error without requiring successful recanonicalization.
- **Shared logger test state**: use isolated controllable sinks supplied by CORE-002.
- **Persistent diagnostic growth and sink backpressure**: rely on CORE-002's 10 MiB per-process ceiling, bounded asynchronous 14-day cleanup, and non-blocking 1,024-record sink queue while preserving all file-I/O instrumentation behavior.

## Progress Log

### Session: 2026-07-29

**Tasks Completed**: File-I/O plan split from the accepted feature plan.
**Tasks In Progress**: None.
**Blockers**: CORE-002 diagnostic API is not implemented.
**Notes**: Write scopes are disjoint from core bootstrap and command-marker work. No Codex-agent reference or Cursor adapter work applies.

### Session: 2026-07-29 (Implementation)

**Tasks Completed**: IO-001 through IO-003.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Instrumented accepted document/viewer filesystem boundaries and watcher semantic reload outcomes. Six focused record tests passed, including swallowed watcher failure visibility and duplicate-record exclusion. Full Rust verification and runtime validation passed through CORE-005; TypeScript remained unchanged.

### Session: 2026-07-29 (MIME-Observability Revision)

**Tasks Completed**: Added verbose MIME open/read observability and corrected focused-test coverage wording.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: `src-tauri/src/viewer/service.rs` now records one `detect_mime` file-I/O result for the verbose detector path while preserving the quiet detector and fallback behavior. Focused production-path tests cover success and permission-denied failure. The verification section now accurately states that no forced metadata-failure test is claimed.

### Session: 2026-07-29 (MIME-Classification Parity Revision)

**Tasks Completed**: Aligned verbose MIME classification with the existing file-based detector.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: The observable verbose read now rewinds and passes the same file to `tree_magic_mini::from_file`. Six representative fixtures confirm parity with quiet `from_filepath` classification while preserving permission-failure diagnostics and fallback behavior.

### Session: 2026-07-29 (Adversarial EPUB Revision)
**Tasks Completed**: Instrumented EPUB archive open and entry reads before error mapping.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Focused tests cover quiet parity, successful reads, missing-file failure, and corrupt-entry failure. Integrated nextest passed 145 tests; a no-TTY runtime recorded one EPUB open and six entry reads with mode-`0600` output and empty streams.

### Session: 2026-07-29 (EPUB ZIP I/O Boundary Revision)
**Tasks Completed**: Preserved typed ZIP I/O failures at archive construction and entry lookup before application-error mapping.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Direct disabled branches preserve quiet behavior. Focused tests inject raw OS error 5 at both dependency boundaries and assert full path, operation, duration, unavailable size, error text, and raw OS error. Rust formatting, check, strict Clippy, build, scoped diff check, and nextest all passed; nextest ran 147 tests with 0 skipped. A rebuilt no-TTY launch recorded one ZIP construction, six entry lookups, and six entry reads in the mode-`0600` file sink with empty streams; the quiet launch retained empty streams and created no verbose log.

### Session: 2026-07-29 (Adversarial Retention Revision)
**Tasks Completed**: Confirmed file-I/O records use CORE-002's bounded sink without changing operation coverage or quiet behavior.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: The core logger now owns the 10 MiB per-process ceiling and 14-day safe retention policy required by the latest Step 7 feedback, including advisory-lock preservation for active logs. No document, viewer, EPUB, command, or watcher interface change was required. Full nextest passed 154/154 and the rebuilt verbose runtime retained the expected file-I/O records; quiet mode remained artifact-free. Agents: `/root/rust_coding`, `/root/rust_coding_io`, `/root/check_and_test`.

### Session: 2026-07-30 (Test-Fixture Isolation Revision)
**Tasks Completed**: Made viewer MIME and EPUB test fixtures cross-process unique.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Both test-only `TestDir` helpers now include `std::process::id()` alongside their existing timestamp and atomic counter, so concurrent test processes cannot delete one another's fixtures through a same-name cleanup collision. No production path or assertion changed. The focused MIME fallback regression test passed, and independent verification passed rustfmt, Cargo check, strict Clippy, and all 154 nextest tests with 0 skipped. The focused Cargo wrapper timed out only during teardown after printing its successful result.

### Session: 2026-07-30 (Adversarial Async-Sink Revision)
**Tasks Completed**: Confirmed every startup, command, watcher, and file-I/O diagnostic uses the non-blocking bounded core sink.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: No document, viewer, EPUB, or watcher API changed. Their records now enter the 1,024-record background queue through non-blocking sends, so a stalled terminal or log filesystem does not block those execution paths; saturation is represented by a later dropped-record marker. Full nextest passed 159/159, `task verify` passed, and verbose no-TTY plus PTY/file parity runtime checks retained the expected file-I/O records. Agents: `/root/rust_coding`, `/root/rust_coding_io`, `/root/rust_fixture_isolation`, `/root/check_and_test`.

## Related Plans

- **Previous**: `impl-plans/completed/verbose-diagnostic-logging-core.md`
- **Depends On**: CORE-002 in the core plan
