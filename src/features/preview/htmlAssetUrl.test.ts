import { describe, expect, it } from "bun:test";

import { buildRenderedHtmlAssetUrl } from "./htmlAssetUrl";

const ASSET_BASE = "asset://localhost/";

describe("buildRenderedHtmlAssetUrl", () => {
  it("keeps '/' literal between segments so relative resources resolve", () => {
    expect(
      buildRenderedHtmlAssetUrl("/Users/taco/site/index.html", ASSET_BASE),
    ).toBe("asset://localhost/%2FUsers/taco/site/index.html");
  });

  it("percent-encodes spaces within a segment", () => {
    expect(
      buildRenderedHtmlAssetUrl(
        "/Users/taco/my project/index.html",
        ASSET_BASE,
      ),
    ).toBe("asset://localhost/%2FUsers/taco/my%20project/index.html");
  });

  it("percent-encodes unicode characters within a segment", () => {
    expect(
      buildRenderedHtmlAssetUrl("/Users/taco/日本語/index.html", ASSET_BASE),
    ).toBe(
      `asset://localhost/%2FUsers/taco/${encodeURIComponent("日本語")}/index.html`,
    );
  });

  it("percent-encodes '#' so it cannot start a URL fragment", () => {
    expect(
      buildRenderedHtmlAssetUrl("/Users/taco/notes#1.html", ASSET_BASE),
    ).toBe("asset://localhost/%2FUsers/taco/notes%231.html");
  });

  it("percent-encodes '?' so it cannot start a query string", () => {
    expect(
      buildRenderedHtmlAssetUrl("/Users/taco/what?.html", ASSET_BASE),
    ).toBe("asset://localhost/%2FUsers/taco/what%3F.html");
  });

  it("percent-encodes a literal '%' so it is not treated as an escape", () => {
    expect(buildRenderedHtmlAssetUrl("/Users/taco/100%.html", ASSET_BASE)).toBe(
      "asset://localhost/%2FUsers/taco/100%25.html",
    );
  });

  it("normalizes backslashes before splitting (Windows-style paths)", () => {
    expect(
      buildRenderedHtmlAssetUrl("C:\\Users\\taco\\index.html", ASSET_BASE),
    ).toBe("asset://localhost/%2FC%3A/Users/taco/index.html");
  });

  it("resolves a sibling relative reference to the file's own directory", () => {
    const pageUrl = buildRenderedHtmlAssetUrl(
      "/Users/taco/site/index.html",
      ASSET_BASE,
    );
    const resolved = new URL("style.css", pageUrl);
    expect(resolved.toString()).toBe(
      "asset://localhost/%2FUsers/taco/site/style.css",
    );
  });
});
