# Pair Compare: WorkspaceShell Integration

**Status**: Completed
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

- [x] Pair startup uses `pairs` and renders PairListPane / PairView
- [x] All rejected-model code removed from the workspace files
- [x] Workspace tests rewritten and passing under configured Node 22
- [x] typecheck, vitest, biome, and the word-bounded grep checks pass
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

### Session: 2026-11-16 (workspace implementation)
**Tasks Completed**: Pair state, list selection and folded startup integrated; rejected workspace plumbing removed; workspace tests rewritten.
**Verification**: `bun run typecheck` exit 0; `bunx biome check src/features/workspace` exit 0; `mise exec -- node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/workspace` exit 0, 95 tests. The exact `bunx vitest` command on Node 26 exited 1 (85 passed, 9 existing tests failed due to undefined localStorage); logs are in `tmp/pair-compare-20261116-01/pair-compare-workspace/attempt-1/`. The word-bounded grep exits 0 due to sibling-owned `src/lib/tauri/document-invoke.vitest.ts` lines 83 and 105.
**SHA256 before (owned and consumed contracts)**:
```
b235c69d93a946f7d1d7a7c486fc18b5f339a6f2531a7838aaa93a622b4c915c  src/features/workspace/WorkspaceShell.tsx
d0e3f08ace17f0da9b8a02b74efe7540824e07712d3ff2b2b69bc79f6d7167a8  src/features/workspace/WorkspaceShell.vitest.tsx
4c3dbd5a273ae601497a8159f7438cfa5d06141bb02057f9ebaa01426daf587f  src/features/workspace/WorkspaceFeedback.vitest.tsx
5a551870d378d5137169d99596277073d9ad744d681a6f0f2f733d8f7c5611fa  src/features/workspace/workspaceDirectoryState.ts
9fa358fa18af9754a628202c919d85f5143e2ebb60b1a47812983c76a7ea1a72  impl-plans/active/pair-compare-workspace.md
dc921af434ef3568eb21be449bf0da107587ee1950d012db250bbabb9a5a1f2d  src/lib/tauri/document.ts
716fee25402aa83f14c1c4cae26d8145e52ad1ebc85ba7a73a56141d8e959064  src/features/pair-view/pairPaneVisibility.ts
28b697be7a36c652661452fabb01e2405f6655d2c44342e1233e4bc266ec784c  src/features/pair-view/PairView.tsx
89a15976bfcf9351877912a089d409a7fd89c03a00e54216063b010c4ae37413  src/features/pair-view/PairListPane.tsx
0e255f480dc6d861a8a076d10c484471cc0d407456a077b4e047655c0b219bef  src/features/file-view/FileBrowserPane.tsx
```
**SHA256 after (owned and consumed contracts)**:
```
495a5b70d788cce8d0fb8dfdcc25ac595de33fab97cb1ca4a6726e16a2161c1c  src/features/workspace/WorkspaceShell.tsx
3a8014515c6501ca62f87efae3e42e995cfd1a8117d5565e0641c26c871300a8  src/features/workspace/WorkspaceShell.vitest.tsx
6712fc73572cd6fd3b53f47bab79351a91d51a173bb5ed23d56daf6b4e483836  src/features/workspace/WorkspaceFeedback.vitest.tsx
f2c93134503b3ae86592802f28982e3d5177ce599bb93c60da766b0c1c7e6db7  src/features/workspace/workspaceDirectoryState.ts
dc921af434ef3568eb21be449bf0da107587ee1950d012db250bbabb9a5a1f2d  src/lib/tauri/document.ts
716fee25402aa83f14c1c4cae26d8145e52ad1ebc85ba7a73a56141d8e959064  src/features/pair-view/pairPaneVisibility.ts
28b697be7a36c652661452fabb01e2405f6655d2c44342e1233e4bc266ec784c  src/features/pair-view/PairView.tsx
89a15976bfcf9351877912a089d409a7fd89c03a00e54216063b010c4ae37413  src/features/pair-view/PairListPane.tsx
0e255f480dc6d861a8a076d10c484471cc0d407456a077b4e047655c0b219bef  src/features/file-view/FileBrowserPane.tsx
```
The plan after-hash is recorded separately in `attempt-1/plan-after.sha256`.

## Amendment 2026-11-16 (blocked-wave-scope-or-contract, round 1)

Blocker 1: the word-bounded grep matches sibling-owned
`src/lib/tauri/document-invoke.vitest.ts` lines 83 and 105.

- Decision: those lines are the intended negative regression test from the
  accepted plan `pair-compare-ts-contract`. They assert that
  `list_explicit_file_set` sends no `sourceOrder` key, so they are not
  leftovers. Do NOT edit that file; it is not in this plan's writePaths and
  its plan is accepted.
- The grep gate is replaced with:
  `grep -rnwE "sourceOrder|activeSide|assignPathToActivePane|pairMarkerForPath|activatePairSide" src --exclude=document-invoke.vitest.ts`
  -> no output (exit 1). The completion criterion "word-bounded grep checks
  pass" refers to this form.

Blocker 2: `bunx vitest run ...` fails 9 of 95 tests (window.localStorage is
undefined under the bunx/Bun runtime). The Node-run vitest passes 95/95.

- Decision: this is a test-runner selection issue, not a product defect, and
  the workspace tests are not changed to work around it. The required
  workspace test gate is now the Node-run vitest, which matches how the
  project's `test:dom` script runs:
  `mise exec -- node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/workspace`
  -> exit 0 with all tests passing. Do not use `bunx vitest`.
- Do not modify `vitest.config.ts`, test setup files, or `package.json`.
- Other gates are unchanged: `bun run typecheck` and
  `bunx biome check src/features/workspace` must both exit 0.

The existing implementation is kept. Re-run the amended gates on the current
tree, record exit codes, log paths and sha256 values in the progress log, and
set the status once all gates pass.

### Session: 2026-11-16 (amended verification)
**Tasks Completed**: Confirmed workspace integration and added explicit initial
preview-path and editable-field shortcut assertions. Implementation criteria
are complete; formal review remains downstream.
**Verification**: `bun run typecheck` exit 0 (`attempt-2/typecheck-final2.log`);
`mise exec -- node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/workspace`
exit 0, 95 passed (`attempt-2/vitest-final2.log`); `bunx biome check src/features/workspace`
exit 0 (`attempt-2/biome-final2.log`); amended word-bounded grep exit 1 with
no matches (`attempt-2/grep-final2.log`). Logs are under
`tmp/pair-compare-20261116-01/pair-compare-workspace/`.
**SHA256 before and after**: The initial hashes for all owned files and
consumed contracts are in `attempt-2/hashes-before.txt`; the final source
hashes are in `attempt-2/hashes-pre-plan.txt` under the same evidence root.
The test file changed from `3a8014515c6501ca62f87efae3e42e995cfd1a8117d5565e0641c26c871300a8`
to `3d5e17ebddd52409a9d07d7c54cea280ff3c48a2f8362070b3358aca2f22514d`.
The plan's before and after hashes are in `attempt-2/hashes-before.txt` and
`attempt-2/plan-after.sha256`, respectively. Other listed hashes are unchanged.

### Session: 2026-11-16 (integration review repair INT-PCW-KEYED-REMOUNT-01)
**Tasks Completed**: Removed the keyed pair-list conditional and used reactive accessors, preserving the mounted list and focus. Added a three-pair regression for selection, preview paths, and visibility changes. Formal review and GUI verification remain downstream.
**SHA256 before / after**:
- `src/features/workspace/WorkspaceShell.tsx`: `495a5b70d788cce8d0fb8dfdcc25ac595de33fab97cb1ca4a6726e16a2161c1c` / `e359fb1eccf3e59581051765828d1fdaa5ec7d99db4b302737fb5316e8111354`
- `src/features/workspace/WorkspaceShell.vitest.tsx`: `3d5e17ebddd52409a9d07d7c54cea280ff3c48a2f8362070b3358aca2f22514d` / `e5adf10bcb38ca0cfb26c1ddbfccb6f4204e269f872490e482a09c10b9fcd9c4`
- This plan before: `4ba946031b670d5c6d72f11e77805860dcea418d701c57f544975bed38f76891`; after hash recorded in `attempt-3/plan-after.sha256` to avoid self-reference. Per-edit snapshots and intentions are in `attempt-3/`.
**Verification**: `bun run typecheck` exit 0 (`attempt-3/typecheck-final2.log`); Node workspace vitest exit 0, 96 passed (`attempt-3/workspace-vitest-final2.log`); full Node vitest exit 0, 546 passed (`attempt-3/full-vitest-final2.log`); `bunx biome check src/features/workspace` exit 0 (`attempt-3/biome-final2.log`); amended word-bounded grep exit 1 with no matches (`attempt-3/grep-final2.log`). Logs are under `tmp/pair-compare-20261116-01/pair-compare-workspace/`. Earlier workspace regression failed due to asynchronous preview ordering (`attempt-3/workspace-vitest.log`); the assertion was corrected. Earlier Biome formatting failed (`attempt-3/biome-final.log`); formatting was corrected.
