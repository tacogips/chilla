# Pair Compare: Remove Pair Markers And Source Order From FileBrowserPane

**Status**: Ready
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

- [ ] Marker and source-order props and their rendering are removed
- [ ] Collapse button kept and tested
- [ ] Marker CSS removed
- [ ] Scoped vitest, biome, grep, and tsc checks pass

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-file-browser.
