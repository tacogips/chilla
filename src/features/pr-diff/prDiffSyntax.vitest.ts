import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { highlightSyntaxSegments, syntaxKindForPath } from "./prDiffSyntax";
import {
  diffSyntaxFixtures,
  diffSyntaxKinds,
  fixturePaths,
} from "./prDiffSyntaxFixtures";
import { highlightSyntaxSegments as reference } from "./prDiffSyntaxReference.fixture";
import type { SyntaxSegment } from "./prDiffSyntaxTypes";

function styles(segments: readonly SyntaxSegment[]): string {
  return segments
    .map((segment) => `${segment.kind},`.repeat(segment.text.length))
    .join("");
}

describe("exhaustive diff syntax optimization", () => {
  it("covers every member of the authoritative SyntaxKind union", () => {
    const types = readFileSync(
      "src/features/pr-diff/prDiffSyntaxTypes.ts",
      "utf8",
    );
    const kinds = Array.from(
      types.split("export interface")[0]?.matchAll(/\| "([a-z]+)"/g) ?? [],
      (match) => match[1],
    );
    expect([...diffSyntaxKinds].sort()).toEqual(kinds.sort());
  });

  for (const kind of diffSyntaxKinds) {
    it(`${kind}: detects every recorded alias, including uppercase filenames`, () => {
      for (const path of fixturePaths(kind)) {
        expect(syntaxKindForPath(`directory/${path}`)).toBe(kind);
        expect(syntaxKindForPath(`directory/${path.toUpperCase()}`)).toBe(kind);
      }
    });

    it(`${kind}: preserves source and per-character styles`, () => {
      const corpus = [
        diffSyntaxFixtures[kind].source,
        "",
        "   \t\r\n",
        "日本語é😀\ud800\udc00\ud800\u0000",
        "[]{}():;,.=<>/+*-!@%&|?",
        "12.5 1. 1.2.3 name-with-hyphen _value",
        '"escaped \\" quote" \'unfinished\\',
        '"literal // # ; <!--" /* comment',
        "a".repeat(2000),
        " ".repeat(2000),
        "`".repeat(1000),
        "[".repeat(1000),
        "# Header",
        "  12. item",
        "word   : true",
        "[x](y) []() [[x](y)",
        "``some ` code`` and ``` no close",
        "123abc: 123.456: -key_name:",
      ];
      // Deterministic malformed fragments explore transitions, not only valid syntax.
      let seed = 12345;
      const alphabet = "ab12_- :;.#/\\\"'`[]()\t\n日本";
      for (let sample = 0; sample < 100; sample += 1) {
        let source = "";
        for (let index = 0; index < 80; index += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          source += alphabet[seed % alphabet.length];
        }
        corpus.push(source);
      }
      for (const source of corpus) {
        const actual = highlightSyntaxSegments(source, kind);
        const previous = reference(source, kind);
        expect(actual.map((segment) => segment.text).join("")).toBe(source);
        expect(styles(actual), source).toBe(styles(previous));
        expect(actual.length).toBeLessThanOrEqual(previous.length);
        for (let index = 1; index < actual.length; index += 1) {
          expect(actual[index]?.kind).not.toBe(actual[index - 1]?.kind);
        }
      }
    });
  }

  it("bounds spans for long plain runs without omitting any syntax", () => {
    for (const kind of diffSyntaxKinds) {
      expect(highlightSyntaxSegments(" ".repeat(100_000), kind)).toEqual([
        { kind: "plain", text: " ".repeat(100_000) },
      ]);
    }
    expect(
      highlightSyntaxSegments("word".repeat(25_000), "markdown"),
    ).toHaveLength(1);
  });
});
