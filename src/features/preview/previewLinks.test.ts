import { posix } from "node:path";
import { describe, expect, it } from "bun:test";
import { classifyPreviewLink, slugifyHeading } from "./previewLinks";

const api = {
  dirname: async (path: string) => posix.dirname(path),
  join: async (...paths: string[]) => posix.join(...paths),
  normalize: async (path: string) => posix.normalize(path),
};

describe("preview links", () => {
  it("resolves local paths without re-splitting decoded delimiters", async () => {
    const cases = [
      ["./b.md", "/docs/b.md", null],
      ["../a/b.md?x=1#Sec", "/a/b.md", "Sec"],
      ["sub/c.md", "/docs/sub/c.md", null],
      ["my%20doc.md", "/docs/my doc.md", null],
      ["chapter%23one.md", "/docs/chapter#one.md", null],
      ["chapter%3Fone.md#heading", "/docs/chapter?one.md", "heading"],
      ["name%253F.md", "/docs/name%3F.md", null],
      ["/abs/x.md", "/abs/x.md", null],
      ["bad%E0%A4.md", "/docs/bad%E0%A4.md", null],
    ] as const;
    for (const [href, path, fragment] of cases) {
      expect(await classifyPreviewLink(href, "/docs/index.md", api)).toEqual({
        kind: "file",
        path,
        fragment,
      });
    }
  });
  it("classifies anchors, queries, external and ignored links", async () => {
    expect(await classifyPreviewLink("#%E6%97%A5", null, api)).toEqual({
      kind: "anchor",
      fragment: "日",
    });
    expect(await classifyPreviewLink("?x#y", "/docs/index.md", api)).toEqual({
      kind: "anchor",
      fragment: "y",
    });
    expect(await classifyPreviewLink("?x", "/docs/index.md", api)).toEqual({
      kind: "ignore",
    });
    for (const url of ["https://x.y", "MAILTO:a@b.c", "tel:1"]) {
      expect(await classifyPreviewLink(url, null, api)).toEqual({
        kind: "external",
        url,
      });
    }
    for (const href of ["javascript:x", "ftp://h", "//host/p", "#", ""]) {
      expect(await classifyPreviewLink(href, "/docs/index.md", api)).toEqual({
        kind: "ignore",
      });
    }
    expect(await classifyPreviewLink("a.md", null, api)).toEqual({
      kind: "ignore",
    });
  });
  it("slugifies heading text", () => {
    for (const [input, result] of [
      ["Child Topic", "child-topic"],
      ["", "section"],
      ["a_b", "a-b"],
      ["C++ API", "c-api"],
      ["日本 語", "日本-語"],
      ["2024 Notes", "2024-notes"],
    ] as const) {
      expect(slugifyHeading(input)).toBe(result);
    }
  });
});
