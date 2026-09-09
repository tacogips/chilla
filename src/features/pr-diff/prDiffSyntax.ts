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
    const previous = segments[segments.length - 1];
    if (previous?.kind === kind) {
      segments[segments.length - 1] = { kind, text: previous.text + text };
    } else {
      segments.push({ kind, text });
    }
  }
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isIdentifierStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
  );
}

function isIdentifierPart(code: number): boolean {
  return isIdentifierStart(code) || isDigit(code) || code === 45;
}

function numberEnd(content: string, start: number): number {
  let end = start + 1;
  while (isDigit(content.charCodeAt(end))) end += 1;
  if (content.charCodeAt(end) === 46 && isDigit(content.charCodeAt(end + 1))) {
    end += 2;
    while (isDigit(content.charCodeAt(end))) end += 1;
  }
  return end;
}

const punctuation = new Set("[]{}():;,.=<>/+*-");

function highlightMarkdownSegments(content: string): readonly SyntaxSegment[] {
  const segments: SyntaxSegment[] = [];
  let index = 0;
  let nonKeyUntil = 0;
  let invalidLinkUntil = 0;

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
    const char = content[index] ?? "";
    if (char === "`") {
      let openingEnd = index + 1;
      while (content[openingEnd] === "`") openingEnd += 1;
      const closingStart = content.indexOf("`", openingEnd);
      if (closingStart >= 0) {
        let end = closingStart + 1;
        while (content[end] === "`") end += 1;
        pushSyntaxSegment(segments, "string", content.slice(index, end));
        index = end;
      } else {
        pushSyntaxSegment(segments, "plain", content.slice(index, openingEnd));
        index = openingEnd;
      }
      continue;
    }
    if (char === "[" && index >= invalidLinkUntil) {
      const labelEnd = content.indexOf("]", index + 1);
      const targetEnd =
        content[labelEnd + 1] === "(" ? content.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd > index + 1 && targetEnd > labelEnd + 2) {
        pushSyntaxSegment(
          segments,
          "markup",
          content.slice(index, targetEnd + 1),
        );
        index = targetEnd + 1;
        continue;
      }
      invalidLinkUntil = labelEnd < 0 ? content.length : labelEnd;
    }
    const code = content.charCodeAt(index);
    if (index >= nonKeyUntil && isIdentifierPart(code)) {
      let end = index + 1;
      while (isIdentifierPart(content.charCodeAt(end))) end += 1;
      let colon = end;
      while (colon < content.length && /\s/.test(content[colon] ?? ""))
        colon += 1;
      if (content[colon] === ":") {
        pushSyntaxSegment(segments, "keyword", content.slice(index, end));
        index = end;
        continue;
      }
      // No suffix in this identifier can be a key either. Avoid rescanning it.
      nonKeyUntil = end;
    }
    if (isDigit(code)) {
      const end = numberEnd(content, index);
      pushSyntaxSegment(segments, "number", content.slice(index, end));
      index = end;
      continue;
    }
    if (punctuation.has(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    let end = index + 1;
    // A failed key probe already classified this identifier; consume its letters
    // together while retaining the old number/punctuation boundaries.
    while (end < nonKeyUntil && isIdentifierStart(content.charCodeAt(end)))
      end += 1;
    if (char === " " || char === "\t") {
      while (content[end] === " " || content[end] === "\t") end += 1;
    }
    pushSyntaxSegment(segments, "plain", content.slice(index, end));
    index = end;
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

    const code = body.charCodeAt(index);
    if (isDigit(code)) {
      const end = numberEnd(body, index);
      pushSyntaxSegment(segments, "number", body.slice(index, end));
      index = end;
      continue;
    }

    if (isIdentifierStart(code)) {
      let end = index + 1;
      while (isIdentifierPart(body.charCodeAt(end))) end += 1;
      const text = body.slice(index, end);
      pushSyntaxSegment(
        segments,
        keywords.has(text) ? "keyword" : "plain",
        text,
      );
      index = end;
      continue;
    }

    if (punctuation.has(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    let end = index + 1;
    if (char === " " || char === "\t") {
      while (body[end] === " " || body[end] === "\t") end += 1;
    }
    pushSyntaxSegment(segments, "plain", body.slice(index, end));
    index = end;
  }

  if (comment.length > 0) {
    pushSyntaxSegment(segments, "comment", comment);
  }

  return segments;
}
