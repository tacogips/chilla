import { commentStartForSyntax } from "./prDiffSyntaxLanguages";
import { keywordSetForSyntax } from "./prDiffSyntaxKeywords";
import type { SyntaxKind, SyntaxSegment } from "./prDiffSyntaxTypes";

export type { SyntaxKind } from "./prDiffSyntaxTypes";
export { syntaxKindForPath } from "./prDiffSyntaxLanguages";

function pushSyntaxSegment(
  segments: SyntaxSegment[],
  kind: SyntaxSegment["kind"],
  text: string,
): void {
  if (text.length > 0) {
    segments.push({ kind, text });
  }
}

function highlightMarkdownSegments(content: string): readonly SyntaxSegment[] {
  const segments: SyntaxSegment[] = [];
  let index = 0;

  const heading = content.match(/^#{1,6}(?=\s)/);
  if (heading !== null) {
    pushSyntaxSegment(segments, "markup", heading[0]);
    index = heading[0].length;
  }

  const listMarker = content.slice(index).match(/^(\s*)([-*+]|\d+[.)])(?=\s)/);
  if (listMarker !== null) {
    pushSyntaxSegment(segments, "plain", listMarker[1] ?? "");
    pushSyntaxSegment(segments, "punctuation", listMarker[2] ?? "");
    index += listMarker[0].length;
  }

  while (index < content.length) {
    const rest = content.slice(index);
    const inlineCode = rest.match(/^`+[^`]+`+/);
    if (inlineCode !== null) {
      pushSyntaxSegment(segments, "string", inlineCode[0]);
      index += inlineCode[0].length;
      continue;
    }

    const link = rest.match(/^\[[^\]]+\]\([^)]+\)/);
    if (link !== null) {
      pushSyntaxSegment(segments, "markup", link[0]);
      index += link[0].length;
      continue;
    }

    const frontMatterKey = rest.match(/^[A-Za-z0-9_-]+(?=\s*:)/);
    if (frontMatterKey !== null) {
      pushSyntaxSegment(segments, "keyword", frontMatterKey[0]);
      index += frontMatterKey[0].length;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?/);
    if (number !== null) {
      pushSyntaxSegment(segments, "number", number[0]);
      index += number[0].length;
      continue;
    }

    const char = content[index] ?? "";
    if (/[\[\]{}():;,.=<>/+*-]/.test(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    pushSyntaxSegment(segments, "plain", char);
    index += 1;
  }

  return segments.length === 0 ? [{ kind: "plain", text: content }] : segments;
}

export function highlightSyntaxSegments(
  content: string,
  syntaxKind: SyntaxKind,
): readonly SyntaxSegment[] {
  if (syntaxKind === "plain" || content.length === 0) {
    return [{ kind: "plain", text: content }];
  }

  if (syntaxKind === "markdown") {
    return highlightMarkdownSegments(content);
  }

  const commentStart = commentStartForSyntax(content, syntaxKind);
  const body = commentStart >= 0 ? content.slice(0, commentStart) : content;
  const comment = commentStart >= 0 ? content.slice(commentStart) : "";
  const keywords = keywordSetForSyntax(syntaxKind);
  const segments: SyntaxSegment[] = [];
  let index = 0;

  while (index < body.length) {
    const char = body[index] ?? "";

    if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < body.length) {
        const current = body[end];
        if (current === "\\" && end + 1 < body.length) {
          end += 2;
          continue;
        }
        end += 1;
        if (current === char) {
          break;
        }
      }
      pushSyntaxSegment(segments, "string", body.slice(index, end));
      index = end;
      continue;
    }

    if (/\d/.test(char)) {
      const match = body.slice(index).match(/^\d+(?:\.\d+)?/);
      const text = match?.[0] ?? char;
      pushSyntaxSegment(segments, "number", text);
      index += text.length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = body.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
      const text = match?.[0] ?? char;
      pushSyntaxSegment(
        segments,
        keywords.has(text) ? "keyword" : "plain",
        text,
      );
      index += text.length;
      continue;
    }

    if (/[\[\]{}():;,.=<>/+*-]/.test(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    pushSyntaxSegment(segments, "plain", char);
    index += 1;
  }

  if (comment.length > 0) {
    pushSyntaxSegment(segments, "comment", comment);
  }

  return segments;
}
