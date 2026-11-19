# Link Navigation: History Model Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Archived to `impl-plans/completed/link-nav-history-model.md`.
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

- [x] Module exports match the pinned contract exactly
- [x] All 9 test cases pass
- [x] typecheck and biome clean

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: New files only. Record their hashes after writing.

### Session: 2026-11-19 — implementation
**Tasks Completed**: Immutable history model and nine focused tests. Vitest: 9 passed; Biome: clean.
**Blockers**: `bun run typecheck` exits 2 on sibling `src/features/preview/previewLinks.test.ts:68` (TS2769); serial reconciliation or its owner must fix it and rerun typecheck. Formal review remains pending.
**Edit hashes (SHA-256)**: `navigationHistory.ts`: absent -> `7b7e5def7b761681749071252d7a37e9bf83e12a31d5fdf6d417d5a60dedd075` -> formatted `7f478d244b653c6edf8979c7a611453dd125abaa598a64442de9e6bdcecb9d61`; `navigationHistory.vitest.ts`: absent -> `0ef055896b05b2e47a6b9ffe242f2fd063bf0bffc4c1a3aa83939d2d78cfc7a1` -> formatted `14ed32aa3281e42b4b09e2e390826570ec149dedf5bc20d09c47a9d0a3f0ea9a` -> type fix `841344471b03ee56024e001763bebb12ae08c52312d083632ad9bb5a8f415d7d`. Plan before this edit: `7f4db2bd55cfdedbf303ebee23abff71681d1eca5499707da9fcd5eba949daa9`; its after-edit hash is recorded in the plan-local evidence to avoid a self-referential hash.
**Evidence**: `tmp/link-nav-history-20261119-01/link-nav-history-model/attempt-1/` and `attempt-2/`.

### Session: 2026-11-19 — continuation
**Tasks Completed**: Reran required gates on the current shared tree: typecheck exited 0, Vitest passed 9/9, and Biome exited 0. The prior sibling typecheck failure is resolved. Formal review remains pending.
**Edit hashes (SHA-256)**: Plan before and after this edit are recorded in `tmp/link-nav-history-20261119-01/link-nav-history-model/attempt-3/plan-before.sha256` and `plan-after.sha256`, respectively, avoiding a self-referential hash. Source hashes remain `7f478d244b653c6edf8979c7a611453dd125abaa598a64442de9e6bdcecb9d61` and `841344471b03ee56024e001763bebb12ae08c52312d083632ad9bb5a8f415d7d`.
**Evidence**: `tmp/link-nav-history-20261119-01/link-nav-history-model/attempt-3/`.
