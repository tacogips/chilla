import { describe, expect, it } from "bun:test";
import { __browserMock } from "./document";

describe("browser mock document adapter", () => {
  it("returns highlighted markdown source HTML for mock documents", () => {
    const snapshot = __browserMock.openDocument("/mock/workspace/README.md");

    expect(snapshot.source_html).toContain("<pre");
    expect(snapshot.source_html).toContain("<code>");
    expect(snapshot.source_html).toContain("This document is served by the browser mock adapter.");
  });

  it("returns paged root directory data", () => {
    const firstPage = __browserMock.listDirectory(
      "/mock/workspace",
      { field: "name", direction: "asc" },
      "",
      0,
      200,
    );
    const secondPage = __browserMock.listDirectory(
      "/mock/workspace",
      { field: "name", direction: "asc" },
      "",
      200,
      200,
    );

    expect(firstPage.entries.length).toBe(200);
    expect(firstPage.total_entry_count).toBe(229);
    expect(firstPage.has_more).toBe(true);
    expect(secondPage.entries.length).toBe(29);
    expect(secondPage.has_more).toBe(false);
  });

  it("sorts name pages without forcing directories first in the browser mock", () => {
    const page = __browserMock.listDirectory(
      "/mock/workspace",
      { field: "name", direction: "asc" },
      "",
      0,
      20,
    );

    expect(page.entries.slice(0, 4).map((entry) => entry.name)).toEqual([
      "archive",
      "data.bin",
      "docs",
      "image.png",
    ]);
  });

  it("filters before pagination in the browser mock", () => {
    const page = __browserMock.listDirectory(
      "/mock/workspace",
      { field: "name", direction: "asc" },
      "notes-220",
      0,
      200,
    );

    expect(page.total_entry_count).toBe(1);
    expect(page.entries.map((entry) => entry.name)).toEqual(["notes-220.md"]);
    expect(page.has_more).toBe(false);
  });
});
