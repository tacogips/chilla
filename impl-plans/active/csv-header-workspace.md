# CSV header workspace lifetime and reload races Implementation Plan

**Status**: Ready
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed (see Step 4 verification log); independent Step 5 review required.

## Dispatch metadata

```json
{
  "planId": "csv-header-workspace",
  "planPath": "impl-plans/active/csv-header-workspace.md",
  "dependsOn": [
    "csv-header-startup",
    "csv-header-pane"
  ],
  "writePaths": [
    "src/features/workspace/WorkspaceShell.tsx",
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "src/features/workspace/WorkspaceDocumentColumn.tsx",
    "src/features/workspace/WorkspaceDocumentColumn.vitest.tsx",
    "src/features/workspace/WorkspaceHeader.vitest.tsx",
    "src/features/workspace/openFiles.ts",
    "src/features/workspace/openFiles.test.ts",
    "src/features/preview/CsvFilePreviewPane.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx",
    "impl-plans/active/csv-header-workspace.md"
  ],
  "sharedPaths": [
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "src/features/workspace/openFiles.ts",
    "src/features/workspace/openFiles.test.ts",
    "src/features/preview/CsvFilePreviewPane.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx"
  ],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/csv-header-workspace.md"
}
```

## Design scope and interfaces

Six logical modules: workspace shell (tests), document column (tests), header regression tests, picker helper (tests), CSV pane (tests, required-prop completion only), own plan. The generation tracking extends existing request identity locally; no new state framework, persistence, command or global preference.

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
| W1 | csv-header-startup, csv-header-pane | Initial defaults and controlled state wiring | ts-coding | Not Started | No |
| W2 | W1 | Reload generation and selection precedence | ts-coding | Not Started | No |
| W3 | W1, W2 | Workspace integration and race tests | check-and-test-after-modify | Not Started | No |

### W1: Initial defaults and controlled state wiring

**Status**: Not Started
**Depends on**: csv-header-startup, csv-header-pane
**Deliverables**: `src/features/workspace/WorkspaceShell.tsx`, `src/features/workspace/WorkspaceDocumentColumn.tsx`, `src/features/workspace/openFiles.ts`, `src/features/preview/CsvFilePreviewPane.tsx`, `src/features/preview/CsvFilePreviewPane.vitest.tsx`.

Capture launch csv_first_row_as_header separately from replaceable startup/browser-root context. Extend internal preview open flow to accept per-open FileOpenOptions; use explicit boolean including false, otherwise launch default even for empty options, otherwise false. Initialize active CSV state only from an accepted new-preview response. Pass required firstRowAsHeader and onFirstRowAsHeaderChange through WorkspaceDocumentColumn to CsvFilePreviewPane; remove temporary optional-prop compatibility and update pane/column fixtures. Picker contexts preserve launch defaults for new file, file-set and directory navigation. Checkbox changes update only active state and never call IPC or change launch defaults.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### W2: Reload generation and selection precedence

**Status**: Not Started
**Depends on**: W1
**Deliverables**: `src/features/workspace/WorkspaceShell.tsx`.

Use existing preview request identity plus active preview-generation identity to discard stale content and setting responses. Preserve active setting during Raw/Formatted changes, theme refresh and same-preview reload; include captured setting in reload request without overwriting a later toggle on response. Failed reload/retry retains the setting for that preview generation. Selecting another file, returning, or opening a new picker target initializes again from explicit/open launch default. Non-CSV and diff paths ignore CSV state and expose no checkbox. Preserve existing shortcuts and pane focus, including dirty-worktree changes.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### W3: Workspace integration and race tests

**Status**: Not Started
**Depends on**: W1, W2
**Deliverables**: `src/features/workspace/WorkspaceShell.vitest.tsx`, `src/features/workspace/WorkspaceDocumentColumn.vitest.tsx`, `src/features/workspace/WorkspaceHeader.vitest.tsx`, `src/features/workspace/openFiles.test.ts`.

Add deterministic deferred-response tests for toggling during reload, stale old-selection response, failed reload/retry and theme refresh. Assert explicit false overrides true launch default, empty options inherit it, toggling never invokes/reparses/writes, new-file/return reset, file/directory picker defaults survive replaced context, non-CSV behavior and independent Raw/Formatted state. Verify WorkspaceHeader shared shortcuts and WorkspaceDocumentColumn props without changing header shortcut implementation.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `mise exec -- bun run test:dom src/features/workspace/WorkspaceShell.vitest.tsx src/features/workspace/WorkspaceDocumentColumn.vitest.tsx src/features/workspace/WorkspaceHeader.vitest.tsx src/features/preview/CsvFilePreviewPane.vitest.tsx`
- `mise exec -- bun run test`
- `mise exec -- bun run typecheck`
- `git diff --check`

## Completion criteria

- [ ] Explicit/open/launch/default precedence, picker navigation and active setting lifetime match design.
- [ ] Reload and selection races preserve latest active intent and reject stale responses.
- [ ] All required controlled props are wired; non-CSV, Raw/Formatted, shortcut and focus regressions pass.
- [ ] Pre-existing workspace edits survive; owned tests and typecheck pass with complete evidence.

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
