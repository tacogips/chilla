import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { listDirectory, loadPrDiff, loadPrDiffFileText } from "./document";
import type { DirectoryPage, DirectoryListSort } from "./document";

describe("listDirectory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the directory request under the nested input payload", async () => {
    const sort: DirectoryListSort = {
      field: "name",
      direction: "asc",
    };
    const response: DirectoryPage = {
      current_directory_path: "/workspace",
      parent_directory_path: "/",
      entries: [],
      total_entry_count: 0,
      offset: 0,
      limit: 200,
      has_more: false,
    };
    invokeMock.mockResolvedValue(response);

    await expect(
      listDirectory("/workspace", sort, "", 0, 200),
    ).resolves.toEqual(response);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("list_directory", {
      input: {
        path: "/workspace",
        sort,
        query: "",
        offset: 0,
        limit: 200,
      },
    });
  });

  it("rejects empty directory paths before invoking Tauri", async () => {
    const sort: DirectoryListSort = {
      field: "name",
      direction: "asc",
    };

    await expect(listDirectory("", sort, "", 0, 200)).rejects.toThrow(
      "Directory path is required before listing files",
    );

    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("loadPrDiff", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the GitHub PR target through the Tauri command", async () => {
    const target = {
      owner: "tacogips",
      repo: "chilla",
      number: 12,
      url: "https://github.com/tacogips/chilla/pull/12",
      use_cache: false,
    };
    const response = {
      identity: {
        owner: target.owner,
        repo: target.repo,
        number: target.number,
        url: target.url,
        title: "Example",
        state: "open",
        merged: false,
        merged_at: null,
        updated_at: "2026-06-02T00:00:00Z",
        base_branch: "main",
        head_branch: "feature",
      },
      files: [],
      additions: 0,
      deletions: 0,
      warnings: [],
    };
    invokeMock.mockResolvedValue(response);

    await expect(loadPrDiff(target)).resolves.toEqual(response);

    expect(invokeMock).toHaveBeenCalledWith("load_pr_diff", {
      target,
    });
  });
});

describe("loadPrDiffFileText", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the raw GitHub file URL through the Tauri command", async () => {
    const response = {
      full_text: "const value = 1;",
      full_text_truncated: false,
    };
    invokeMock.mockResolvedValue(response);

    await expect(
      loadPrDiffFileText(
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
      ),
    ).resolves.toEqual(response);

    expect(invokeMock).toHaveBeenCalledWith("load_pr_diff_file_text", {
      rawUrl:
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
    });
  });
});
