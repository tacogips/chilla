# CSV header request and response contract Implementation Plan

**Status**: Ready
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed (see Step 4 verification log); independent Step 5 review required.

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
| C1 | None | Rust contracts and header-neutral service | rust-coding | Not Started | No |
| C2 | C1 | Frontend boundary and compatibility fixtures | ts-coding | Not Started | No |
| C3 | C1, C2 | Contract and parser regression tests | check-and-test-after-modify | Not Started | No |

### C1: Rust contracts and header-neutral service

**Status**: Not Started
**Depends on**: None
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/src/commands/document.rs`.

Define FileOpenOptions in viewer/types.rs with a default-false bool csv_first_row_as_header and strict deserialization: omitted field defaults false; present null/string/number and unknown nested fields fail. Add defaulted file_open_options to StartupContext and first_row_as_header to every CSV response, including unavailable formatted output. Initialize all existing service startup constructors to false. Preserve the existing path/theme service method as the default-false wrapper; add open_file_preview_with_options accepting path, theme and typed options and returning AppResult<FilePreview>. Route optional typed command options through it. Leave non-CSV variants unchanged.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### C2: Frontend boundary and compatibility fixtures

**Status**: Not Started
**Depends on**: C1
**Deliverables**: `src/lib/tauri/document.ts`, `src/features/workspace/openFiles.ts`, `src/features/workspace/openFiles.test.ts`, `src/features/workspace/WorkspaceShell.vitest.tsx`, `src/features/preview/CsvFilePreviewPane.vitest.tsx`.

Add FileOpenOptions with optional readonly csv_first_row_as_header boolean, normalized StartupContext.file_open_options, and a required normalized CSV first_row_as_header boolean. Extend openFilePreview(path: string, options?: FileOpenOptions): Promise<FilePreview>. Preserve path-only invoke shape; use unknown at the invoke boundary and validate new fields. Missing legacy CSV response field becomes false; present non-boolean fails through existing load errors. Startup missing/null outer options defaults false, snake_case presence wins over fileOpenOptions alias even when null, nested keys are snake_case only and reject unknowns/malformed values. Update browser fallbacks and picker-created context defaults, plus existing CSV/startup fixtures in WorkspaceShell and CsvFilePreviewPane tests solely for compatibility; later plans own behavior assertions.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### C3: Contract and parser regression tests

**Status**: Not Started
**Depends on**: C1, C2
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service/tests.rs`, `src-tauri/src/viewer/csv.rs`, `src-tauri/src/commands/document.rs`, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts`.

Cover missing/null outer options, omitted nested field, true/false, invalid present nested values and unknown keys in Rust and TypeScript; verify exact invoke and serialization snake_case shapes. Compare service false/true results for identical raw HTML, rows, column widths, source counts, size/modified metadata and fallback except first_row_as_header. Retain has_headers(false), flexible widths, 4,000-record and 120,000-field budgets. Exercise BOM, quoted commas, escaped quotes, multiline records, ragged widths in both directions, empty/header-only input, row/cell truncation, shortened first record, wide rows, and an actual parser error rather than invented strict quote rejection. Reuse parser tests where sufficient and add focused gaps only.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer`
- `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml commands::document`
- `mise exec -- bun run test:dom src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
- `mise exec -- bun run test`
- `mise exec -- bun run typecheck`
- `git diff --check`

## Completion criteria

- [ ] Legacy path-only requests and missing response fields retain false; strict new fields reject invalid values.
- [ ] Rust and TypeScript wire shapes agree and all constructors/owned fixtures compile.
- [ ] True/false preserve parsing, raw output, budgets and source metadata; no header record is consumed.
- [ ] Targeted checks and typecheck pass; progress records contain complete logs and terminal exit statuses.

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
