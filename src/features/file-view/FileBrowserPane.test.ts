import { describe, expect, it } from "bun:test";
import type { DirectorySnapshot } from "../../lib/tauri/document";
import { resolveAbsoluteSelectedIndex } from "./FileBrowserPane";

const snapshot: DirectorySnapshot = {
  current_directory_path: "/workspace",
  parent_directory_path: "/",
  entries: [
    {
      path: "/workspace/blocked",
      name: "blocked",
      is_directory: true,
      size_bytes: 0,
      modified_at_unix_ms: 1,
    },
    {
      path: "/workspace/next.md",
      name: "next.md",
      is_directory: false,
      size_bytes: 10,
      modified_at_unix_ms: 2,
    },
  ],
  total_entries: 50,
  offset: 10,
  limit: 20,
  query: "",
  sort: {
    field: "name",
    direction: "asc",
  },
};

describe("resolveAbsoluteSelectedIndex", () => {
  it("prefers the frontend-owned selected index when available", () => {
    expect(
      resolveAbsoluteSelectedIndex(snapshot, "/workspace/next.md", 10),
    ).toBe(10);
    expect(
      resolveAbsoluteSelectedIndex(snapshot, "/workspace/blocked", 11),
    ).toBe(11);
  });

  it("falls back to the loaded row path when the snapshot index is absent", () => {
    expect(
      resolveAbsoluteSelectedIndex(snapshot, "/workspace/blocked", null),
    ).toBe(10);
    expect(
      resolveAbsoluteSelectedIndex(snapshot, "/workspace/next.md", null),
    ).toBe(11);
  });

  it("returns -1 when neither an index nor a loaded path is available", () => {
    expect(
      resolveAbsoluteSelectedIndex(snapshot, "/workspace/missing.md", null),
    ).toBe(-1);
    expect(resolveAbsoluteSelectedIndex(null, null, null)).toBe(-1);
  });
});
