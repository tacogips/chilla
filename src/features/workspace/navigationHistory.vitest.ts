import { describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  EMPTY_NAVIGATION_HISTORY,
  isSameNavigationTarget,
  type NavigationLocation,
  pushNavigationLocation,
  stepNavigationHistory,
  updateCurrentNavigationLocation,
} from "./navigationHistory";

const single = (
  path: string,
  fragment: string | null = null,
): Extract<NavigationLocation, { kind: "single" }> => ({
  kind: "single",
  path,
  fragment,
  scrollTop: null,
});

describe("navigation history", () => {
  it("starts empty and cannot step", () => {
    expect(canGoBack(EMPTY_NAVIGATION_HISTORY)).toBe(false);
    expect(canGoForward(EMPTY_NAVIGATION_HISTORY)).toBe(false);
    expect(stepNavigationHistory(EMPTY_NAVIGATION_HISTORY, -1)).toBeNull();
    expect(stepNavigationHistory(EMPTY_NAVIGATION_HISTORY, 1)).toBeNull();
  });

  it("pushes two entries and allows back", () => {
    const state = pushNavigationLocation(
      pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A")),
      single("B"),
    );
    expect(state.index).toBe(1);
    expect(canGoBack(state)).toBe(true);
    expect(EMPTY_NAVIGATION_HISTORY.entries).toEqual([]);
  });

  it("truncates forward entries after going back and pushing", () => {
    const a = pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A"));
    const b = pushNavigationLocation(a, single("B"));
    const c = pushNavigationLocation(b, single("C"));
    const back = stepNavigationHistory(c, -1);
    expect(back).not.toBeNull();
    if (back === null) throw new Error("Expected back entry");
    const d = pushNavigationLocation(back.state, single("D"));
    expect(d.entries).toEqual([single("A"), single("B"), single("D")]);
    expect(canGoForward(d)).toBe(false);
    expect(c.entries).toEqual([single("A"), single("B"), single("C")]);
  });

  it("suppresses duplicate targets regardless of scroll", () => {
    const state = pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A"));
    const duplicate = pushNavigationLocation(state, {
      ...single("A"),
      scrollTop: 120,
    });
    expect(duplicate).toBe(state);
    expect(duplicate.entries).toHaveLength(1);
  });

  it("treats a different fragment as a new target", () => {
    const state = pushNavigationLocation(
      pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A")),
      single("A", "x"),
    );
    expect(state.entries).toHaveLength(2);
  });

  it("caps history at 100 with the newest index", () => {
    let state = EMPTY_NAVIGATION_HISTORY;
    for (let i = 1; i <= 105; i++)
      state = pushNavigationLocation(state, single(String(i)));
    expect(state.entries).toHaveLength(100);
    expect(state.entries[0]).toEqual(single("6"));
    expect(state.index).toBe(99);
  });

  it("updates only the current entry without mutating the input", () => {
    const state = pushNavigationLocation(
      pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A")),
      single("B"),
    );
    const updated = updateCurrentNavigationLocation(state, (current) => ({
      ...current,
      scrollTop: 120,
    }));
    expect(updated.entries).toEqual([
      single("A"),
      { ...single("B"), scrollTop: 120 },
    ]);
    expect(state.entries).toEqual([single("A"), single("B")]);
    expect(
      updateCurrentNavigationLocation(
        EMPTY_NAVIGATION_HISTORY,
        (current) => current,
      ),
    ).toBe(EMPTY_NAVIGATION_HISTORY);
  });

  it("distinguishes pair targets by their left path", () => {
    const pane = { path: "A", fragment: null, scrollTop: null };
    const pair: NavigationLocation = {
      kind: "pair",
      pairIndex: 0,
      left: pane,
      right: pane,
    };
    expect(
      isSameNavigationTarget(pair, { ...pair, left: { ...pane, path: "B" } }),
    ).toBe(false);
  });

  it("returns to the original entry after back and forward", () => {
    const state = pushNavigationLocation(
      pushNavigationLocation(EMPTY_NAVIGATION_HISTORY, single("A")),
      single("B"),
    );
    const back = stepNavigationHistory(state, -1);
    expect(back).not.toBeNull();
    if (back === null) throw new Error("Expected back entry");
    const forward = stepNavigationHistory(back.state, 1);
    expect(forward?.state.index).toBe(state.index);
    expect(forward?.location).toEqual(single("B"));
    expect(state.index).toBe(1);
  });
});
