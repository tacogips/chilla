# CSV header serial reconciliation, documentation and verification Implementation Plan

**Status**: Ready
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed (see Step 4 verification log); independent Step 5 review required.

## Dispatch metadata

```json
{
  "planId": "csv-header-finalize",
  "planPath": "impl-plans/active/csv-header-finalize.md",
  "dependsOn": [
    "csv-header-workspace"
  ],
  "writePaths": [
    "README.md",
    "impl-plans/README.md",
    "impl-plans/active/csv-header-finalize.md"
  ],
  "sharedPaths": [
    "src-tauri/src/app_state.rs",
    "src-tauri/src/cli/mod.rs",
    "src-tauri/src/cli/tests.rs",
    "src-tauri/src/commands/document.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/src/main.rs",
    "src-tauri/src/viewer/csv.rs",
    "src-tauri/src/viewer/service.rs",
    "src-tauri/src/viewer/service/tests.rs",
    "src-tauri/src/viewer/types.rs",
    "src/app/App.css",
    "src/features/preview/CsvFilePreviewPane.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx",
    "src/features/workspace/WorkspaceDocumentColumn.tsx",
    "src/features/workspace/WorkspaceDocumentColumn.vitest.tsx",
    "src/features/workspace/WorkspaceHeader.vitest.tsx",
    "src/features/workspace/WorkspaceShell.tsx",
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "src/features/workspace/openFiles.test.ts",
    "src/features/workspace/openFiles.ts",
    "src/lib/tauri/document-invoke.vitest.ts",
    "src/lib/tauri/document.ts",
    "src/lib/tauri/document.vitest.ts",
    "README.md",
    "impl-plans/README.md",
    "Cargo.lock",
    "bun.lock"
  ],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/csv-header-finalize.md"
}
```

## Design scope and interfaces

Serial-only documentation, integrity and verification work; no new product architecture. README/index are ordinary writePaths; other plans source files are reserved sharedPaths for evidence-driven repair. Cargo.lock and bun.lock are reservations only: no dependency change is planned or authorized by this design. Broad formatting, if necessary, runs bash .agents/scripts/format-ts.sh and CARGO_TERM_QUIET=true mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml only here under before/after snapshots; restore only formatter-attributable unrelated hunks, never whole dirty files. Prefer owned-file formatting before this phase.

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
| F1 | csv-header-workspace; all predecessor evidence joined | Serial integrity reconciliation | serial finalizer | Not Started | No |
| F2 | F1 | User documentation and index preparation | serial finalizer | Not Started | No |
| F3 | F1, F2 | Combined verification and real app exercise | check-and-test-after-modify plus Riela-owned UI verifier | Not Started | No |

### F1: Serial integrity reconciliation

**Status**: Not Started
**Depends on**: csv-header-workspace; all predecessor evidence joined
**Deliverables**: `impl-plans/active/csv-header-finalize.md`. Repair targets are the exact sharedPaths reserved above; record ownership expansion before source edits. Immutable join/repair reports belong under the checkpoint evidenceRoot.

After predecessor evidence is joined, compare immutable intent snapshots and pre/post hashes against current files, not only git diff. Reconcile overwritten edits serially using fresh reads, preserve baseline unrelated hunks, and re-run affected checks after each repair. Reserve all source sharedPaths for attributable repair only; expand write ownership in recorded reconciliation evidence before an edit. Shared indexes, lockfile generation (none expected), broad formatting and global plan archiving are exclusively serial. Invoke required coding and check agents for repairs. No workers edit another plan progress log or a shared dispatch manifest. Native workflow join and mandatory serial repair/independent combined review still run after implementation fanout; this task supplies evidence and never bypasses those gates.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### F2: User documentation and index preparation

**Status**: Not Started
**Depends on**: F1
**Deliverables**: `README.md`, `impl-plans/README.md`.

Update README.md with checkbox, default false, exact CLI equals syntax, examples, launch scope, explicit false override and reload/new-preview lifetime. Fresh-read and preserve existing README edits. Compare docs with accepted design-csv-viewer.md and command.md; report design defects for design revision rather than silently changing accepted requirements. Prepare an additive impl-plans/README.md index update preserving its pre-existing content. Archive all five plans only in global workflow finalization after implementation, independent review, runtime verification and completion criteria pass; update links/status then. Until then, each worker updates only its own plan progress.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### F3: Combined verification and real app exercise

**Status**: Not Started
**Depends on**: F1, F2
**Deliverables**: `impl-plans/active/csv-header-finalize.md`. Complete command logs, CLI exit assertions, CSV fixtures and visible-interaction evidence belong under the checkpoint evidenceRoot; report fixture paths used by the commands below.

Run full mixed-stack verification and debug build. Exercise default/true/false starts with actual CSV fixtures, Space/checkbox focus, header counts/gutters, Raw/Formatted, reload, second-file reset and picker navigation; capture visible results or explicitly block UI acceptance. Run CLI process cases for true/false plus help/version and invalid/bare/empty/space-separated values, verifying expected exit 0 or 2 and information-only no verbose-log creation using a baseline file listing (do not repurpose HOME). Keep all logs and terminal statuses. Foreground app sessions remain owned until normal close/observed exit; a launch alone is not a passing UI check. Report any unrelated baseline test failures without erasing edits or calling them passes.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `CARGO_TERM_QUIET=true mise run verify`
- `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle`
- `target/debug/chilla --csv-first-row-header=true tmp/riela-evidence/csv-header-fixtures/report.csv`
- `target/debug/chilla --csv-first-row-header=false tmp/riela-evidence/csv-header-fixtures/report.csv`
- `target/debug/chilla tmp/riela-evidence/csv-header-fixtures/report.csv`
- `target/debug/chilla --csv-first-row-header=true --verbose --help`
- `target/debug/chilla --csv-first-row-header=false --version`
- `target/debug/chilla --csv-first-row-header=invalid --help`
- `target/debug/chilla --csv-first-row-header --version`
- `target/debug/chilla --csv-first-row-header= --help`
- `target/debug/chilla --csv-first-row-header true --help`
- `git diff --check`
- `git status --short`

## Completion criteria

- [ ] Combined source preserves every accepted plan intent and unrelated baseline edit; serial repair evidence is complete.
- [ ] README and index updates are accurate; archiving waits for global acceptance.
- [ ] Full Bun/Rust checks and rebuilt app pass; visible UI behavior and CLI expected exits have complete logs.
- [ ] No owned process remains running on return; blocked checks and high/mid findings remain explicit until resolved.
- [ ] Independent implementation, integrity, adversarial and combined design/implementation review gates pass before global completion.

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
