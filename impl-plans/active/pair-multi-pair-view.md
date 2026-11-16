# Pair View Multi-File: Pair State Module And Controlled PairView

**Status**: Ready
**Plan ID**: pair-multi-pair-view
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (State Ownership, Pane Rendering, Active Pane, Loading A List Choice Into The Active Pane, List Markers, Pane Visibility State, Validation/TypeScript)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

Pair view gains an active pane and per-pane file assignment that the file
list can change. `WorkspaceShell` will own the state
(`pair-multi-workspace`). This plan provides:

- the pure state helpers;
- a controlled `PairView` that renders the given paths, active side and
  visibility, and reports user actions.

Today `PairView` (`src/features/pair-view/PairView.tsx`) owns `visibility`
internally and loads both panes once on mount.

## Pinned Contract (consumed by pair-multi-workspace)

`src/features/pair-view/pairPaneVisibility.ts`: keep all existing exports
unchanged and add:

```ts
export type PairListMarker = "L" | "R" | "LR";
export interface PairState { readonly leftPath: string; readonly rightPath: string; readonly activeSide: PairPaneSide; readonly visibility: PairPaneVisibility; }
export function togglePairPane(state: PairPaneVisibility, side: PairPaneSide): PairPaneVisibility;
export function initialPairState(leftPath: string, rightPath: string): PairState;
export function activatePairSide(state: PairState, side: PairPaneSide): PairState;
export function assignPathToActivePane(state: PairState, path: string): PairState;
export function setPairVisibility(state: PairState, visibility: PairPaneVisibility): PairState;
export function pairMarkerForPath(state: PairState, path: string): PairListMarker | null;
```

`src/features/pair-view/PairView.tsx`: add the four controlled props below.
Existing props stay.

```ts
readonly activeSide: PairPaneSide;
readonly visibility: PairPaneVisibility;
readonly onActivate: (side: PairPaneSide) => void;
readonly onChangeVisibility: (next: PairPaneVisibility) => void;
```

DOM hooks:
- Existing hooks stay: `data-testid="pair-view"`, `data-pair-pane`,
  `data-pair-restore`, and the `hidden` attribute.
- The active pane's section gets class `pair-view__pane--active` and
  `data-pair-active="true"`. The inactive section has neither.
- The active pane's header shows a text label `Active` in
  `<span class="pair-view__active-label">`.

## Semantics To Get Right

- `togglePairPane`:
  - If the side is hidden, return `showPairPane(state, side)`.
  - Otherwise return `hidePairPane(state, side)`.
  - Toggling the only visible pane is a no-op.
- `initialPairState`: `activeSide` is `"left"` and `visibility` is `"both"`.
- `assignPathToActivePane`:
  - Sets the active side's path.
  - If the active side is hidden, `visibility` becomes `"both"`.
  - `activeSide` does not change.
  - The same path on both sides is allowed (no swap).
  - If the path already equals the active side's path, the paths are
    unchanged and only the visibility rule applies.
- `pairMarkerForPath`: returns `"LR"` when both sides show the path, `"L"` or
  `"R"` when one side does, and `null` otherwise. Visibility does not matter.
- PairView loading:
  - Load each side when its path prop changes. Use one `createEffect` per side
    that tracks only that side's path; use `on(...)` for explicit tracking.
  - The other side must NOT reload.
  - Keep the existing per-side request counter (`requests[side]`) so a stale
    response for an earlier path is dropped.
  - `reload()` still reloads both current paths. `onReloadReady` stays as
    today.
  - Do not reload on mount and again from the effect: exactly one
    `loadPreview` call per side at mount.
- Activation:
  - Use `onPointerDownCapture` on the pane `section`. Do NOT call
    `preventDefault` or `stopPropagation`; preview pan, wheel zoom and
    right-drag must keep working.
  - `onFocusIn` on the section also activates.
  - Pointerdown or click on the header eye button, and on the restore-strip
    button, must NOT call `onActivate`. Check
    `event.target.closest(".pair-view__button")` and skip.
- Eye and restore buttons call `onChangeVisibility(hidePairPane(...))` and
  `onChangeVisibility(showPairPane(...))` instead of a local signal. Remove
  the internal `visibility` signal.
- The active marker must be visible without color: the `Active` text label
  plus an accent border (CSS variable already used for accents in
  `src/app/App.css`, for example the one behind `.button--active`).

## Non-Goals

- No WorkspaceShell, FileBrowserPane, keymap, or Rust edits.
- No change to hidden-pane zoom suppression (`PreviewPane` guard) or to
  `WorkspaceDocumentColumn`.
- No persistence and no resize.

## File-Level Changes

- `src/features/pair-view/pairPaneVisibility.ts`: add the exports above.
- `src/features/pair-view/pairPaneVisibility.vitest.ts`: add tests.
- `src/features/pair-view/PairView.tsx`: controlled props, per-side
  path-change loading, activation, active marker.
- `src/features/pair-view/PairView.css`: `.pair-view__pane--active` border
  and header accent, `.pair-view__active-label`.
- `src/features/pair-view/PairView.vitest.tsx`: update the harness to hold
  state in a test signal wired to `onActivate` / `onChangeVisibility`. Add
  tests.
- `src/features/pair-view/PairViewHiddenZoom.vitest.tsx`: update the harness
  the same way. The assertions must still pass unchanged.

## Test Cases (input -> expected)

- `togglePairPane`:
  - (both, left) -> right_only
  - (both, right) -> left_only
  - (right_only, left) -> both
  - (left_only, right) -> both
  - (left_only, left) -> left_only
  - (right_only, right) -> right_only
- Exhaustive random-free sequence check over all states and actions: never
  both hidden.
- `assignPathToActivePane`:
  - active right, right hidden (left_only), path c -> rightPath c, both,
    activeSide right.
  - active left, path equals rightPath -> both sides show it;
    `pairMarkerForPath` -> "LR".
  - Same path as the active side -> state paths unchanged.
- `pairMarkerForPath`: left path -> "L", right path -> "R", other -> null.
- PairView:
  - `activeSide="left"` -> left section has `pair-view__pane--active` and the
    `Active` label; right has neither.
  - pointerdown inside the right section body -> `onActivate("right")`.
  - Click on the "Hide left pane" button -> `onChangeVisibility("right_only")`
    and no `onActivate` call.
  - Restore button -> `onChangeVisibility("both")` and no `onActivate` call.
  - Rerender with `rightPath` changed -> `loadPreview` is called once for the
    new right path, and not again for the left path.
  - Mount -> `loadPreview` is called exactly twice.
  - Existing tests (order, disabled sole-visible button, restore strip,
    per-pane error) still pass under the controlled harness.
- HiddenZoom: the existing hide/zoom/restore cases pass unchanged.

## Invariants

- Both hidden is unrepresentable.
- Existing accessible names ("Hide left pane", etc.), `aria-pressed`,
  `aria-disabled` and tooltip text are unchanged.
- Panes stay mounted while hidden.

## Overwrite Safety

Re-read each file fresh before editing. Record start hashes
(`shasum -a 256`). On drift, re-read and re-apply only this intent. Touch
only `writePaths`.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/pair-view`
   -> exit 0, all pair-view tests pass.
2. `bunx tsc --noEmit 2>&1 | grep "src/features/pair-view/"`
   -> no output. `WorkspaceShell.tsx` errors from the new required props are
   expected until `pair-multi-workspace` lands.
3. `bunx biome check src/features/pair-view` -> exit 0.

## Completion Criteria

- [ ] New pure helpers exported with the pinned signatures.
- [ ] PairView is controlled, loads per side on path change, marks the
      active pane, and activates on pointerdown/focusin except on its
      buttons.
- [ ] All test cases pass; verification 1-3 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.
