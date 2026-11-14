import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listDirectory,
  type DirectoryEntry,
  type DirectoryListSort,
  type DirectoryPage,
} from "../../lib/tauri/document";
import { createDirectoryTree, type DirectoryTreeSeed } from "./directory-tree";

vi.mock("../../lib/tauri/document", () => ({ listDirectory: vi.fn() }));
const entry = (path: string, directory = true): DirectoryEntry => ({
  path,
  canonical_path: path,
  name: path.split("/").pop() ?? "",
  directory_hint: "",
  is_directory: directory,
  is_symlink: false,
  size_bytes: 0,
  modified_at_unix_ms: 0,
});
const page = (
  root: string,
  entries: readonly DirectoryEntry[],
  hasMore = false,
  offset = 0,
): DirectoryPage => ({
  current_directory_path: root,
  parent_directory_path: "/",
  entries,
  total_entry_count: entries.length,
  offset,
  limit: 200,
  has_more: hasMore,
});
const seed = (
  entries = [entry("/workspace/src")],
  hasMore = false,
): DirectoryTreeSeed => ({
  root: "/workspace",
  entries,
  nextOffset: entries.length,
  hasMore,
  sort: { field: "name", direction: "asc" },
  query: "",
  hideGitIgnored: false,
});
let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  vi.resetAllMocks();
});
function setup(initial = seed()) {
  return createRoot((cleanup) => {
    dispose = cleanup;
    const [enabled, setEnabled] = createSignal(false);
    const [rootSeed, setSeed] = createSignal(initial);
    const [refresh, setRefresh] = createSignal(0);
    const [sort, setSort] = createSignal<DirectoryListSort>({
      field: "name",
      direction: "asc",
    });
    const [hide, setHide] = createSignal(false);
    const tree = createDirectoryTree({
      root: () => "/workspace",
      enabled,
      seed: rootSeed,
      refresh,
      sort,
      hideGitIgnored: hide,
      query: () => "",
    });
    return {
      tree,
      setEnabled,
      setSeed,
      refresh: () => setRefresh((n) => n + 1),
      setSort,
      setHide,
    };
  });
}

describe("lazy directory requests", () => {
  it("reuses the latest List pages and cached branches without implicitly fetching another page", async () => {
    const state = setup(seed([entry("/workspace/src")], true));
    state.setSeed(
      seed([entry("/workspace/src"), entry("/workspace/other")], true),
    );
    state.setEnabled(true);
    expect(state.tree.rows().map((row) => row.entry.path)).toEqual([
      "/workspace/src",
      "/workspace/other",
    ]);
    expect(listDirectory).not.toHaveBeenCalled();
    state.setSeed(
      seed(
        [
          entry("/workspace/src"),
          entry("/workspace/other"),
          entry("/workspace/late"),
        ],
        true,
      ),
    );
    expect(state.tree.rows()).toHaveLength(3);
    expect(listDirectory).not.toHaveBeenCalled();
    vi.mocked(listDirectory).mockResolvedValueOnce(
      page("/workspace/src", [entry("/workspace/src/deep")], true),
    );
    state.tree.toggle("/workspace/src");
    await vi.waitFor(() => expect(state.tree.rows()).toHaveLength(4));
    expect(listDirectory).toHaveBeenCalledTimes(1);
    expect(listDirectory).toHaveBeenLastCalledWith(
      "/workspace/src",
      { field: "name", direction: "asc" },
      "",
      false,
      0,
      200,
    );
    state.tree.toggle("/workspace/src");
    state.tree.toggle("/workspace/src");
    state.setEnabled(false);
    state.setEnabled(true);
    expect(listDirectory).toHaveBeenCalledTimes(1);
    vi.mocked(listDirectory).mockResolvedValueOnce(
      page(
        "/workspace/src",
        [entry("/workspace/src/next.md", false)],
        false,
        1,
      ),
    );
    await state.tree.load("/workspace/src");
    expect(listDirectory).toHaveBeenCalledTimes(2);
    expect(listDirectory).toHaveBeenLastCalledWith(
      "/workspace/src",
      { field: "name", direction: "asc" },
      "",
      false,
      1,
      200,
    );
  });

  it("refreshes only visible expanded folders and waits for parents before fetching descendants", async () => {
    const state = setup();
    state.setEnabled(true);
    vi.mocked(listDirectory)
      .mockResolvedValueOnce(
        page("/workspace/src", [entry("/workspace/src/deep")]),
      )
      .mockResolvedValueOnce(
        page("/workspace/src/deep", [
          entry("/workspace/src/deep/file.md", false),
        ]),
      );
    state.tree.toggle("/workspace/src");
    await vi.waitFor(() => expect(state.tree.rows()).toHaveLength(2));
    state.tree.toggle("/workspace/src/deep");
    await vi.waitFor(() => expect(state.tree.rows()).toHaveLength(3));
    state.tree.toggle("/workspace/src");
    vi.mocked(listDirectory).mockClear();
    state.refresh();
    expect(listDirectory).not.toHaveBeenCalled();
    let resolveParent: ((value: DirectoryPage) => void) | undefined;
    vi.mocked(listDirectory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveParent = resolve;
          }),
      )
      .mockResolvedValueOnce(page("/workspace/src/deep", []));
    state.tree.toggle("/workspace/src");
    expect(listDirectory).toHaveBeenCalledTimes(1);
    resolveParent?.(page("/workspace/src", [entry("/workspace/src/deep")]));
    await vi.waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(2));
    expect(listDirectory).toHaveBeenLastCalledWith(
      "/workspace/src/deep",
      { field: "name", direction: "asc" },
      "",
      false,
      0,
      200,
    );
  });

  it.each(["query", "sort", "ignore"])(
    "rejects incompatible %s seeds",
    async (reason) => {
      const state = setup(
        reason === "query" ? { ...seed(), query: "note" } : seed(),
      );
      if (reason === "sort")
        state.setSort({ field: "mtime", direction: "asc" });
      if (reason === "ignore") state.setHide(true);
      vi.mocked(listDirectory).mockResolvedValue(page("/workspace", []));
      state.setEnabled(true);
      await vi.waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(1));
      expect(vi.mocked(listDirectory).mock.calls[0]?.[0]).toBe("/workspace");
    },
  );
});
