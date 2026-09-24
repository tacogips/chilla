# CSV header CLI and startup propagation Implementation Plan

**Status**: In Progress
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed (see Step 4 verification log); independent Step 5 review required.

## Dispatch metadata

```json
{
  "planId": "csv-header-startup",
  "planPath": "impl-plans/active/csv-header-startup.md",
  "dependsOn": [
    "csv-header-contract"
  ],
  "writePaths": [
    "src-tauri/src/cli/mod.rs",
    "src-tauri/src/cli/tests.rs",
    "src-tauri/src/main.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/src/app_state.rs",
    "src-tauri/src/viewer/service.rs",
    "src-tauri/src/viewer/service/tests.rs",
    "src-tauri/src/viewer/service/tests/startup_options_tests.rs",
    "impl-plans/active/csv-header-startup.md"
  ],
  "sharedPaths": [
    "src-tauri/src/viewer/service.rs",
    "src-tauri/src/viewer/service/tests.rs"
  ],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/csv-header-startup.md"
}
```

## Design scope and interfaces

Six logical modules: CLI (including tests), main, library builder, app state, viewer service (including tests), own plan. StartupRequest fields and run(request: StartupRequest) -> Result<(), String> are the intended public shape; retain parse_cli generic argument behavior and AppResult<CliParseOutcome>. Normalization error representation may use existing AppError flow; do not redesign CLI target classification.

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
| S1 | csv-header-contract | CLI request and normalization | rust-coding | Implemented — Review Pending | Across startup/pane plans only |
| S2 | S1 | Executable, builder and startup context | rust-coding | Implemented — Review Pending | Across startup/pane plans only |
| S3 | S1, S2 | CLI/startup regression and help | check-and-test-after-modify | Implemented — Review Pending | Across startup/pane plans only |

### S1: CLI request and normalization

**Status**: Implemented — Review Pending
**Depends on**: csv-header-contract
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/cli/tests.rs`.

Introduce StartupRequest with target: StartupTarget and file_open_options: FileOpenOptions; make CliParseOutcome::Run carry the request and retain options in NormalizedCli. Accept only --csv-first-row-header=true|false, lowercase exact equals form, anywhere among positionals. Last valid repetition wins; any invalid occurrence fails with usage exit 2, including beside help/version. Reject bare, empty, space-separated and malformed values. Strip valid global flags before classification; retain existing verbose/cache/Git/GitHub semantics and path ordering/validation. A lone help/version after removal exits 0 without app start or verbose-log creation. Ensure invalid option validation cannot be bypassed by that information-only branch.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

### S2: Executable, builder and startup context

**Status**: Implemented — Review Pending
**Depends on**: S1
**Deliverables**: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/app_state.rs`, `src-tauri/src/viewer/service.rs`.

Change run entry to accept StartupRequest, pass its target explicitly to target resolution and verbose arm_startup_load, and populate StartupContext.file_open_options before AppState retains it. Keep canonicalization in current target resolution; default Finder/no-option launch to false. Fresh-read app_state.rs and edit only if needed to preserve complete context. Preserve the existing default startup_context wrapper or adapt its internal construction safely; add option propagation in the startup path without changing direct path-only IPC defaults. Update affected internal CLI constructors and callers discovered by rg before editing.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

### S3: CLI/startup regression and help

**Status**: Implemented — Review Pending
**Depends on**: S1, S2
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/cli/tests.rs`, `src-tauri/src/viewer/service/tests.rs`.

Update help text in cli/mod.rs with syntax, default, launch scope and examples. Test omitted/true/false, all malformed forms, invalid then valid duplicates, valid duplicates, interspersed arguments, no target/current directory, directory, single file, mixed file set, non-CSV, Git and GitHub targets, cache/verbose combinations and information exits. Verify request-to-StartupContext serialization retains true and explicit false; use executable checks in finalization for actual exit codes and information-only side effects.

- [x] Intended changes and behavior assertions above are implemented.
- [x] Relevant verification commands below pass with complete logs and final statuses.
- [x] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml cli`
- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer`
- `CARGO_TERM_QUIET=true mise exec -- cargo check --manifest-path src-tauri/Cargo.toml`
- `git diff --check`

## Completion criteria

- [x] CLI accepts exactly the documented syntax and default/duplicate/invalid/information-exit precedence.
- [x] All startup target kinds retain typed options through main, run, context and AppState without altering target behavior.
- [x] CLI help and focused Rust checks pass; logging and process-exit validation remains assigned to finalization.

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

**Tasks Completed**: S1, S2 and S3 implementation; independent integrity and implementation review remain pending.
**Tasks In Progress**: Review handoff and serial reconciliation with the pane/workspace/finalization plans.
**Dependencies**: `csv-header-contract` accepted. `app_state.rs` was fresh-read and required no edit because it already retains the complete `StartupContext` passed to `AppState::new`.
**Changed files**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/cli/tests.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/viewer/service/tests.rs`, `src-tauri/src/viewer/service/tests/startup_options_tests.rs`, and this plan. Existing contract-worker changes in the shared viewer files were preserved.
**Intent evidence**: `tmp/csv-header-options-20260910-01/csv-header-startup/step6-implement/intent/001-cli-startup-intent.md` through `012-integrity-repair-plan-intent.md` preserve pre-edit hashes and narrow intent for each edit.
**Verification**: after repairing `comm-000026`, final-tree foreground commands completed with exit 0. `cargo test ... cli` passed 33 tests (`029-cargo-test-cli-revision-final.log`); `cargo test ... viewer` passed 67 tests (`030-cargo-test-viewer-revision-final.log`); `cargo fmt`, `cargo check`, `cargo clippy --all-targets -- -D warnings`, and `git diff --check` also passed (`028-cargo-fmt-revision-final.log`, `031-cargo-check-revision-final.log`, `032-cargo-clippy-revision-final.log`, and `033-git-diff-check-revision-final.log`).
**Integrity repair**: S3 now asserts option-bearing directory, single non-CSV file, file-set, local-Git/verbose, GitHub/cache, and information routes. The dedicated startup-context test verifies true and explicit false serialization for every `StartupTarget` variant without weakening pre-existing CSV tests.
**Residual risks**: Runtime launch, actual process-exit codes, and verbose-log side effects are deliberately deferred to `csv-header-finalize`. The shared working tree changed in unrelated pane/UI files while this plan ran; no overlapping source hunk was overwritten, but serial reconciliation must compare the recorded intents before final acceptance.
