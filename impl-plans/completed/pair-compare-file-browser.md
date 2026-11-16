# Pair Compare: Remove Pair Markers And Source Order From FileBrowserPane

**Status**: Completed
**Plan ID**: pair-compare-file-browser
**Wave**: 1 (dependsOn: none)
**Design Reference**: design-docs/specs/design-pair-view.md (Active-Pane Removal, Workspace Integration last bullet, Validation/TypeScript FileBrowserPane)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

Pair mode no longer uses `FileBrowserPane`; it uses the new `PairListPane`.
The uncommitted, rejected work added two props to `FileBrowserPane`:

- `pairMarkerForPath`, which renders L/R/LR badges and accessible-name
  suffixes.
- `sourceOrder`, which shows an "Order: command line" summary and guards the
  sort actions.

It also added the `.file-browser__pair-marker` CSS rule. All of these must be
removed.

The `onCollapse` prop and the `CollapsePaneButton` header lead (including
`.pane__header-lead` and `.pane__collapse` in `App.css`) are accepted reuse
and must stay.

## Non-Goals

- Do not edit `WorkspaceShell.tsx`. Wave 2 removes the props from its call
  site; until then, tsc errors there are expected.
- Do not touch `CollapsePaneButton.tsx`, `PrDiffWorkspace.tsx`, or keymap
  files.
- No other `FileBrowserPane` behavior change.

## File-Level Changes

Baseline: `git show 9aa3772:<path>` (read-only).

### `src/features/file-view/FileBrowserPane.tsx`

- Remove the `pairMarkerForPath` and `sourceOrder` props.
- Restore `sortSummary` to `createMemo(() => describeFileTreeSort(props.sort))`.
- Restore `sort.reset` and the `sort.<field>.<direction>` actions to their
  unguarded `9aa3772` form.
- Restore the per-row `accessibleName` to the `9aa3772` form (the symlink
  suffix only).
- Remove the marker `<Show>` span.
- Keep the `onCollapse` prop, the `CollapsePaneButton` import, and the
  `pane__header-lead` wrapper.
- After the edit, `git diff 9aa3772 -- src/features/file-view/FileBrowserPane.tsx`
  shows only the `onCollapse` / `CollapsePaneButton` / header-lead hunks.

### `src/features/file-view/FileBrowserPane.vitest.tsx`

- Delete the tests "renders reactive pair markers and preserves command-line
  order" and "only dispatches sort shortcuts outside source-order mode".
- Add one test: rendered with `onCollapse`, a button named
  `Collapse left pane` exists, and clicking it calls `onCollapse` once.
  Without the prop, no such button exists.

### `src/app/App.css`

- Delete the `.file-browser__pair-marker` rule.
- Keep `.pane__header-lead`, `.pane__collapse`, and their `:hover` and
  `:focus-visible` rules.

## Verification

- `bunx vitest run --config vitest.config.ts src/features/file-view/FileBrowserPane.vitest.tsx`
  -> exit 0.
- `bunx biome check src/features/file-view/FileBrowserPane.tsx src/features/file-view/FileBrowserPane.vitest.tsx src/app/App.css`
  -> exit 0. If biome does not process CSS in this repository, check only
  the TS files.
- `grep -rn "pairMarkerForPath\|sourceOrder\|pair-marker\|Order: command line" src/features/file-view src/app/App.css`
  -> no output.
- `bunx tsc --noEmit 2>&1 | grep "src/features/file-view/"` -> no output.

## Concurrency And Drift Rules

- Re-read each file before editing it. Record sha256 before and after the
  edit in the progress log.
- Do not edit files outside writePaths. Report drift.

## Completion Criteria

- [x] Marker and source-order props and their rendering are removed
- [x] Collapse button kept and tested
- [x] Marker CSS removed
- [x] Scoped vitest, biome, grep, and tsc checks pass

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-file-browser.


### Session: 2026-11-16 — implementation
**Tasks Completed**: Removed rejected file-row pair markers and source-order behavior; retained and tested the collapse button. Scoped Vitest passed 18 tests; Biome passed; grep and scoped TypeScript checks produced no matches. Full TypeScript diagnostics remain in downstream integration files. Formal review and finalization are pending.

**SHA-256 before → after**:
- `src/features/file-view/FileBrowserPane.tsx`: `7fd9781603dcf377468f9acb6b3849cafce1b7a10d53b101393bbf2fbad0ea37` → `0e255f480dc6d861a8a076d10c484471cc0d407456a077b4e047655c0b219bef`
- `src/features/file-view/FileBrowserPane.vitest.tsx`: `4884e9d790a84bd12abfdbce8945422a1952302208043b5b05e8fcbbe8036f71` → `ac14d8ab3537dce756699dbe41436e4ae3d5de0967248363a7888e6f5017010b`
- `src/app/App.css`: `6850c2e09b511c6e2d447c44ae6a5e661e03a19c84429e86a658b8c053b88061` → `7c821d6b59ca332223e275ddc7fb15e175f622c9759aa3b451b5073a7ce7749d`
- This plan before update: `fccd30b16f9ea85b6a6ccc757af1ae74c19ac2eea4b71ac4bd8a95c03daad466`; its final hash is recorded in the plan-local evidence, avoiding a self-referential hash.

**Evidence**: `tmp/pair-compare-20261116-01/pair-compare-file-browser/attempt-1/` and `attempt-2/`.
