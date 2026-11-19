import { describe, expect, it } from "vitest";
import { findFragmentTarget } from "./previewFragment";

describe("findFragmentTarget", () => {
  it("finds exact IDs and heading slugs without constructing selectors from fragments", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<h2 id="2024-notes"></h2><h2 id="a-b"></h2><p id="x"></p>';
    expect(findFragmentTarget(container, "2024-notes")).toBe(
      container.children[0],
    );
    expect(findFragmentTarget(container, "a_b")).toBe(container.children[1]);
    expect(findFragmentTarget(container, "x")).toBe(container.children[2]);
    expect(findFragmentTarget(container, "missing")).toBeNull();
    const emptyContainer = document.createElement("div");
    expect(findFragmentTarget(emptyContainer, 'a"b')).toBeNull();
  });
});
