# Link Navigation: History Model Implementation Plan

**Status**: Ready
**Plan ID**: link-nav-history-model
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#navigation-history-model
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

This plan builds the pure, immutable Back/Forward history state that
`WorkspaceShell` will hold in a Solid signal (wave 3). It is a pure TypeScript
module with no DOM, Solid or Tauri imports. Imitate the pure-state style of
`src/features/pair-view/pairPaneVisibility.ts` (`initialPairState`,
`selectPair`), which returns new objects and never mutates.

## Non-Goals

- No persistence and no UI.
- No scroll measuring and no file opening. Those belong to the shell plan.
- No per-pane histories.

## Pinned Contract (`src/features/workspace/navigationHistory.ts`, new)

```ts
export interface NavigationPaneLocation {
  readonly path: string;
  readonly scrollTop: number | null; // null = never departed, no saved scroll
  readonly fragment: string | null;
}
export type NavigationLocation =
  | ({ readonly kind: "single" } & NavigationPaneLocation)
  | { readonly kind: "pair"; readonly pairIndex: number;
      readonly left: NavigationPaneLocation; readonly right: NavigationPaneLocation };
export interface NavigationHistoryState {
  readonly entries: readonly NavigationLocation[];
  readonly index: number; // -1 when empty
}
export const NAVIGATION_HISTORY_LIMIT = 100;
export const EMPTY_NAVIGATION_HISTORY: NavigationHistoryState;
export function isSameNavigationTarget(a: NavigationLocation, b: NavigationLocation): boolean;
export function pushNavigationLocation(state: NavigationHistoryState, location: NavigationLocation): NavigationHistoryState;
export function updateCurrentNavigationLocation(
  state: NavigationHistoryState,
  update: (current: NavigationLocation) => NavigationLocation,
): NavigationHistoryState;
export function stepNavigationHistory(
  state: NavigationHistoryState,
  direction: -1 | 1,
): { readonly state: NavigationHistoryState; readonly location: NavigationLocation } | null;
export function canGoBack(state: NavigationHistoryState): boolean;
export function canGoForward(state: NavigationHistoryState): boolean;
```

## Semantics

- `isSameNavigationTarget`: same `kind`. For `single`, the path and fragment
  are equal. For `pair`, `pairIndex`, both paths and both fragments are equal.
  `scrollTop` is ignored.
- `pushNavigationLocation`:
  - If `index >= 0` and the new location is the same target as
    `entries[index]`, return the state unchanged (same object reference is
    fine).
  - Otherwise keep `entries.slice(0, index + 1)`, append the location, and if
    the length exceeds 100, drop from the front. `index` = new last position.
- `updateCurrentNavigationLocation`: when the state is empty, return it
  unchanged. Otherwise replace `entries[index]` with `update(current)`; the
  other entries are unchanged.
- `stepNavigationHistory`: the target index is `index + direction`. If it is
  out of range, return `null`. Otherwise return the new state with that index
  plus the target entry. Entries are never removed by stepping.
- `canGoBack` = `index > 0`; `canGoForward` = `index >= 0 && index < entries.length - 1`.

## Pitfalls

- Never mutate input arrays. Tests check that the original state is
  unchanged.
- Cap trimming must keep `index` pointing at the newly pushed entry (99).
- A push after Back truncates the forward entries even when the cap is not
  reached.

## Tests (`src/features/workspace/navigationHistory.vitest.ts`, new)

- empty state -> both `canGoBack` and `canGoForward` are false; stepping
  returns `null`
- push A, push B -> index 1, `canGoBack` true
- push A, B, C; back; push D -> entries A, B, D; `canGoForward` false
- push A, then A again (same path, null fragment) -> one entry
- push A, then A with fragment `x` -> two entries
- push 105 distinct entries -> 100 entries; the first is entry #6; index 99
- `updateCurrentNavigationLocation` sets `scrollTop: 120` on the current entry
  only; the input state object is unchanged
- pair: same `pairIndex` but a different left path -> not the same target
- back then forward returns to the original index and entry

## Verification

- `bunx vitest run --config vitest.config.ts src/features/workspace/navigationHistory.vitest.ts`
  -> all pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/workspace/navigationHistory.ts src/features/workspace/navigationHistory.vitest.ts`
  -> no errors

## Completion Criteria

- [ ] Module exports match the pinned contract exactly
- [ ] All 9 test cases pass
- [ ] typecheck and biome clean

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: New files only. Record their hashes after writing.
