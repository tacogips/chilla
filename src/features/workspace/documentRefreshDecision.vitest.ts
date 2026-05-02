import { describe, expect, it } from "vitest";
import type { DocumentSnapshot } from "../../lib/tauri/document";
import {
  canReloadMarkdownSnapshotForPresentationRefresh,
  decideMarkdownDocumentRefresh,
} from "./documentRefreshDecision";

function snapshot(
  path: string,
  sourceText: string,
  revision = "r1",
): DocumentSnapshot {
  return {
    path,
    file_name: "note.md",
    source_text: sourceText,
    source_html: "",
    html: "",
    headings: [],
    revision_token: revision,
    last_modified: "",
  };
}

describe("canReloadMarkdownSnapshotForPresentationRefresh", () => {
  it("returns false when no document", () => {
    expect(canReloadMarkdownSnapshotForPresentationRefresh(null, "")).toBe(false);
  });

  it("returns true only when buffer matches persisted baseline text", () => {
    const doc = snapshot("/a.md", "hello");
    expect(
      canReloadMarkdownSnapshotForPresentationRefresh(doc, "hello"),
    ).toBe(true);
    expect(
      canReloadMarkdownSnapshotForPresentationRefresh(doc, "edited"),
    ).toBe(false);
  });
});

describe("decideMarkdownDocumentRefresh", () => {
  it("ignores when no document is open", () => {
    const refreshed = snapshot("/a.md", "disk");
    expect(decideMarkdownDocumentRefresh(null, "local", refreshed).kind).toBe(
      "ignore",
    );
  });

  it("ignores when the event path does not match the active document", () => {
    const current = snapshot("/a.md", "a");
    const refreshed = snapshot("/b.md", "b");
    expect(decideMarkdownDocumentRefresh(current, "a", refreshed).kind).toBe(
      "ignore",
    );
  });

  it("applies when the buffer matches the adopted baseline", () => {
    const current = snapshot("/a.md", "hello");
    const refreshed = snapshot("/a.md", "hello", "r2");
    const decision = decideMarkdownDocumentRefresh(current, "hello", refreshed);
    expect(decision).toEqual({ kind: "apply", snapshot: refreshed });
  });

  it("signals conflict when the buffer diverges from the baseline", () => {
    const current = snapshot("/a.md", "hello");
    const refreshed = snapshot("/a.md", "from disk", "r2");
    const decision = decideMarkdownDocumentRefresh(
      current,
      "hello local",
      refreshed,
    );
    expect(decision).toEqual({ kind: "conflict", snapshot: refreshed });
  });
});
