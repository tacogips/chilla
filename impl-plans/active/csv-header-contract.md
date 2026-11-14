# CSV header request and response contract Implementation Plan

**Status**: In Progress
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed; test-integrity-001 repair accepted; independent implementation review remains pending.

## Dispatch metadata

```json
{
  "planId": "csv-header-contract",
  "planPath": "impl-plans/active/csv-header-contract.md",
  "dependsOn": [],
  "writePaths": [
    "src-tauri/src/viewer/types.rs",
    "src-tauri/src/viewer/service.rs",
    "src-tauri/src/viewer/service/tests.rs",
    "src-tauri/src/viewer/csv.rs",
    "src-tauri/src/commands/document.rs",
    "src/lib/tauri/document.ts",
    "src/lib/tauri/document.vitest.ts",
    "src/lib/tauri/document-invoke.vitest.ts",
    "src/features/workspace/openFiles.ts",
    "src/features/workspace/openFiles.test.ts",
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx",
    "impl-plans/active/csv-header-contract.md"
  ],
  "sharedPaths": [
    "src-tauri/src/viewer/types.rs",
    "src-tauri/src/viewer/service.rs",
    "src-tauri/src/viewer/service/tests.rs",
    "src/features/workspace/openFiles.ts",
    "src/features/workspace/openFiles.test.ts",
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx"
  ],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/csv-header-contract.md"
}
```

## Design scope and interfaces

Eight logical modules: viewer types, viewer service (including tests), CSV parser, document command, TypeScript IPC (including tests), picker helper (including tests), workspace fixtures, pane fixtures. No new commands, permissions, events, dependencies or persisted preferences. The default service wrapper prevents unrelated existing callers from breaking; the option-aware service entry is a local extension of the accepted data flow, not a new IPC command.

## Related plans and dependencies

- `csv-header-contract`: `impl-plans/active/csv-header-contract.md`; dependsOn: none.
- `csv-header-startup`: `impl-plans/active/csv-header-startup.md`; dependsOn: `csv-header-contract`.
- `csv-header-pane`: `impl-plans/active/csv-header-pane.md`; dependsOn: `csv-header-contract`.
- `csv-header-workspace`: `impl-plans/active/csv-header-workspace.md`; dependsOn: `csv-header-startup`, `csv-header-pane`.
- `csv-header-finalize`: `impl-plans/active/csv-header-finalize.md`; dependsOn: `csv-header-workspace`.

Wave 1: contract. Wave 2: startup and pane may run in parallel after contract acceptance (disjoint write sets). Wave 3: workspace after both. Wave 4: finalization serially after workspace and predecessor evidence join. All other tasks within one plan are sequential.

## Tasks and module status

| Task | Depends on | Deliverable | Agent role | Status | Parallelizable |
|---|---|---|---|---|---|
| C1 | None | Rust contracts and header-neutral service | rust-coding | Implemented — review pending | No |
| C2 | C1 | Frontend boundary and compatibility fixtures | ts-coding | Implemented — review pending | No |
| C3 | C1, C2 | Contract and parser regression tests | check-and-test-after-modify | Repaired — integration review resubmission pending | No |

### C1: Rust contracts and header-neutral service

**Status**: Implemented — review pending
**Depends on**: None
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/commands/document.rs`.

Define FileOpenOptions in viewer/types.rs with a default-false bool csv_first_row_as_header and strict deserialization: omitted field defaults false; present null/string/number and unknown nested fields fail. Add defaulted file_open_options to StartupContext and first_row_as_header in the single CSV response constructor, independently of formatted availability. The current service path lossily decodes file bytes before parsing an in-memory buffer with flexible widths, so its parser-error fallback is unreachable for ordinary file input; cover the production lossy/flexible path instead of inventing an unavailable response. Initialize all existing service startup constructors to false. Preserve the existing path/theme service method as the default-false wrapper; add open_file_preview_with_options accepting path, theme and typed options and returning AppResult<FilePreview>. Route optional typed command options through it. Leave non-CSV variants unchanged.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

### C2: Frontend boundary and compatibility fixtures

**Status**: Implemented — review pending
**Depends on**: C1
**Deliverables**: `src/lib/tauri/document.ts`, `src/features/workspace/openFiles.ts`, `src/features/workspace/openFiles.test.ts`, `src/features/workspace/WorkspaceShell.vitest.tsx`, `src/features/preview/CsvFilePreviewPane.vitest.tsx`.

Add FileOpenOptions with optional readonly csv_first_row_as_header boolean, normalized StartupContext.file_open_options, and a required normalized CSV first_row_as_header boolean. Extend openFilePreview(path: string, options?: FileOpenOptions): Promise<FilePreview>. Preserve path-only invoke shape; use unknown at the invoke boundary and validate new fields. Missing legacy CSV response field becomes false; present non-boolean fails through existing load errors. Startup missing/null outer options defaults false, snake_case presence wins over fileOpenOptions alias even when null, nested keys are snake_case only and reject unknowns/malformed values. Update browser fallbacks and picker-created context defaults, plus existing CSV/startup fixtures in WorkspaceShell and CsvFilePreviewPane tests solely for compatibility; later plans own behavior assertions.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

### C3: Contract and parser regression tests

**Status**: Repaired — integration review resubmission pending
**Depends on**: C1, C2
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service/tests.rs`, `src-tauri/src/viewer/csv.rs`, `src-tauri/src/commands/document.rs`, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts`.

Cover missing/null outer options, omitted nested field, true/false, invalid present nested values and unknown keys in Rust and TypeScript; verify exact invoke and serialization snake_case shapes. Compare service false/true results for identical raw HTML, rows, column widths, source counts, size/modified metadata and fallback except first_row_as_header. Retain has_headers(false), flexible widths, 4,000-record and 120,000-field budgets. Exercise BOM, quoted commas, escaped quotes, multiline records, ragged widths in both directions, empty/header-only input, row/cell truncation, shortened first record, and wide rows. For the configured production path, cover invalid source bytes and ragged rows through ViewerService: lossy decoding plus flexible parsing keeps formatted output available, preserves records and metadata, and changes only first_row_as_header. The csv crate documents that the previously requested parser-error fixture is unreachable with this configuration; do not add test-only injection or an invented malformed-quote failure. Reuse parser tests where sufficient and add focused gaps only.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer`
- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml commands::document`
- `mise exec -- bun run test:dom src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
- `mise exec -- bun run test`
- `mise exec -- bun run typecheck`
- `git diff --check`

## Completion criteria

- [x] Legacy path-only requests and missing response fields retain false; strict new fields reject invalid values.
- [x] Rust and TypeScript wire shapes agree and all constructors/owned fixtures compile.
- [x] True/false preserve parsing, raw output, budgets and source metadata; no header record is consumed.
- [x] Targeted checks and typecheck pass; progress records contain complete logs and terminal exit statuses.

## Execution and shared-directory safety

- Step 3 accepted the design in `comm-000004` (`reviewDecision: accepted`, no findings). Step 4 authors plans only; Step 5 independent plan review remains pending. No Step 5 feedback was supplied on this first attempt.
- The workflow checkpoint must commit the accepted design, all accepted plans and dispatch manifest before native Riela implementation/review fanout. Step 4 does not stage or commit. Use the existing branch and shared working directory; no worktrees, private branches or concurrent git operations. Preserve all unrelated staged, unstaged and untracked work.
- Before every edit, fresh-read the exact target and compute SHA-256 of its current bytes (record ABSENT for new files). Save pre-edit content/hash, exact intended changes and acceptance assertions as an immutable intent snapshot in the checkpoint-provided evidenceRoot/<planId>/<attemptId>/. Never overwrite an earlier snapshot; create a new sequence entry for changed intent.
- Recheck the pre-hash immediately before applying a narrow patch. A mismatch is drift: stop that edit, reread and compare both intents; escalate conflicting ownership to serial repair rather than writing stale contents. Record post-edit content/hash and attributable diff immediately; recheck them after verification and at dependency joins. Hashes detect drift but do not make edits atomic: native change tracking plus independent intent review is still required.
- Own only writePaths and this plan's progress log; sharedPaths list successive ownership or serial reservations, never permission for concurrent writes. Missing discovered callers/fixtures require an explicit ownership update and serialization before editing. Only the designated serial finalizer may perform the reserved formatting/index/lock/archive work; other workers must not do so. No worker runs git mutations. No dependency change is expected.
- After joining workers, serial reconciliation must compare every intent snapshot and final file content, detect silent overwrites, repair one file at a time with fresh hashes, then run affected checks and independent combined review. A clean diff alone is not evidence that intent survived.
- Run all commands in the foreground. Save command, cwd, complete stdout/stderr log, expected exit, actual final exit and completion state under evidenceRoot/<planId>/<attemptId>/. Retain and poll every yielded tool session until exit. Never detach/daemonize. For long-lived UI use an owned foreground terminal or explicit Riela service lifecycle. Incomplete logs cannot pass.
- Use the referenced rust-coding/ts-coding agents for code and invoke check-and-test-after-modify after Rust/TypeScript changes. Follow the repository Rust and TypeScript standards and Tauri boundary skill. Cargo uses CARGO_TERM_QUIET=true; if nextest is substituted also use NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1. Locked tools run through mise. Workers format only owned files using the locked formatter; broad repository formatting is reserved for finalization.
- Update only this plan's status table, checkboxes and Progress Log after each session: completed/in-progress tasks, changed files, dependencies, pre/post hash and intent evidence paths, exact commands/results, blockers and residual risks. Do not mark Completed while required verification or review is pending. Global finalization owns moving plans to impl-plans/completed/ and updating the shared index.

## Codex trace and accepted divergences

The issue originates in Step 1 intake `comm-000002`: “Allow CSV first-row header behavior to be toggled in preview and specified in open options”; issue number and URL are null. Workflow mode is `issue-resolution`.

Codex process references: `AGENTS.md`, `.agents/agents/rust-coding.md`, `.agents/agents/ts-coding.md`, `.agents/agents/check-and-test-after-modify.md`, `.agents/skills/ts-coding-standards/SKILL.md`, `.agents/skills/tauri-development/SKILL.md`, `.agents/skills/chilla-post-edit-launch/SKILL.md`.

The accepted divergences are to retain `has_headers(false)` with headers derived in presentation, and use Riela-owned foreground app verification instead of the launch skill's background example. No Cursor behavior applies; future Cursor integration remains behind a separate adapter. No CSV editing, automatic inference, new delimiter support, global preference, parser-budget change or padded-DOM optimization is included.

## Progress Log

### Session: 2026-09-10 — Step 4 plan authoring

**Tasks Completed**: Planning decomposition only; no implementation tasks completed.
**Tasks In Progress**: None.
**Dependencies**: Step 3 accepted; Step 5 review and plan checkpoint remain pending.
**Evidence**: `tmp/riela-evidence/step4-plan-baseline.json`; author verification is recorded in `tmp/riela-evidence/step4-plan-verification.log`.
**Notes**: Runtime source, accepted design, pre-existing index/README changes and git index were not modified by plan authoring.

**Author self-check**: Confirmed accepted-design coverage, precise task deliverables, DAG ordering, verification gates and change-preservation rules. Corrected missing shared ownership for the pane source before handoff. Step 4 checks validate planning only; no implementation or independent review completion is claimed.

### Session: 2026-09-10 — Step 6 implementation

**Tasks Completed**: C1 Rust contracts/service, C2 TypeScript boundary/fixtures, and C3 contract/regression coverage; independent integrity and implementation reviews remain pending.
**Tasks In Progress**: Review handoff only; this plan remains active.
**Dependencies**: Accepted design remains aligned; no dependency changes.
**Changed files**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/viewer/service/tests.rs`, `src-tauri/src/commands/document.rs`, `src/lib/tauri/document.ts`, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts`, `src/features/workspace/openFiles.ts`, `src/features/workspace/openFiles.test.ts`, `src/features/workspace/WorkspaceShell.vitest.tsx`, `src/features/preview/CsvFilePreviewPane.vitest.tsx`.
**Evidence**: Rust intent/post-edit and command logs: `tmp/csv-header-options-20260910-01/csv-header-contract/rust-c1/`; TypeScript intent/post-edit and command logs: `tmp/csv-header-options-20260910-01/csv-header-contract/ts-c2/`; stable independent post-modification check: `tmp/csv-header-options-20260910-01/csv-header-contract/post-modify-check/20260910T000000Z-step6-retry-01/`; serial plan intent: `tmp/csv-header-options-20260910-01/csv-header-contract/serial-plan/016-plan-progress-intent.md`.
**Verification**: All foreground commands exited 0 on the stable shared tree: `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer` (62 passed); `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml commands::document` (1 passed); `mise exec -- bun run test:dom src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts` (35 passed); `mise exec -- bun run test` (39 passed); `mise exec -- bun run typecheck`; `git diff --check`. Complete logs and terminal statuses are `001-cargo-test-viewer.log` through `006-git-diff-check.log` in the stable post-modification-check evidence directory.
**Notes**: The Rust service retains `has_headers(false)` and applies the option only as CSV response metadata, so no record is consumed. The malformed-quote test assumption was removed because the existing flexible CSV reader accepts it; see `rust-c1/008-cargo-test-viewer-attempt-1.log` and `009-unavailable-test-repair-intent.md`. No unrelated worktree change was staged, reset, committed, or removed.

**Author self-check**: Reviewed final Rust/TypeScript field mapping (`csv_first_row_as_header` request, `first_row_as_header` response), default/strict behavior, parser neutrality, fixtures, implementation-plan status, and stable verification. Subsequent test-integrity feedback is recorded in the repair session below.

### Session: 2026-09-10 — Step 6 test-integrity-001 repair

**Review decision**: `comm-000010` required revision for missing unavailable-formatted/parser-error coverage. The repair preserves `has_headers(false)` and `flexible(true)`; it does not introduce test-only fault injection or restore an invalid malformed-quote assertion.
**Plan revision submitted for re-acceptance**: `csv-1.4.0` documents that errors cannot occur for an in-memory buffer read as records with `flexible(true)`; service input is first converted by `String::from_utf8_lossy`, excluding the crate's invalid-UTF-8 StringRecord error. The C1/C3 assertion is therefore revised to cover the equivalent production path: lossy source bytes plus ragged rows remain formatted, preserve every record/raw output/count/status, and differ only in `first_row_as_header`.
**Changed file**: `src-tauri/src/viewer/service/tests.rs` adds `csv_open_options_preserve_lossy_utf8_and_flexible_rows`.
**Evidence**: `tmp/csv-header-options-20260910-01/csv-header-contract/test-integrity-repair-rust/001-service-tests-precontent-and-intent.md`, `002-service-tests-postedit.md`, `005-cargo-test-viewer.log`, and `006-verification.md`; plan-revision intent: `tmp/csv-header-options-20260910-01/csv-header-contract/test-integrity-plan-revision/001-plan-revision-intent.md`.
**Verification**: `mise exec -- rustfmt --check src-tauri/src/viewer/service/tests.rs`, `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer` (63 passed), and `git diff --check` each exited 0. The independent re-verification below also passed the complete command set.
**Author self-check**: test-integrity-001 is addressed by a production-input regression and the plan revision; no high or mid implementation finding remains.

### Session: 2026-09-10 — Step 6 test-integrity re-verification

**Review decision**: `comm-000010` repair accepted. Inspection confirmed the regression uses production invalid-byte/ragged CSV input through ViewerService, with no test-only error injection; `src-tauri/src/viewer/csv.rs` still uses `has_headers(false)` and `flexible(true)`.
**Verification**: All foreground commands exited 0: `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer` (63 passed, authoritative retry log `002-cargo-test-viewer-retry.log`); `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml commands::document` (1 passed); `mise exec -- bun run test:dom src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts` (35 passed); `mise exec -- bun run test` (39 passed); `mise exec -- bun run typecheck`; and `git diff --check`.
**Evidence**: Complete logs, terminal statuses, and final hashes: `tmp/csv-header-options-20260910-01/csv-header-contract/test-integrity-post-modify-check/20260910T000000Z-step6-repair-verify-01/`; plan acceptance intent: `tmp/csv-header-options-20260910-01/csv-header-contract/test-integrity-plan-revision/004-integrity-acceptance-intent.md`.
**Notes**: The first viewer-log wrapper exited 1 because its shell used zsh's special `status` parameter, although its contained Cargo output passed; the independently rerun `002-cargo-test-viewer-retry.log` is the complete authoritative terminal result (exit 0).

### Session: 2026-09-10 — Integration-contract-001 serial repair

**Review decision**: `comm-000017` required revision because C3's claimed service coverage omitted the required UTF-8 BOM and empty-source fixtures.
**Repair**: Extracted CSV service assertions into `src-tauri/src/viewer/service/tests/csv_open_options_tests.rs` so the touched parent test module remains below the 1,000-line repository limit. Added production `ViewerService` regressions for BOM and empty CSV source files. Each opens the same file with explicit `csv_first_row_as_header: false` and `true`, asserts the flag is the sole difference, and compares path/file/MIME, raw HTML, parsed rows, widths, source counts, status, truncation, formatting availability, parse error, byte size, and modification metadata. The BOM fixture also confirms no BOM becomes a parsed/raw content character; the empty fixture confirms zero records and `Some(0)` source count.
**Changed files**: `src-tauri/src/viewer/service/tests.rs`, `src-tauri/src/viewer/service/tests/csv_open_options_tests.rs`, `impl-plans/active/csv-header-contract.md`.
**Evidence**: Repair intent, pre-change diff, all prior-snapshot hashes, source post-change hashes, test-function locations, and size-integrity result: `tmp/csv-header-options-20260910-01/serial-reconciliation/20260910T061000Z-contract-repair-01/001-repair-intent-and-diff.log`, `013-snapshot-and-test-integrity.log`. Formatting and verification logs are `002-rustfmt.log` through `012-diff-check.log` in the same directory.
**Verification**: Formatting, viewer tests (65 passed), document command test, Cargo check, DOM tests, Bun tests, typecheck, and diff checks exited 0 in `002-rustfmt.log` through `012-diff-check.log`. The first strict Clippy run (`008-cargo-clippy.log`) exited 101 for an unused import left by the test-module extraction; the import was removed without behavior changes. The mandatory post-edit retry then exited 0 for formatting, strict Clippy, viewer tests (65 passed), and diff check in `016-rustfmt-after-clippy-repair.log` through `019-diff-check-retry.log`.
**Residual risk**: Independent integration review owns acceptance; dependent `csv-header-startup`, `csv-header-pane`, `csv-header-workspace`, and `csv-header-finalize` remain pending and were not redispatched by this repair.

### Session: 2026-09-10 — Integration-contract-002 serial repair

**Review decision**: `comm-000019` required revision because extraction preserved test names but omitted assertion-level coverage for the path-only default, response wire serialization, and successful lossy-input status.
**Repair**: Restored the path-only `first_row_as_header == false` assertion. Added a real `FilePreview::Csv` serialization assertion for `first_row_as_header: true` and the absence of the `firstRowAsHeader` alias. Made the lossy UTF-8/ragged-row regression explicitly assert `formatted_available`, `parse_error`, `row_count_status`, and `truncated` for both metadata options. BOM and empty-source regressions remain intact.
**Changed files**: `src-tauri/src/viewer/service/tests/csv_open_options_tests.rs`, `impl-plans/active/csv-header-contract.md`.
**Verification**: All foreground commands exited 0: `mise exec -- rustfmt --check src-tauri/src/viewer/service/tests/csv_open_options_tests.rs`; `CARGO_TERM_QUIET=true mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer` (66 passed); `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml commands::document` (1 passed); `mise exec -- bun run test:dom src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts` (35 passed); `mise exec -- bun run test` (39 passed); `mise exec -- bun run typecheck`; test-integrity search; and `git diff --check`. Complete logs and terminal statuses are `002-rustfmt-check.log` through `010-diff-check.log` in `tmp/csv-header-options-20260910-01/serial-reconciliation/20260910T070000Z-contract-repair-02/`.
**Residual risk**: Independent integration review owns acceptance; dependent plans remain pending and were not dispatched in this wave.
