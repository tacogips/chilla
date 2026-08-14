import { describe, expect, it } from "bun:test";

import { selectionPreviewDebounceMsForPath } from "./workspacePreviewModel";

describe("selectionPreviewDebounceMsForPath", () => {
  it("uses the fast image-preview debounce for SVG paths", () => {
    expect(selectionPreviewDebounceMsForPath("icon.svg")).toBe(120);
    expect(selectionPreviewDebounceMsForPath("ICON.SVG")).toBe(120);
  });

  it("keeps the default debounce for non-image text paths", () => {
    expect(selectionPreviewDebounceMsForPath("notes.xml")).toBe(500);
  });
});
