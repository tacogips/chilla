# Pair Compare: WorkspaceShell Integration

**Status**: Ready
**Plan ID**: pair-compare-workspace
**Wave**: 2 (dependsOn: pair-compare-ts-contract, pair-compare-pair-view, pair-compare-file-browser)
**Design Reference**: design-docs/specs/design-pair-view.md (State Ownership, Workspace Integration, Pane Toggle Shortcuts, Validation/TypeScript WorkspaceShell)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

`WorkspaceShell` owns the pair state and wires these pieces together:

- the new `file_pair` payload (`pairs`, from pair-compare-ts-contract)
- the pair state module, the controlled `PairView`, and `PairListPane`
  (from pair-compare-pair-view)
- the trimmed `FileBrowserPane` (from pair-compare-file-browser)

It must also remove every rejected-model leftover from the working tree:

- `activeSide` handling, `assignPathToActivePane`, and `pairMarkerForPath`
- the pair routing in `handleSelectEntry` / `handleConfirmEntry`
- every `sourceOrder` use
- loading an explicit file-set listing for pair startup

This plan is the first point where the whole frontend must typecheck.

## Contracts Consumed (do not change them; report a mismatch as drift)

- `BrowserRoot` `file_pair` = `{ kind, pairs: readonly FilePairPaths[] }`.
- `listExplicitFileSet(paths, sort, query, offset, limit)` with no options.
- `initialPairState(pairs)`, `selectPair(state, i)`, `selectedPair(state)`,
  `setPairVisibility`, and `togglePairPane` from
  `src/features/pair-view/pairPaneVisibility.ts`.
- `PairView` props without `activeSide` / `onActivate`.
- `PairListPane({ pairs, selectedIndex, onSelect, onCollapse })`.

## Non-Goals

- Do not edit the files of the wave-1 plans, `keymap.ts`,
  `workspaceShortcuts.tsx`, `CollapsePaneButton.tsx`, or
  `PrDiffWorkspace.tsx`. The `{` / `}` bindings and help entries already
  exist and are kept.
- Do not change the startup branches for directory, explicit_file_set
  (picker / macOS open-files and CLI 3+ files), GitHub, or Git diff, except
  for removing the `sourceOrder` plumbing.
- No persistence of selection or visibility.

## File-Level Changes

### `src/features/workspace/workspaceDirectoryState.ts`

- Remove `sourceOrder?: boolean` from `LoadedDirectoryState`.

### `src/features/workspace/WorkspaceShell.tsx`

- `loadExplicitFileSetState` (around lines 350-420), the load-more and
  query paths (around lines 534 and 568), reload (around line 856), the sort
  guard (around line 1136), and line 1504: remove the `sourceOrder`
  parameter, the stored field, and the `{ sourceOrder: true }` invoke option.
  Calls must match the `9aa3772` shape.
- The `file_pair` startup branch (around line 798):
  - `setActiveGitDiffTarget(null)`
  - `setFileTreeOpen(false)`
  - `setPairState(initialPairState(browserRoot.pairs))`
  - `clearDocumentArea()`
  - Do not call `loadExplicitFileSetState` or `previewSelectedFile`.
- Pair memos:
  - `pairLeftPath = selectedPair(state)?.left_file_path ?? ""`
  - `pairRightPath = selectedPair(state)?.right_file_path ?? ""`
- `handleSelectEntry` / `handleConfirmEntry`: delete the `isPairMode()`
  branches. `FileBrowserPane` is not mounted in pair mode.
- Rendering inside `<Show when={isFileTreeOpen()}>`:
  - When `isPairMode() && pairState()`, render
    `<PairListPane pairs selectedIndex onSelect onCollapse={handleToggleFileTree} />`.
    `onSelect` is `(i) => setPairState(s => s && selectPair(s, i))`.
  - Otherwise render `FileBrowserPane` exactly as before, without the
    `sourceOrder` and `pairMarkerForPath` props.
- `PairView` call: drop `activeSide` and `onActivate`; keep
  `onChangeVisibility` with `setPairVisibility`.
- `focusVisiblePane` (around line 1646): add `.pair-list` to the open-tree
  selector (`".file-browser, .pr-browser, .pair-list"`). The existing
  `[aria-selected="true"]` lookup then focuses the selected pair row.
- Keep these unchanged:
  - The `pair.left.toggle` / `pair.right.toggle` handlers
  - `sidebar.toggle` -> `handleToggleFileTree`, `showExpandTab`, and the
    expand strip
  - `canReloadCurrent` and `handleReloadCurrent`, which call `pairReload` in
    pair mode
- Remove unused imports (`activatePairSide`, `assignPathToActivePane`,
  `pairMarkerForPath`).
- Check that no other path forces `setFileTreeOpen(true)` during pair
  startup (see lines around 940, 984, and 1095).

### `src/features/workspace/WorkspaceFeedback.vitest.tsx`

- Change the file_pair fixture to
  `pairs: [{ left_file_path: "/workspace/a", right_file_path: "/workspace/b" }]`.

### `src/features/workspace/WorkspaceShell.vitest.tsx`

Replace the three rejected-model tests (around line 2662 "opens and reloads
both pair previews with a folded file browser", around 2724 "routes ordered
pair-list choices ...", and around 2882 "retains pair source order ...").
Imitate their mock setup for `open_file_preview` and the startup context.
Test cases:

- A two-pair startup (`[a.png,b.png]`, `[c.png,d.png]`):
  - `open_file_preview` is called for a.png and b.png only.
  - `list_explicit_file_set` and `list_directory` are not called.
  - No `.pair-list` exists, and the `Expand left pane` strip is shown.
- Expanding via the header toggle shows a `.pair-list` with 2 options,
  selected index 0. Repeat the same check via the expand strip and via
  `Shift+L` (key `L`).
- Clicking the option `c.png <-> d.png` calls `open_file_preview` for
  c.png and d.png. The pane names show c.png and d.png, and the second
  option is `aria-selected="true"`.
- With the list expanded and focus in it, `j` shows pair 2 and `k` shows
  pair 1 again.
- `Collapse left pane` in the pair list header folds the list. `Shift+L`
  expands and folds it.
- A single-pair startup is folded and, after expanding, lists one option.
- `}` hides the right pane. Selecting pair 2 keeps it hidden
  (`[data-pair-pane="right"]` has `hidden`). `{` is then a no-op because the
  left pane is the only visible one.
- `{` / `}` do nothing in a non-pair (directory) startup, and do nothing
  while focus is in an `<input>` (the existing editable guard).
- `r` re-calls `open_file_preview` only for the two paths of the shown pair.
- No element matches `[data-pair-active], .pair-view__pane--active, [data-pair-marker]`.
- Existing `explicit_file_set` startup tests keep passing. In a non-pair
  `explicit_file_set` startup, no `list_explicit_file_set` call has a
  `sourceOrder` key.

## Invariants

- Pair mode never mounts `FileBrowserPane` and never renders
  `TocPane` / the single-document column.
- Selecting a pair never changes visibility.
- Changing only one side's path reloads only that pane (PairView behavior).
- `sourceOrderPaths` / `source_order_paths` must not be renamed or removed.
  It belongs to the explicit_file_set contract from 9aa3772 (for example
  `WorkspaceShell.tsx` `loadExplicitFileSetState(sourceOrderPaths, ...)`,
  `document.ts` explicit_file_set normalizer) and is retained. Only the
  rejected standalone `sourceOrder` option, prop and field are removed.

## Verification (record exit codes and full log paths)

- `bun run typecheck` -> exit 0. This is the first full-frontend typecheck
  gate.
- `bunx vitest run --config vitest.config.ts src/features/workspace` -> exit 0.
- `bunx biome check src/features/workspace` -> exit 0.
- `grep -rnwE "sourceOrder|activeSide|assignPathToActivePane|pairMarkerForPath|activatePairSide" src`
  -> no output. The pattern is word-bounded on purpose so that it does not
  match the retained `sourceOrderPaths` identifier.

## Concurrency And Drift Rules

- Wave 2 runs after the wave-1 plans. Before editing, re-read the consumed
  contract files and record their sha256 in the progress log. If a contract
  differs from this plan, stop and report it; do not edit them.
- Re-read each owned file before editing it. Record sha256 before and after
  the edit.

## Completion Criteria

- [ ] Pair startup uses `pairs` and renders PairListPane / PairView
- [ ] All rejected-model code removed from the workspace files
- [ ] Workspace tests rewritten and passing
- [ ] typecheck, vitest, biome, and the word-bounded grep checks pass
      (`sourceOrderPaths` retained)

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-workspace.

### Session: 2026-11-16 (plan review amendment)
**Tasks Completed**: Addressed PCW-GREP-SOURCEORDER-01
**Notes**: The grep is now word-bounded (`grep -rnwE`). Added an invariant
that the explicit_file_set `sourceOrderPaths` is retained. Aligned the
completion criteria with the new grep.
