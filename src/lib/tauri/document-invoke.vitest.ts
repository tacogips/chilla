import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { listDirectory } from "./document";
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
