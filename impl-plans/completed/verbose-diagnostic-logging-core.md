# Verbose Diagnostic Logging Core Implementation Plan

**Status**: Completed
**Design References**: `design-docs/specs/command.md#verbose-diagnostic-contract`; `design-docs/specs/architecture.md#opt-in-startup-and-file-io-diagnostics`
**Issue Reference**: None (`null`)
**Workflow Mode**: `issue-resolution`
**Created**: 2026-07-29
**Last Updated**: 2026-07-30

---

## Design Document Reference

### Summary

Add an opt-in `--verbose` CLI modifier that preserves all existing startup forms while recording timestamped startup phases and file-I/O outcomes. Verbose records go to `~/Library/Logs/chilla/chilla-verbose-<pid>.log` and are mirrored as identical lines to stderr when attached, otherwise stdout when attached.

### Included Scope

- Normalize `--verbose` before the existing argument-count-sensitive parser branches.
- Preserve verbose state when target parsing fails so the failure can be recorded.
- Add a process-global, standard-library-only diagnostic sink with non-fatal failure handling.
- Record process start, CLI parsing, app construction, window/webview availability, frontend readiness, startup load, and relevant file-I/O outcomes.
- Define command-level frontend/startup markers and coordinate the linked file-I/O plan.
- Add focused unit tests and runtime verification with and without `--verbose`.

### Excluded Scope

- TypeScript or IPC contract changes.
- Document/viewer filesystem instrumentation and watcher markers, which are specified in `verbose-diagnostic-logging-io.md`.
- General-purpose logging, release packaging, multi-file rotation, remote upload, or persisted settings. The Step 7 adversarial revision adds only a 10 MiB per-process ceiling and 14-day best-effort retention cleanup.
- New dependencies or changes to normal logging and terminal output.
- Unrelated design documents, implementation plans, or existing dirty worktree files.

### Design Constraints

- Help and version exits do not initialize diagnostics or create a log file, even when combined with `--verbose`.
- Disabled call sites return before timestamps, path formatting, metadata lookups, allocations, or writer locking.
- Logger initialization and all sink failures are non-fatal.
- Each filesystem operation is recorded once at its actual operation boundary; watcher and command markers must not duplicate service-level I/O records.
- Records can contain full paths but never file contents, environment values, credentials, authorization headers, or tokens.

## Planned Rust Interfaces

Signatures may be adjusted during implementation only when the accepted behavior and two-phase parse flow remain unchanged.

### `src-tauri/src/cli/mod.rs`

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CliOptions {
    pub verbose: bool,
}

pub struct NormalizedCli {
    pub options: CliOptions,
    pub arguments: Vec<OsString>,
}

pub enum CliNormalizationOutcome {
    Information(CliParseOutcome),
    Parse(NormalizedCli),
}

pub fn normalize_cli<I, T>(args: I) -> CliNormalizationOutcome
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>;

pub fn parse_cli(input: NormalizedCli) -> AppResult<CliParseOutcome>;
```

The split is intentionally two-phase: `normalize_cli` removes diagnostic flags and identifies information-only outcomes without filesystem work. `main.rs` can then initialize verbose diagnostics before `parse_cli` performs fallible target classification, canonicalization, or metadata access.

### `src-tauri/src/verbose_log.rs`

```rust
pub const VERBOSE_LOG_PATH_PATTERN: &str =
    "~/Library/Logs/chilla/chilla-verbose-<pid>.log";

pub struct VerboseInit {
    pub enabled: bool,
    pub process_started_at: Instant,
}

pub enum VerboseIoOutcome<'a> {
    Success { size_bytes: Option<u64> },
    Failure { error: &'a std::io::Error },
}

pub fn initialize(config: VerboseInit) -> Option<PathBuf>;
pub fn is_enabled() -> bool;
pub fn record_event(name: &str, outcome: &str);
pub fn record_phase(name: &str, started_at: Instant, outcome: &str);
pub fn record_io(
    operation: &str,
    path: &Path,
    started_at: Instant,
    outcome: VerboseIoOutcome<'_>,
);
pub fn mark_frontend_ready();
pub fn arm_startup_load(target: &StartupTarget);
pub fn complete_startup_load(path: &Path, started_at: Instant, outcome: &str);
```

The implementation may keep the logger state, formatter, writer, and once-only markers private. Tests require injectable or in-memory sinks around the formatter/writer boundary without replacing the production process-global interface.

### `src-tauri/src/lib.rs`

```rust
pub fn run(startup_target: StartupTarget) -> Result<(), String>;
```

The existing public signature remains stable. Diagnostics are initialized in `main.rs` and consumed through the process-global module.

### Existing Command Interfaces

```rust
pub fn get_startup_context(
    state: State<'_, AppState>,
) -> Result<StartupContext, String>;

pub async fn open_file_preview(
    path: String,
    state: State<'_, AppState>,
) -> Result<FilePreview, String>;

pub fn open_document(
    path: String,
    state: State<'_, AppState>,
) -> Result<DocumentSnapshot, String>;
```

These externally used signatures remain unchanged; instrumentation observes existing results before error mapping or swallowing.

## Task Breakdown

### CORE-001: CLI Normalization and Contract Tests

**Status**: COMPLETED
**Parallelizable**: Yes; disjoint from CORE-002
**Write Scope**: `src-tauri/src/cli/mod.rs`
**Dependencies**: None

Deliverables:

- Add a non-fallible normalization result that retains verbose state before the fallible target parser runs.
- Remove every `--verbose` occurrence before existing length and target classification.
- Keep only the long flag; repeated occurrences are idempotent.
- Keep help/version information-only and document the flag plus log path pattern.
- Preserve all current target and exit-code behavior.
- Instrument direct multi-file canonicalization and metadata operations after verbose initialization without changing their error mapping or duplicating viewer-boundary records.
- Add tests for quiet default, parse failure retention, repeated/interspersed flags, help/version, and verbose combinations with bare, file, directory, multi-file, GitHub URL, Git cache bypass, and local Git commit/range startup.

Completion criteria:

- [x] Existing CLI tests remain behaviorally unchanged except for the planned result wrapper.
- [x] New tests prove normalization happens before every argument-count-sensitive branch.
- [x] `--verbose --help` and `--verbose --version` do not imply app startup.

### CORE-002: Standard-Library Verbose Logger

**Status**: COMPLETED
**Parallelizable**: Yes; disjoint from CORE-001
**Write Scope**: `src-tauri/src/verbose_log.rs`
**Dependencies**: None

Deliverables:

- Implement one-time process-global state with monotonic process timing and wall-clock record timestamps.
- Create the macOS log directory and process-specific file only when enabled, `HOME` is absolute, and the home plus `Library/Logs/chilla` path components are physical directories; reject unsafe values before diagnostic creation or retention deletion.
- Create files exclusively, preserve existing entries and symlinks through bounded collision suffixes, and use Unix directory/file modes `0700`/`0600`.
- Cap each process log at 10 MiB, emit one final in-budget limit record to both configured sinks, then suppress later records.
- Enqueue formatted records without blocking into a bounded 1,024-record queue and perform file and terminal writes on a background sink worker. Emit an explicit dropped-record marker after queue saturation.
- Hold an exclusive advisory lock for each active process log. After the first current-process record is written, check at most 256 directory entries for at most 25 ms on a separate cleanup worker. Remove only strict-name-matching regular verbose logs older than 14 days after acquiring their locks; preserve active/locked files, symlinks, malformed names, unrelated entries, and fresh files.
- Mirror the exact formatted line to stderr when `stderr.is_terminal()`; otherwise use stdout when `stdout.is_terminal()`.
- Make home validation, worker creation, directory/file creation, queue saturation/disconnection, lock poisoning, and write failures non-fatal.
- Drain the background sink for at most 250 ms on explicit CLI exits and normal application return.
- Provide no-op guards that precede formatting, allocation, metadata lookup, and locking.
- Escape every control character before the shared line reaches either sink.
- Include event, outcome, elapsed time, optional duration, path/size fields, and raw OS error when available.
- Add tests for disabled behavior, record formatting, sink failure, terminal selection, and once-only frontend/startup markers. Identical sink output is guaranteed by formatting each record once before writing that same line to both configured sinks.

Completion criteria:

- [x] Production logger has no non-std dependency.
- [x] Sink failure cannot propagate into startup or file operations.
- [x] Disabled tests prove no sink artifact or record is produced.
- [x] Collision, symlink, Unix permission, and terminal-control tests cover the privacy-sensitive sink boundary.
- [x] Size-ceiling and retention tests cover limit-marker behavior and safe cleanup targeting.
- [x] Relative-home rejection, bounded asynchronous cleanup, non-blocking queue saturation, dropped-record signaling, and bounded shutdown have focused coverage.

### CORE-003: Bootstrap and Startup Phase Wiring

**Status**: COMPLETED
**Parallelizable**: Yes after CORE-001 and CORE-002
**Write Scope**: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
**Dependencies**: CORE-001, CORE-002

Deliverables:

- Capture process start before CLI work.
- Initialize diagnostics for app-starting outcomes and verbose parse failures, but not help/version exits.
- Arm startup-load correlation for `StartupTarget::File` or the first canonical `StartupTarget::FileSet` path before transferring the target into app construction.
- Record process start, CLI parse success/failure and duration, `run` entry, Tauri builder setup, setup failure, and main window/webview availability.
- Request the bounded sink drain before explicit post-initialization process exits and after normal Tauri application return.
- Export the logger module without changing the Tauri command or frontend contract.
- Preserve current user-facing errors and exit codes.

Completion criteria:

- [x] Parse failures are logged when normalized verbose state is true.
- [x] Help/version exits never create a verbose sink.
- [x] App construction and window markers use the process monotonic timeline.

### CORE-004: Frontend-Ready and Startup-Load Command Markers

**Status**: COMPLETED
**Parallelizable**: Yes after CORE-002
**Write Scope**: `src-tauri/src/commands/document.rs`
**Dependencies**: CORE-002

Deliverables:

- Mark only the first `get_startup_context` invocation as frontend ready.
- Match `open_document` and `open_file_preview` inputs exactly against the armed canonical path; consume the marker on the first matching success or failure only.
- Preserve correlation when the startup file disappears after CLI canonicalization, and do not consume the marker for unrelated interactive opens.
- Record startup file-open completion/failure once without duplicating service-level I/O records.
- Log command failures before conversion to UI-facing strings when an underlying typed error is still available.
- Preserve all command signatures and serialized payloads.

Completion criteria:

- [x] Repeated startup-context calls do not duplicate frontend-ready records.
- [x] File and FileSet startup arming, exact matching, unrelated opens, removed files, and non-file targets are tested.
- [x] Startup load outcome is distinguishable from lower-level file operations.
- [x] No TypeScript or invoke-contract update is required.

### CORE-005: Integrated Verification and Plan Completion

**Status**: COMPLETED
**Parallelizable**: No; integration gate
**Write Scope**: `impl-plans/active/verbose-diagnostic-logging-core.md`, `impl-plans/active/verbose-diagnostic-logging-io.md`, `impl-plans/README.md`
**Dependencies**: CORE-003, CORE-004, completion of `verbose-diagnostic-logging-io.md`

Deliverables:

- Run formatting, check, clippy, nextest, help, and debug-build verification.
- Launch the app with and without verbose mode using the post-edit launch skill and a bounded harness that captures the exact app PID, selects only that PID's log, and always terminates and waits for the process.
- Compare file and TTY records, exercise sink failure/no-terminal behavior, and prove quiet mode creates neither output nor artifacts.
- Review the final diff against the declared write scopes and existing dirty-worktree baseline.
- Update every task status, completion criterion, and progress log.
- Move both active plans to `impl-plans/completed/` only after all gates pass, then replace both active entries with completed entries in `impl-plans/README.md`.

## Module Status

| Task | File Paths | Status | Tests |
|---|---|---|---|
| CORE-001 | `src-tauri/src/cli/mod.rs` | COMPLETED | CLI unit tests |
| CORE-002 | `src-tauri/src/verbose_log.rs` | COMPLETED | Logger unit tests |
| CORE-003 | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` | COMPLETED | Integrated startup tests/runtime |
| CORE-004 | `src-tauri/src/commands/document.rs` | COMPLETED | Command/logger tests |
| CORE-005 | Both plan files and `impl-plans/README.md` | COMPLETED | Full verification |

## Dependencies

| Task | Depends On | Reason |
|---|---|---|
| CORE-001 | None | Establishes normalized CLI state and parse result |
| CORE-002 | None | Establishes the diagnostic API and testable sinks |
| CORE-003 | CORE-001, CORE-002 | Wires parsed state into logger and Tauri lifecycle |
| CORE-004 | CORE-002 | Uses once-only frontend/startup markers |
| I/O plan | CORE-002 | Uses the diagnostic API at filesystem and watcher boundaries |
| CORE-005 | CORE-003, CORE-004, completed I/O plan | Requires integrated implementation |

Safe execution waves:

1. CORE-001 and CORE-002 in parallel.
2. CORE-003, CORE-004, and the I/O plan tasks in parallel after their dependencies; write scopes are disjoint.
3. CORE-005 after both plans' implementation tasks merge.

## Verification

Final adversarial-revision evidence:

- [x] `CARGO_TERM_QUIET=true cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
- [x] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`.
- [x] `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`.
- [x] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml --lib verbose_log::tests -- --nocapture` passed 26 tests.
- [x] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml --test verbose_version -- --nocapture` passed the focused built-binary information-only/artifact-free test.
- [x] `CARGO_TERM_QUIET=true NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 cargo nextest run --manifest-path src-tauri/Cargo.toml` passed 159 tests with 0 skipped.
- [x] `CARGO_TERM_QUIET=true cargo build --manifest-path src-tauri/Cargo.toml`.
- [x] `bun run tauri build --debug --no-bundle` built `target/debug/chilla`.
- [x] A bounded PTY `target/debug/chilla --verbose LICENSE` launch produced 67 terminal records exactly matching its mode-`0600` PID-correlated log.
- [x] A bounded no-TTY `target/debug/chilla --verbose tests/fixtures/wasteland.epub` launch kept streams empty and recorded one EPUB open plus six entry reads.
- [x] A bounded no-TTY `target/debug/chilla LICENSE` launch preserved quiet streams and verbose-log absence.
- [x] `target/debug/chilla --help` documents the collision-safe filename pattern.
- [x] Scoped `git diff --check` passed for implementation, design, and completed-plan files.
- [x] Bun verification was not applicable because no TypeScript files changed.

## Completion Criteria

- [x] Every accepted startup form composes with `--verbose`.
- [x] Verbose parse failures preserve current messages/exit codes and produce diagnostics.
- [x] All required startup phases include timestamps and durations.
- [x] File reads include path, size when available, duration, outcome, and underlying OS error details.
- [x] File and TTY sinks receive identical formatted records.
- [x] Finder/no-TTY and sink-failure paths are non-fatal.
- [x] Quiet mode is behaviorally and observably unchanged.
- [x] No dependency or frontend contract is added.
- [x] Post-adversarial formatting, check, strict clippy, full nextest, debug build, PTY, no-TTY, and quiet runtime checks pass.
- [x] Final diff contains only declared feature files, accepted design documents, both implementation plans, and `impl-plans/README.md`.
- [x] Both plan statuses/progress logs are updated, both plans are archived, and the index reflects their completed locations.

## Risks and Mitigations

- **Argument-count regression**: normalize all verbose occurrences before existing branches and test each startup form.
- **Parse-failure blind spot**: return options independently from the fallible parse outcome.
- **Global-state test interference**: keep production initialization one-time while testing formatter/writers through isolated controllable sinks.
- **Quiet-mode overhead or output**: guard before timing, formatting, allocation, metadata, or locking and run an explicit no-flag regression.
- **Duplicate I/O records**: record actual operations in document/viewer services and path utilities; command/watcher layers emit only lifecycle or swallowed-failure markers.
- **Sink failure or backpressure**: validate the home boundary before mutation, perform file/TTY writes on a bounded background queue, emit a dropped-record marker after saturation, and limit shutdown drain to 250 ms.
- **Sensitive data exposure**: allow full paths but prohibit contents, environment values, credentials, headers, and tokens.
- **Persistent growth and retention**: cap each process log at 10 MiB, stop both sinks after an explicit limit marker, and asynchronously inspect at most 256 entries or 25 ms while removing only strict matching regular logs older than 14 days.
- **Dirty worktree collision**: snapshot status before implementation and do not stage, revert, edit, or commit unrelated design-docs/ or impl-plans/ changes.

## Progress Log

### Session: 2026-07-29

**Tasks Completed**: Implementation plan created from the accepted Step 3 design review.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Revised for workflow session 647 after accepted Step 3 feedback and split at the eight-module limit. Self-review findings were addressed by aligning parallelization metadata, declaring index/archive work, adding reproducible runtime and failure commands, naming exact conditional Bun commands, and adding documentation-alignment verification. Step 5 feedback was addressed with bounded PID-correlated PTY, no-TTY, and quiet launch procedures that reject stale logs and guarantee process cleanup. The follow-up self-review contradiction was resolved by applying fresh-log assertions only to verbose launches while retaining explicit log absence for quiet mode. `codexAgentReferences` are `/root/rust_coding`, `/root/rust_coding_io`, and `/root/check_and_test`; no reference-repository traceability or Cursor adapter work applies.

### Session: 2026-07-29 (Implementation)

**Tasks Completed**: CORE-001 through CORE-005 and linked I/O plan integration.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Implemented the Rust-only CLI, logger, startup, command, document/viewer, and watcher diagnostics. Final verification passed formatting, check, strict clippy, 132 nextest tests, debug build, help output, verbose PTY/no-TTY launches, quiet launch, parse-failure logging, and exact PID cleanup. Bun checks were not applicable because TypeScript was unchanged. Computer Use was unavailable, so visible accessibility-tree inspection was skipped; direct debug-binary launches confirmed runtime startup.

### Session: 2026-07-29 (Self-Review Revision)

**Tasks Completed**: Resolved the quiet CLI error-formatting finding in `record_app_error`.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Added an immediate disabled-mode guard through a lazy error-detail boundary, proving that quiet CLI failures return before diagnostic string allocation while verbose error messages and raw OS codes remain unchanged. Focused logger tests passed 12/12, full nextest passed 134/134, and the quiet invalid-path runtime preserved exit code 3, stderr text, zero stdout, and no verbose log artifact.

### Session: 2026-07-29 (Step 7 Review Revision)

**Tasks Completed**: Corrected full-path records for relative multi-file canonicalization and explicit preview-worker join-failure diagnostics.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Successful canonicalization now records the canonical path, while failure records a precomputed absolute attempted path. Preview `spawn_blocking` join failures now record `open_file_preview_command` failure, complete a matching startup-load marker as failure, and return the unchanged formatted error. Two relative-path logging tests and one join-failure test pass. Post-revision formatting, check, strict clippy, 137-test nextest, debug build, scoped diff verification, verbose relative multi-file launch, and quiet launch all pass. Plan verification claims now match the authoritative Step 6 command evidence; the detailed PTY procedure remains a design target rather than claimed post-revision evidence.

### Session: 2026-07-29 (Step 7 MIME-Observability Revision)

**Tasks Completed**: Resolved the unobservable MIME-detection file-I/O finding and corrected overstated focused-test claims.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Quiet mode retains the existing `tree_magic_mini::from_filepath` path. Verbose mode now performs and records the detector's fallible 2 KiB prefix open/read before classification, including full canonical path, duration, size, error text, and raw OS error where available; failures preserve the existing binary fallback. A production-path permission failure test and the successful duplicate-count test pass. Final verification passed format check, check, strict clippy, 138-test nextest, debug build, verbose no-TTY launch, quiet launch, and scoped whitespace validation. Logger test claims now distinguish shared-line implementation from direct dual-sink testing, and the I/O plan no longer claims a forced metadata-failure test.

### Session: 2026-07-29 (MIME-Classification Parity Revision)

**Tasks Completed**: Preserved file-based MIME classification while retaining observable verbose reads.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Verbose MIME detection now opens and probes the file, rewinds the same handle, and delegates classification to `tree_magic_mini::from_file`; quiet mode remains on `tree_magic_mini::from_filepath`. A six-fixture test proves verbose and quiet classifications match, and the permission-denied diagnostic/fallback test remains passing. Final verification passed format check, check, strict clippy, 139-test nextest, debug build, verbose and quiet no-TTY launches, and scoped whitespace validation.

### Session: 2026-07-29 (Adversarial Security And Coverage Revision)
**Tasks Completed**: Hardened sink creation/formatting, added early no-op guards, instrumented EPUB reads, and completed PTY verification.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Exclusive collision-safe logs use Unix `0700`/`0600` permissions; all control characters are escaped. Integrated checks passed with 145 tests, the PTY stream exactly matched 67 file records, no-TTY EPUB diagnostics recorded one open and six entry reads, and quiet mode remained artifact-free. Agents: `/root/rust_coding`, `/root/rust_coding_io`, `/root/check_and_test`.

### Session: 2026-07-29 (Adversarial Retention Revision)
**Tasks Completed**: Bounded per-process diagnostic growth, added safe age-based retention cleanup, and added focused `--verbose --version` artifact-free coverage.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: The latest Step 7 adversarial finding superseded the original retention exclusion. Implementation uses a 10 MiB ceiling with one final limit record and a 14-day cleanup policy restricted to strict-name-matching regular files whose advisory locks can be acquired; active logs, symlinks, and unrelated entries remain untouched. Focused logger tests passed 21/21, the built-binary version test passed, full nextest passed 154/154, format/check/strict Clippy passed, and a rebuilt isolated-HOME runtime produced a mode-`0600` 67-line verbose log while quiet mode created no log and both no-TTY launches kept stdout/stderr empty. Agents: `/root/rust_coding`, `/root/rust_coding_io`, `/root/check_and_test`.

### Session: 2026-07-30 (Test-Fixture Isolation Revision)
**Tasks Completed**: Added cross-process identity to the viewer and EPUB temporary-directory helpers.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Test-only directory names now combine the process ID, nanosecond timestamp, and per-process atomic counter, preventing concurrent nextest processes from colliding merely because timestamps and counters match. Existing assertions, cleanup, and production behavior are unchanged. The focused MIME fallback regression test passed, and independent verification passed rustfmt, Cargo check, strict Clippy, and all 154 nextest tests with 0 skipped. The focused Cargo wrapper timed out only during teardown after printing its successful result.

### Session: 2026-07-30 (Adversarial Async-Sink Revision)
**Tasks Completed**: Rejected unsafe relative homes, bounded and deferred retention, and removed sink backpressure from instrumented callers.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: `src-tauri/src/verbose_log.rs` now requires an absolute `HOME`, verifies every existing log-directory component is a physical directory, enqueues records without blocking on a bounded 1,024-record channel, performs retention only after the first successful record with 256-entry and 25 ms bounds, emits a dropped-record marker after saturation, and limits shutdown drain to 250 ms. `src-tauri/src/main.rs` requests bounded drain on normal and early exits. Focused logger tests passed 26/26, full nextest passed 159/159, `task verify`, formatting, Cargo check, strict Clippy, the debug Tauri build, no-TTY verbose/quiet launches, relative-home mutation and retention regressions, and exact normalized 67-record PTY/file parity all passed. Agents: `/root/rust_coding`, `/root/rust_coding_io`, `/root/rust_fixture_isolation`, `/root/check_and_test`.

## Related Plans

- **Next**: `impl-plans/completed/verbose-diagnostic-logging-io.md`
- **Depends On**: None
