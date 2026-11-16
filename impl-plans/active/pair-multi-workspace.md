# Pair View Multi-File: WorkspaceShell Integration

**Status**: Ready
**Plan ID**: pair-multi-workspace
**Wave**: 2
**Depends On**: pair-multi-rust, pair-multi-ts-contract, pair-multi-pair-view, pair-multi-file-browser, pair-multi-keymap
**Design Reference**: design-docs/specs/design-pair-view.md (State Ownership, Workspace Integration, Source-Order Listing Contract / Frontend state + Sorting, Loading A List Choice Into The Active Pane, List Markers, Pane Toggle Shortcuts, Validation/TypeScript WorkspaceShell)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

Wire the wave-1 pieces into `src/features/workspace/WorkspaceShell.tsx` so
that pair view:

- has a folded file list in CLI order;
- has an active pane that receives list choices;
- shows L/R markers in the list;
- responds to `{` / `}`.

Current state (0.4.0):

- the `file_pair` startup branch (about line 782) closes the tree and
  clears the document;
- `isPairMode()` guards block the sidebar (about lines 1545 and 1628);
- `PairView` is rendered via `<Show when={isPairMode() ? pairPaths() : null} keyed>`
  instead of the whole FileBrowserPane/Toc/DocumentColumn fallback (about
  lines 1884-2036).

Contracts consumed (read the wave-1 plans' "Pinned Contract" sections and the
landed code before editing):

- `pair-multi-ts-contract`: `browser_root.source_order_paths`, and
  `listExplicitFileSet(..., { sourceOrder })`.
- `pair-multi-pair-view`: `PairState`, `initialPairState`,
  `activatePairSide`, `assignPathToActivePane`, `setPairVisibility`,
  `togglePairPane`, `pairMarkerForPath`; and the `PairView` props
  `activeSide`, `visibility`, `onActivate`, `onChangeVisibility`.
- `pair-multi-file-browser`: the `FileBrowserPane` props `pairMarkerForPath`
  and `sourceOrder`.
- `pair-multi-keymap`: the actions `pair.left.toggle` and
  `pair.right.toggle`.

## Non-Goals

- No Rust edits. No changes to `PairView`, `FileBrowserPane`, the keymap
  module, or the document contract files: those are owned by wave-1 plans.
  If a wave-1 contract is defective, record it in the progress log and stop
  for repair instead of editing the file.
- No change to directory, single-file, `explicit_file_set` (picker/macOS),
  GitHub, or Git-diff flows.
- No persistence of pair state.

## File-Level Changes

### `src/features/workspace/workspaceDirectoryState.ts`
- `LoadedDirectoryState`: add `readonly sourceOrder?: boolean`. It is only
  meaningful when `listingKind === "explicit_file_set"`.

### `src/features/workspace/WorkspaceShell.tsx`

1. Pair state:
   - Replace the `pairPaths` memo with
     `const [pairState, setPairState] = createSignal<PairState | null>(null)`.
   - Keep `isPairMode()` as the startup `file_pair` check plus
     `activeGitDiffTarget() === null`.
   - The PairView fileOpenOptions come from `startupContext()`.
2. `loadExplicitFileSetState`: add a trailing `sourceOrder = false`
   parameter. Pass `{ sourceOrder: true }` to `listExplicitFileSet` only when
   it is true, and store `sourceOrder` in the resulting state.
   - Every later explicit-list request must forward `current.sourceOrder`:
     load-more (`loadMoreExplicitFileSetEntries`, about line 497-552), the
     query change path (`handleChangeDirectoryQuery`, about line 1444), and
     the explicit reload inside `handleReloadCurrent` (about line 820). If
     you miss one, page 2 or the filtered list comes back name-sorted.
3. Startup `file_pair` branch:
   - Call `setFileTreeOpen(false)` and `setActiveGitDiffTarget(null)`.
   - Call `setPairState(initialPairState(left, right))`.
   - Await `loadExplicitFileSetState(browserRoot.source_order_paths, browserRoot.left_file_path, directorySort(), "", true)`.
   - Do NOT call `previewSelectedFile`. Keep `clearDocumentArea()`.
4. Sorting: `handleChangeDirectorySort` returns early when
   `directoryState()?.sourceOrder === true`.
5. List routing:
   - `handleSelectEntry`, first branch when `isPairMode()`:
     - set `selectedBrowserPath`;
     - if `options?.immediatePreview === true`, assign to the active pane;
     - in every case return before any debounced preview or `clearDocumentArea`.
   - `handleConfirmEntry`, first branch when `isPairMode()`: set
     `selectedBrowserPath`, assign the path with
     `setPairState(s => s && assignPathToActivePane(s, entry.path))`, and
     return.
   - Never call `previewSelectedFile` or `scheduleSelectionPreviewFromTree`
     in pair mode.
6. Sidebar:
   - Remove `if (isPairMode()) return;` from `handleToggleFileTree`.
   - Make `showExpandTab` be `!isFileTreeOpen()`.
7. Rendering:
   - Restructure the `diffTarget() === null` branch so that `FileBrowserPane`
     (inside `<Show when={isFileTreeOpen()}>`) renders in both pair and
     non-pair mode.
   - Pair mode then renders `PairView`. Non-pair mode renders `TocPane` and
     `WorkspaceDocumentColumn` exactly as today.
   - Do not move or duplicate the large `FileBrowserPane` prop block. Hoist
     it once, and add:
     - `pairMarkerForPath={isPairMode() ? (p) => { const s = pairState(); return s ? pairMarkerForPath(s, p) : null; } : undefined}`
     - `sourceOrder={directoryState()?.sourceOrder === true}`
   - `PairView` must NOT be `keyed` on paths. Render it under
     `<Show when={isPairMode() && pairState() !== null}>` with
     `leftPath={pairState()!.leftPath}`-style accessors (or a non-keyed
     `Show` callback). This way a path change updates props instead of
     remounting, and the other pane keeps its zoom.
   - Wire:
     - `onActivate={(side) => setPairState(s => s && activatePairSide(s, side))}`
     - `onChangeVisibility={(v) => setPairState(s => s && setPairVisibility(s, v))}`
     - keep `onReloadReady`.
8. Keymap: in the existing workspace `keymap.register` actions object, add
   `"pair.left.toggle"` and `"pair.right.toggle"`. They do nothing unless
   `isPairMode()`; otherwise they apply `togglePairPane` to the current
   visibility via `setPairVisibility`.
9. Reload: keep the pair branch (`pairReload`). It reloads the two current
   paths only.

### `src/features/workspace/WorkspaceShell.vitest.tsx`
- Update the existing `file_pair` fixture (about line 2659) to include
  `source_order_paths`.
- Add the tests below. Imitate the existing `file_pair` and
  `explicit_file_set` startup tests in this file for invoke mocking.

### `src/app/App.css` (only if needed)
- If the viewer grid does not lay out `FileBrowserPane` and `PairView`
  correctly with the tree open, add a minimal rule scoped to pair mode.
  Prefer a class such as `workspace__body--pair` added in
  `viewerGridClassName`. Otherwise leave this file untouched. Wave 1
  (`pair-multi-file-browser`) added a badge rule here: re-read fresh and do
  not disturb it.

## Test Cases (situation -> expected)

- Two-file `file_pair` startup (`/w/a.png`, `/w/b.png`):
  - `open_file_preview` is called once for each path;
  - `list_explicit_file_set` is called with `sourceOrder: true`;
  - the tree is folded (`.workspace__expand-tab` present, no file list);
  - `[data-pair-pane="left"]` has `data-pair-active="true"`.
- Startup with `source_order_paths = [/w/z.png, /w/a.png, /w/m.png]` (mock
  rows returned in that order):
  - after the expand strip is clicked, the list shows z, a, m in DOM order;
  - `L` is on z.png, `R` is on a.png, and m.png has no marker.
- Header toggle, the expand strip, and `Shift+L` each expand and fold the
  list in pair mode.
- Pointerdown in the right pane, then click the m.png row:
  - `open_file_preview` is called for m.png;
  - no new call for z.png;
  - the right pane header shows `m.png`;
  - the markers now show `R` on m.png and no marker on a.png.
- Hide the right pane via its eye button while it is active, then confirm a
  row: the right pane is visible again with the new file.
- A cursor move in the list (`j`) -> no `open_file_preview` call.
- Load-more and filter changes in the pair list send `sourceOrder: true`.
- A sort key sequence (`,` then `a`) in the pair list -> no new
  `list_explicit_file_set` call.
- `{` -> left pane `hidden`; `{` again -> shown.
- With the left pane hidden, `}` -> no-op (the right pane stays visible).
- `}` with focus in the filter input -> no change.
- `{` in a directory (non-pair) startup -> no error, no pair view.
- Existing `explicit_file_set` (picker), directory, and single-file startup
  tests still pass, and their `list_explicit_file_set` calls carry no
  `sourceOrder`.

## Invariants

- Non-pair rendering order and props are unchanged.
- Both panes are never hidden at once.
- Hidden-pane zoom guard tests (`PairViewHiddenZoom.vitest.tsx`) still pass.

## Overwrite Safety

- Re-read each file fresh before every edit. `WorkspaceShell.tsx` is large:
  edit with targeted, unique anchors.
- Record start hashes in the progress log.
- On drift, re-read and re-apply only this intent.
- After joining, run the full gates below serially.

## Verification (run from repository root; this plan runs after all wave-1 plans, so full gates apply)

1. `bunx vitest run --config vitest.config.ts src/features/workspace src/features/pair-view src/features/file-view src/features/keymap src/lib/tauri`
   -> exit 0.
2. `bun run typecheck` -> exit 0.
3. `bunx biome check src` -> exit 0.
4. `mise run test` -> exit 0 (typecheck, bun test, vitest DOM, cargo test).
5. `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
   -> exit 0.
6. Runtime (chilla-post-edit-launch skill):
   - Build with `bun run tauri build --debug --no-bundle` -> exit 0.
   - Launch `target/debug/chilla <z.png> <a.png> <m.png>` as a bounded
     foreground run with output in `/tmp/chilla-pair-multi-launch.log`. Do
     not use nohup or a background launch in this workflow.
   - Confirm:
     - z/a side by side with the list folded;
     - expand the list -> order z, a, m with L/R;
     - activate the right pane, choose m.png -> it appears on the right;
     - `{` / `}` toggle the panes.
   - If GUI interaction is not possible, record this check as partial with
     the log path.

Record each command's exit status and log location in the progress log.

## Completion Criteria

- [ ] Pair state owned by WorkspaceShell; PairView controlled and not keyed.
- [ ] Folded list in source order with markers; sidebar controls work in
      pair mode.
- [ ] List choices load into the active pane; cursor moves do not.
- [ ] `{` / `}` wired; no-op outside pair mode.
- [ ] All test cases pass; verification 1-5 pass; 6 done or recorded as
      partial.
- [ ] Progress log updated.

## Amendment 2026-11-16 (blocked-wave-scope-or-contract, round 1)

Blocker: the plan declared no artifact roots. Its required debug build
(`bun run tauri build --debug --no-bundle`) writes `dist/` (Vite output;
`src-tauri/tauri.conf.json` has `frontendDist: ../dist` and
`beforeBuildCommand: bun run build`), and the build writes `target/` (Cargo
output, which holds `target/debug/chilla`). Both directories are git-ignored
(`.gitignore`: `/target/`, `dist`).

Decisions:

- `dist` and `target` are added to this plan's `writePaths` and declared as
  `artifactRoots`. They are generated build outputs only. Never author or
  edit files in them by hand, and never commit them. The runtime records
  them as digest/count manifests, not content.
- `src-tauri/gen/schemas` is git-tracked and may be regenerated by the Tauri
  build. It is added to `writePaths` as a source path, not as an artifact
  root, so that any change is tracked. Before the build, record `shasum -a 256 src-tauri/gen/schemas/*`.
  After the build, compare the hashes again.
  - If they are unchanged, nothing more is needed.
  - If they changed, do not keep or commit the regenerated content. Record
    the difference in the progress log and report it as an implementation
    blocker for review. Do not hand-edit those files.
- No other paths are authorized. No design change.
- Build and launch commands stay in the foreground. Launch must be bounded,
  for example
  `perl -e 'alarm 30; exec @ARGV' target/debug/chilla <z.png> <a.png> <m.png> > /tmp/chilla-pair-multi-launch.log 2>&1`.
  Record its exit status, including the alarm termination.
  If GUI interaction cannot be performed, record the runtime check as partial
  with the log path.
- Test images: create them under `tmp/pair-multi-20261116-01/pair-multi-workspace/<attempt>/`
  (untracked evidence root), for example by copying an existing repository PNG.
  Do not add images to the repository.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.
