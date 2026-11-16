import { describe, expect, it } from "vitest";
import {
  initialPairState,
  selectPair,
  selectedPair,
  setPairVisibility,
  togglePairPane,
  canHidePairPane,
  hidePairPane,
  isPairPaneVisible,
  showPairPane,
  type PairPaneSide,
  type PairPaneVisibility,
} from "./pairPaneVisibility";

describe("pair pane visibility", () => {
  const states: PairPaneVisibility[] = ["both", "left_only", "right_only"];
  const sides: PairPaneSide[] = ["left", "right"];

  it("implements every hide and show transition", () => {
    expect(hidePairPane("both", "left")).toBe("right_only");
    expect(hidePairPane("both", "right")).toBe("left_only");
    expect(hidePairPane("left_only", "left")).toBe("left_only");
    expect(hidePairPane("left_only", "right")).toBe("left_only");
    expect(hidePairPane("right_only", "left")).toBe("right_only");
    expect(hidePairPane("right_only", "right")).toBe("right_only");
    expect(showPairPane("both", "left")).toBe("both");
    expect(showPairPane("both", "right")).toBe("both");
    expect(showPairPane("left_only", "left")).toBe("left_only");
    expect(showPairPane("left_only", "right")).toBe("both");
    expect(showPairPane("right_only", "left")).toBe("both");
    expect(showPairPane("right_only", "right")).toBe("right_only");
  });

  it("allows hiding only when both panes are visible", () => {
    for (const state of states) {
      for (const side of sides) {
        expect(canHidePairPane(state, side)).toBe(state === "both");
      }
    }
  });

  it("keeps at least one pane visible across every action sequence up to four", () => {
    const walk = (state: PairPaneVisibility, remaining: number): void => {
      expect(
        isPairPaneVisible(state, "left") || isPairPaneVisible(state, "right"),
      ).toBe(true);
      if (remaining === 0) return;
      for (const side of sides) {
        walk(hidePairPane(state, side), remaining - 1);
        walk(showPairPane(state, side), remaining - 1);
      }
    };
    walk("both", 4);
  });
});

describe("pair state", () => {
  it("toggles every visibility and preserves at least one pane through sequences", () => {
    const expected = [
      ["right_only", "left_only"],
      ["left_only", "both"],
      ["both", "right_only"],
    ] as const;
    const states: PairPaneVisibility[] = ["both", "left_only", "right_only"];
    for (const [index, state] of states.entries()) {
      expect(togglePairPane(state, "left")).toBe(expected[index]?.[0]);
      expect(togglePairPane(state, "right")).toBe(expected[index]?.[1]);
    }
    const walk = (state: PairPaneVisibility, depth: number): void => {
      expect(
        isPairPaneVisible(state, "left") || isPairPaneVisible(state, "right"),
      ).toBe(true);
      if (depth > 0)
        for (const side of ["left", "right"] as const)
          walk(togglePairPane(state, side), depth - 1);
    };
    for (const state of states) walk(state, 4);
  });

  it("selects pairs without changing visibility and rejects invalid indices", () => {
    const pairs = [
      { left_file_path: "a", right_file_path: "b" },
      { left_file_path: "c", right_file_path: "d" },
    ];
    const initial = initialPairState(pairs);
    expect(initial).toEqual({ pairs, selectedIndex: 0, visibility: "both" });
    expect(selectedPair(initial)).toBe(pairs[0]);
    for (const index of [0, 2, -1, 0.5])
      expect(selectPair(initial, index)).toBe(initial);
    const hidden = setPairVisibility(initial, "right_only");
    const next = selectPair(hidden, 1);
    expect(next.visibility).toBe("right_only");
    expect(next.selectedIndex).toBe(1);
    expect(selectedPair(next)).toBe(pairs[1]);
    expect(selectedPair(initialPairState([]))).toBeNull();
  });
});
