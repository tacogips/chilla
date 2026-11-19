export interface NavigationPaneLocation {
  readonly path: string;
  readonly scrollTop: number | null;
  readonly fragment: string | null;
}

export type NavigationLocation =
  | ({ readonly kind: "single" } & NavigationPaneLocation)
  | {
      readonly kind: "pair";
      readonly pairIndex: number;
      readonly left: NavigationPaneLocation;
      readonly right: NavigationPaneLocation;
    };

export interface NavigationHistoryState {
  readonly entries: readonly NavigationLocation[];
  readonly index: number;
}

export const NAVIGATION_HISTORY_LIMIT = 100;
export const EMPTY_NAVIGATION_HISTORY: NavigationHistoryState = {
  entries: [],
  index: -1,
};

function samePaneTarget(
  a: NavigationPaneLocation,
  b: NavigationPaneLocation,
): boolean {
  return a.path === b.path && a.fragment === b.fragment;
}

export function isSameNavigationTarget(
  a: NavigationLocation,
  b: NavigationLocation,
): boolean {
  if (a.kind === "single" && b.kind === "single") return samePaneTarget(a, b);
  if (a.kind === "pair" && b.kind === "pair") {
    return (
      a.pairIndex === b.pairIndex &&
      samePaneTarget(a.left, b.left) &&
      samePaneTarget(a.right, b.right)
    );
  }
  return false;
}

export function pushNavigationLocation(
  state: NavigationHistoryState,
  location: NavigationLocation,
): NavigationHistoryState {
  const current = state.entries[state.index];
  if (current !== undefined && isSameNavigationTarget(current, location))
    return state;
  const entries = [...state.entries.slice(0, state.index + 1), location].slice(
    -NAVIGATION_HISTORY_LIMIT,
  );
  return { entries, index: entries.length - 1 };
}

export function updateCurrentNavigationLocation(
  state: NavigationHistoryState,
  update: (current: NavigationLocation) => NavigationLocation,
): NavigationHistoryState {
  const current = state.entries[state.index];
  if (current === undefined) return state;
  const entries = [...state.entries];
  entries[state.index] = update(current);
  return { entries, index: state.index };
}

export function stepNavigationHistory(
  state: NavigationHistoryState,
  direction: -1 | 1,
): {
  readonly state: NavigationHistoryState;
  readonly location: NavigationLocation;
} | null {
  const index = state.index + direction;
  const location = state.entries[index];
  if (location === undefined) return null;
  return { state: { entries: state.entries, index }, location };
}

export function canGoBack(state: NavigationHistoryState): boolean {
  return state.index > 0;
}

export function canGoForward(state: NavigationHistoryState): boolean {
  return state.index >= 0 && state.index < state.entries.length - 1;
}
