import type { FilePairPaths } from "../../lib/tauri/document";

export type PairPaneVisibility = "both" | "left_only" | "right_only";
export type PairPaneSide = "left" | "right";

export function hidePairPane(
  state: PairPaneVisibility,
  side: PairPaneSide,
): PairPaneVisibility {
  return state === "both"
    ? side === "left"
      ? "right_only"
      : "left_only"
    : state;
}

export function showPairPane(
  state: PairPaneVisibility,
  side: PairPaneSide,
): PairPaneVisibility {
  return isPairPaneVisible(state, side) ? state : "both";
}

export function isPairPaneVisible(
  state: PairPaneVisibility,
  side: PairPaneSide,
): boolean {
  return state === "both" || state === `${side}_only`;
}

export function canHidePairPane(
  state: PairPaneVisibility,
  _side: PairPaneSide,
): boolean {
  return state === "both";
}

export interface PairState {
  readonly pairs: readonly FilePairPaths[];
  readonly selectedIndex: number;
  readonly visibility: PairPaneVisibility;
}

export function togglePairPane(
  state: PairPaneVisibility,
  side: PairPaneSide,
): PairPaneVisibility {
  return isPairPaneVisible(state, side)
    ? hidePairPane(state, side)
    : showPairPane(state, side);
}

export function initialPairState(pairs: readonly FilePairPaths[]): PairState {
  return { pairs, selectedIndex: 0, visibility: "both" };
}

export function selectPair(state: PairState, index: number): PairState {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.pairs.length ||
    index === state.selectedIndex
  )
    return state;
  return { ...state, selectedIndex: index };
}

export function selectedPair(state: PairState): FilePairPaths | null {
  return state.pairs[state.selectedIndex] ?? null;
}

export function setPairVisibility(
  state: PairState,
  visibility: PairPaneVisibility,
): PairState {
  return { ...state, visibility };
}
