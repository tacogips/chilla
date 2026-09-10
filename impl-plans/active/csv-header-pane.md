# CSV first-row header presentation Implementation Plan

**Status**: Ready
**Created**: 2026-09-10
**Last Updated**: 2026-09-10
**Design Reference**: `design-docs/specs/design-csv-viewer.md#first-row-header-options` and `design-docs/specs/command.md#csv-file-open-options`
**Review state**: Author self-check passed (see Step 4 verification log); independent Step 5 review required.

## Dispatch metadata

```json
{
  "planId": "csv-header-pane",
  "planPath": "impl-plans/active/csv-header-pane.md",
  "dependsOn": [
    "csv-header-contract"
  ],
  "writePaths": [
    "src/features/preview/CsvFilePreviewPane.tsx",
    "src/features/preview/CsvFilePreviewPane.vitest.tsx",
    "src/app/App.css",
    "impl-plans/active/csv-header-pane.md"
  ],
  "sharedPaths": [
    "src/features/preview/CsvFilePreviewPane.vitest.tsx",
    "src/features/preview/CsvFilePreviewPane.tsx"
  ],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/csv-header-pane.md"
}
```

## Design scope and interfaces

Three logical modules: CSV pane, pane DOM tests, application stylesheet. Controlled state belongs to workspace; no persistent or local competing preference. The temporary optional-prop compatibility is removed by the workspace plan after both callers and fixtures have been adapted, so the final controlled contract is required.

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
| P1 | csv-header-contract | Controlled pane and semantic table | ts-coding | Not Started | Across startup/pane plans only |
| P2 | P1 | Checkbox, empty/failure/count states and styling | ts-coding | Not Started | Across startup/pane plans only |
| P3 | P1, P2 | DOM and safety regression cases | check-and-test-after-modify | Not Started | Across startup/pane plans only |

### P1: Controlled pane and semantic table

**Status**: Not Started
**Depends on**: csv-header-contract
**Deliverables**: `src/features/preview/CsvFilePreviewPane.tsx`.

Extend CsvFilePreviewPane props with firstRowAsHeader and onFirstRowAsHeaderChange(value: boolean): void, alongside existing preview/presentationMode. Keep these props optional only until workspace integration supplies them, with response/default-false fallback and a disabled control if no callback; final integrated application always passes both. Derive H = 1 only for enabled state and nonempty retained rows; render header from record 1 and body from record H onward, without mutating payload. Off mode keeps numeric columns and every body record. Preserve source-record gutters starting at 2 with headers, 1 otherwise. Empty/missing labels fall back to numeric column index and accessible Column N names; preserve whitespace, duplicate labels and multiline text as text nodes, never markup. Pad body/header to existing column_count without adding columns.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### P2: Checkbox, empty/failure/count states and styling

**Status**: Not Started
**Depends on**: P1
**Deliverables**: `src/features/preview/CsvFilePreviewPane.tsx`, `src/app/App.css`.

Add native Use first row as header checkbox in formatted pane header, keyboard focusable with Space and visible focus styling in App.css; no global shortcut. Keep it usable for empty CSV; disable it when formatted_available is false and suppress the table in direct failure-pane rendering. Raw mode keeps exact raw content. Empty source shows No CSV records; one retained header shows headers, empty body and No data rows. Display body count N-H; transform a known positive source total by one in header mode, preserve unknown totals, or label unchanged counts explicitly as source records. Keep truncation/error notices and dimensions independent of the toggle.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

### P3: DOM and safety regression cases

**Status**: Not Started
**Depends on**: P1, P2
**Deliverables**: `src/features/preview/CsvFilePreviewPane.vitest.tsx`.

Use a controlled reactive test harness to prove checkbox changes are reflected without IPC; assert label/checked/disabled/focus semantics, callback values and Space in a real app where jsdom lacks native default actions. Test both modes, no double removal, gutters, empty/header-only, blank/duplicate/ragged labels, multiline/HTML-like text rendered safely, known/unknown counts, truncation, shortened first record and wide-row dimensions. Raw and unavailable formatted cases must remain safe.

- [ ] Intended changes and behavior assertions above are implemented.
- [ ] Relevant verification commands below pass with complete logs and final statuses.
- [ ] Own progress log and immutable change evidence are updated.

## Verification commands

Commands run from the repository root. These are future implementation checks, not Step 4 results. Expect exit 0 except the explicitly invalid CLI commands in finalization, which must exit 2. Create report.csv and a second CSV fixture with quoted/multiline and blank/ragged header examples under the listed temporary fixture directory before launch. Capture actual fixture bytes and absolute log paths in evidence. A normal UI close must reach terminal exit; forced termination is recorded as such and never converted to a normal passing exit.

- `mise exec -- bun run test:dom src/features/preview/CsvFilePreviewPane.vitest.tsx`
- `mise exec -- bun run typecheck`
- `git diff --check`

## Completion criteria

- [ ] Header-on/off renders the correct records, labels, gutters and count semantics without payload changes.
- [ ] Checkbox is accessible; empty, header-only, unavailable formatted and raw cases match design.
- [ ] Focused DOM tests and typecheck pass; real keyboard/UI confirmation remains assigned to finalization.

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
