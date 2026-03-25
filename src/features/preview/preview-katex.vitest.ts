import katex from "katex";
import { describe, expect, it } from "vitest";

describe("KaTeX TeX rendering", () => {
  it("produces inline HTML with the katex class", () => {
    const html = katex.renderToString("x^2", {
      displayMode: false,
      throwOnError: false,
    });

    expect(html).toContain("katex");
    expect(html).not.toContain("katex-display");
  });

  it("produces display HTML with katex-display when displayMode is true", () => {
    const html = katex.renderToString(String.raw`\sum_{i=1}^n i`, {
      displayMode: true,
      throwOnError: false,
    });

    expect(html).toContain("katex-display");
    expect(html).toContain("katex");
  });

  it("does not throw for invalid TeX when throwOnError is false", () => {
    expect(() =>
      katex.renderToString("\\oops{", {
        displayMode: false,
        throwOnError: false,
      }),
    ).not.toThrow();
  });
});
