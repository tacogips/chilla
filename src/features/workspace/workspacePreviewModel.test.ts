import { describe, expect, it } from "bun:test";

import { selectionPreviewDebounceMsForPath } from "./workspacePreviewModel";

describe("selectionPreviewDebounceMsForPath", () => {
  const imageExtensions = [
    "apng",
    "avif",
    "bmp",
    "dib",
    "gif",
    "heic",
    "heics",
    "heif",
    "heifs",
    "ico",
    "jfif",
    "jpe",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "tif",
    "tiff",
    "webp",
  ] as const;

  for (const extension of imageExtensions) {
    it(`uses the fast image-preview debounce for .${extension} paths`, () => {
      expect(selectionPreviewDebounceMsForPath(`image.${extension}`)).toBe(120);
      expect(
        selectionPreviewDebounceMsForPath(`IMAGE.${extension.toUpperCase()}`),
      ).toBe(120);
    });
  }

  it("keeps the default debounce for non-image text paths", () => {
    expect(selectionPreviewDebounceMsForPath("notes.xml")).toBe(500);
  });
});
