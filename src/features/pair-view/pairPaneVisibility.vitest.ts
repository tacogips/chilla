import { describe, expect, it } from "vitest";
import {
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
