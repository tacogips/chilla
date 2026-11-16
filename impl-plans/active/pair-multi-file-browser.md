# Pair View Multi-File: FileBrowserPane Pair Markers And Source-Order Mode

**Status**: Ready
**Plan ID**: pair-multi-file-browser
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (List Markers, Source-Order Listing Contract / Sorting in the pair list, Validation/TypeScript)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

In pair view, the explicit file list (`FileBrowserPane` with
`listingKind="explicit_file_set"`) must:

- show which file is in the left / right pane;
- keep CLI order (no re-sorting).

This plan adds two optional props. Without them, `FileBrowserPane` renders
and behaves exactly as today.

## Pinned Contract (consumed by pair-multi-workspace)

`src/features/file-view/FileBrowserPane.tsx`, `FileBrowserPaneProps` gains:

```ts
readonly pairMarkerForPath?: (path: string) => "L" | "R" | "LR" | null;
readonly sourceOrder?: boolean;
```

## Behavior

- Markers:
  - When `pairMarkerForPath` is given and returns non-null for `entry.path`,
    render the badge `<span class="file-browser__pair-marker" data-pair-marker="L|R|LR">`
    after the entry name inside the row button. Visible text: `L`, `R`, or
    `L R`.
  - The row's `aria-label` gets a suffix: ", shown in left pane",
    ", shown in right pane", or ", shown in both panes".
  - The suffix is appended to the existing `accessibleName()`; keep the
    symlink wording intact.
  - Markers must be reactive. Call the function inside JSX/memos, not once
    at row creation.
- Source order:
  - When `sourceOrder` is true, the sort summary (both places that render
    `sortSummary()`, about lines 847 and 1402) shows `Order: command line`
    instead of `describeFileTreeSort(props.sort)`.
  - The `sort.*` and `sort.reset` keymap actions (about lines 752-757) do
    nothing; do not call `props.onChangeSort`.
  - Without the prop, sorting behaves as today.
- The client-side filter (`filteredEntries`) must not reorder entries. Check
  this; if it sorts, keep that sort out of the `sourceOrder` path.

## Non-Goals

- No change to directory mode, tree mode, search panels, or load-more.
- Do not import from `src/features/pair-view/`; the literal union is inlined.
- No WorkspaceShell edits.

## File-Level Changes

- `src/features/file-view/FileBrowserPane.tsx`: the props and behavior above.
- `src/features/file-view/FileBrowserPane.vitest.tsx`: tests. Imitate the
  existing explicit-file-set render tests in this file.
- `src/app/App.css`: `.file-browser__pair-marker` badge style (small,
  monospace, bordered, uses existing color variables). Add it next to the
  existing `.file-browser__button--active` rules. Edit only that location.

## Test Cases (input -> expected)

- No marker prop -> no `.file-browser__pair-marker` in the DOM; aria-labels
  unchanged.
- Marker fn: a -> "L", b -> "R", c -> null -> a's row badge `L`, label
  "a.png, shown in left pane"; b's row badge `R`; c has no badge.
- Marker fn returns "LR" -> badge text `L R`, label suffix
  ", shown in both panes".
- Rerender with a changed marker fn (signal-backed) -> badges move.
- `sourceOrder` true -> summary contains `Order: command line`; dispatching
  the sort key binding (for example `,` then `a`) does not call
  `onChangeSort`.
- `sourceOrder` absent -> the same key sequence calls `onChangeSort`
  (existing behavior).
- Entries passed in order z, a, m with `sourceOrder` -> rendered row order is
  z, a, m.

## Invariants

- Rows still use `data-path`, the existing classes, and the existing
  onClick/confirm routing. No change to the `onSelectEntry` /
  `onConfirmEntry` semantics.

## Overwrite Safety

Re-read each file fresh before editing. Record start hashes. `src/app/App.css`
is large and shared: make one localized insertion, and verify with
`git diff src/app/App.css` that only that block changed. On drift, re-read and
re-apply. `pair-multi-workspace` may edit App.css later (wave 2); not in this
wave.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/file-view/FileBrowserPane.vitest.tsx`
   -> exit 0.
2. `bunx tsc --noEmit 2>&1 | grep "src/features/file-view/"` -> no output.
3. `bunx biome check src/features/file-view/FileBrowserPane.tsx src/features/file-view/FileBrowserPane.vitest.tsx`
   -> exit 0.
4. `git diff --stat src/app/App.css` -> only additions in one hunk.

## Completion Criteria

- [ ] Both optional props implemented as specified; no behavior change
      without them.
- [ ] Badge CSS added.
- [ ] Test cases pass; verification 1-4 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.
