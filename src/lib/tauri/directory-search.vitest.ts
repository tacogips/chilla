import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { searchDirectory } from "./directory-search";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
describe("directory search IPC", () => {
  it("sends the agreed command input and preserves result metadata", async () => {
    const result = {
      root_path: "/workspace",
      matches: [],
      truncated: true,
      skipped_count: 2,
      scanned_files: 30,
    };
    vi.mocked(invoke).mockResolvedValue(result);
    const input = {
      path: "/workspace",
      query: "literal text",
      kind: "content" as const,
      hideGitIgnored: true,
    };
    expect(await searchDirectory(input)).toEqual(result);
    expect(invoke).toHaveBeenCalledWith("search_directory", { input });
  });
});
