# Pair Compare: Pair State, PairView Without Active Pane, PairListPane

**Status**: Ready
**Plan ID**: pair-compare-pair-view
**Wave**: 1 (dependsOn: none; imports the type `FilePairPaths` pinned by pair-compare-ts-contract)
**Design Reference**: design-docs/specs/design-pair-view.md (State Ownership, Active-Pane Removal, Pair List Pane, Pane Rendering And Visibility, Validation/TypeScript)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

Comparison view now lists LEFT/RIGHT pairs. Choosing a pair shows both of its
files. The rejected active-pane model must disappear from
`src/features/pair-view/`: no `activeSide`, no activation handlers, no
`--active` class, no `data-pair-active`, no pane `aria-current`, and no
markers. This plan owns the pure pair state module, the controlled
`PairView`, and a new `PairListPane` component. `pair-compare-workspace`
(wave 2) wires them into `WorkspaceShell`.

## Pinned Contract (consumed by pair-compare-workspace)

`src/features/pair-view/pairPaneVisibility.ts`:

- Keep `PairPaneVisibility`, `PairPaneSide`, `hidePairPane`, `showPairPane`,
  `isPairPaneVisible`, `canHidePairPane`, and `togglePairPane`, all
  unchanged.
- Remove `PairListMarker`, `activatePairSide`, `assignPathToActivePane`, and
  `pairMarkerForPath`.
- `PairState`:
  `{ readonly pairs: readonly FilePairPaths[]; readonly selectedIndex: number; readonly visibility: PairPaneVisibility }`.
  `FilePairPaths` comes from `import type { FilePairPaths } from "../../lib/tauri/document"`.
- `initialPairState(pairs: readonly FilePairPaths[]): PairState` sets
  `selectedIndex` to 0 and `visibility` to `"both"`.
- `selectPair(state: PairState, index: number): PairState` sets
  `selectedIndex` only for an integer index in `[0, pairs.length)`.
  Otherwise, or when `index` equals the current index, it returns the same
  `state` object. It never changes `visibility`.
- `selectedPair(state: PairState): FilePairPaths | null` returns
  `pairs[selectedIndex]`, or `null` when there is none.
- `setPairVisibility(state, visibility): PairState` is kept.

`src/features/pair-view/PairView.tsx` props:

```
leftPath: string; rightPath: string; visibility: PairPaneVisibility;
onChangeVisibility: (next: PairPaneVisibility) => void;
colorScheme; fileOpenOptions; localResourceGeneration?; loadPreview?; onReloadReady?
```

`activeSide` and `onActivate` are removed.

`src/features/pair-view/PairListPane.tsx`:

```
export interface PairListPaneProps {
  readonly pairs: readonly FilePairPaths[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onCollapse: () => void;
}
export function PairListPane(props: PairListPaneProps): JSX.Element
```

## Non-Goals

- Do not edit `WorkspaceShell.tsx`, `FileBrowserPane.tsx`, `keymap.ts`,
  `App.css`, or `src/lib/tauri/*`.
- No filtering, sorting, pagination, or drag in the pair list.
- No zoom, scroll, or visibility persistence.

## File-Level Changes

### `pairPaneVisibility.ts`

Apply the Pinned Contract.

### `pairPaneVisibility.vitest.ts`

- Keep the visibility transition tests. Remove the active-pane, assignment,
  and marker tests.
- Add these cases:
  - `initialPairState([p1, p2])` -> index 0, `"both"`.
  - `selectPair(state, 1)` -> index 1, visibility unchanged.
  - `selectPair(state, 2)`, `-1`, and `0.5` -> the same object.
  - A state with `right_only` -> `selectPair` keeps `right_only`.
  - `selectedPair` returns the pair at the index.

### `PairView.tsx`

- Remove `onActivate` and the `activate` handler. Remove the `ref` that
  adds the pointerdown capture listener and `onFocusIn`.
- Remove the `classList` active entry, `data-pair-active`, and
  `aria-current`. Keep `class="pair-view__pane"`, `data-pair-pane`, and
  `hidden`.
- Keep everything else: the per-side load with request counters, the
  `createEffect(on(() => props.leftPath ...))` pattern (do NOT key the
  component on paths), eye buttons, restore strip, reload registration, and
  `WorkspaceDocumentColumn` usage.

### `PairView.css`

- Delete the `.pair-view__pane--active` rules.

### `PairView.vitest.tsx` and `PairViewHiddenZoom.vitest.tsx`

- Drop the `activeSide` / `onActivate` props from fixtures.
- Delete the test "marks and activates panes without activating from
  visibility buttons".
- Add an assertion that no element matches
  `[data-pair-active], .pair-view__pane--active, section[aria-current]`.
- Keep and pass these existing tests: changed-pane reload only, stale
  response, error isolation, reload registration, and hidden zoom.

### New `PairListPane.tsx`

Imitate the header markup of `src/features/file-view/FileBrowserPane.tsx`
(around line 850: `pane`, `pane__header`, `pane__header-lead`,
`CollapsePaneButton`, `pane__title`) and its keymap usage
(`FileBrowserPane.tsx:288 useKeymapController`, `:770 keymap.register`).

- Root: `<section class="pane pair-list" aria-label="Comparison pairs">`.
- Header:
  - Lead: `<CollapsePaneButton onCollapse={props.onCollapse} />`
    (import from `../workspace/CollapsePaneButton`) and the title `Pairs`.
  - Right side: `1 pair` or `N pairs`.
- Body: `<ul role="listbox" aria-label="Comparison pairs">` with one `<li>`
  per pair, in order. Each `<li>` holds a
  `<button type="button" role="option" class="pair-list__button" data-pair-index={i}>`:
  - Text: `basename(left) <-> basename(right)`. Basename is split on
    `/` and `\`, like `PairView.tsx` (`path().split(/[\\/]/).pop()`).
  - `title`: `${left} <-> ${right}` with full paths.
  - `aria-selected`: `"true"` or `"false"`.
  - `classList`: `pair-list__button--selected` when selected.
  - `tabindex`: 0 on the selected button, -1 on the others.
  - Click calls `props.onSelect(i)`.
- Keymap: get `{ controller, standalone }` from `useKeymapController()` and
  call `controller.register` with:
  - `context: "file"`
  - `enabled: () => true` (the component is mounted only while the list is
    expanded in pair mode)
  - `identity: () => "pair-list"`
  - `accepts: (_event, action) => ["cursor.down", "cursor.up", "open", "enter"].includes(action)`
  - Actions:
    - `cursor.down` / `cursor.up` call `onSelect(clamped selectedIndex ± 1)`.
      Do not wrap. At an end, make no call.
    - `open` / `enter` call `onSelect(selectedIndex)`. The state layer treats
      selecting the current index as a no-op.
  - If `standalone` is true, render `KeymapPopup` the same way
    FileBrowserPane does (`FileBrowserPane.tsx:874`). Otherwise do not.
- When `selectedIndex` changes, focus the selected button only if focus is
  already inside the list (`section.contains(document.activeElement)`). Then
  call `button.scrollIntoView?.({ block: "nearest" })`. Use optional
  chaining because jsdom has no `scrollIntoView`.

### New `PairListPane.css`

- Styles for `.pair-list__button` (full width, left aligned, ellipsis) and
  `.pair-list__button--selected` (using existing tokens such as
  `var(--bg-hover)` and `var(--accent)`, as `.file-browser__button--active`
  does in `src/app/App.css`).
- Import it from `PairListPane.tsx`.

### New `PairListPane.vitest.tsx`

Imitate the render and dispose setup of `FileBrowserPane.vitest.tsx`.

- Pairs `[/x/a.png,/y/b.png]` and `[/x/c.png,/y/d.png]` -> two option
  buttons with texts `a.png <-> b.png` and `c.png <-> d.png`, in order. The
  first has `title` `/x/a.png <-> /y/b.png`.
- `selectedIndex` 1 -> only the second button has `aria-selected="true"`.
- Clicking the second button -> `onSelect(1)`.
- `j` keydown on window -> `onSelect(1)` from index 0. `k` at index 0 -> no
  call. `j` at the last index -> no call. `Enter` -> `onSelect(current)`.
- `h`, `/`, `,a` -> `onSelect` is not called.
- The count label is `2 pairs`; a single pair shows `1 pair`.
- The `Collapse left pane` button -> `onCollapse` is called once.

## Invariants

- "Both panes hidden" stays unrepresentable.
- Selecting a pair never forces a hidden pane to show.

## Verification

- `bunx vitest run --config vitest.config.ts src/features/pair-view` -> exit
  0, all pair-view tests pass.
- `bunx biome check src/features/pair-view` -> exit 0.
- `bunx tsc --noEmit 2>&1 | grep "src/features/pair-view/"` -> no output.
  Errors in `WorkspaceShell.tsx` are expected until wave 2.
- `grep -rn "activeSide\|onActivate\|pair-view__pane--active\|data-pair-active\|pairMarkerForPath" src/features/pair-view`
  -> no output.

## Concurrency And Drift Rules

- Re-read each file before editing it. Record sha256 before and after the
  edit in the progress log.
- Do not edit files outside writePaths. Report drift.

## Completion Criteria

- [ ] Pair state module per contract, with tests
- [ ] PairView has no active-pane code; its tests are updated
- [ ] PairListPane and its CSS and tests are added
- [ ] vitest, biome, and the scoped tsc and grep checks pass

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-pair-view.
