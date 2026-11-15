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
