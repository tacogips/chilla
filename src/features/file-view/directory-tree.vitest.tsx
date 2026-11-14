import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listDirectory,
  type DirectoryEntry,
  type DirectoryPage,
} from "../../lib/tauri/document";
import { FileBrowserPane } from "./FileBrowserPane";
import { searchDirectory } from "../../lib/tauri/directory-search";

vi.mock("../../lib/tauri/document", () => ({ listDirectory: vi.fn() }));
vi.mock("../../lib/tauri/directory-search", () => ({
  searchDirectory: vi.fn(),
}));

const entry = (path: string, directory = false): DirectoryEntry => ({
  path,
  canonical_path: path,
  name: path.split("/").pop() ?? path,
  directory_hint: "",
  is_directory: directory,
  is_symlink: false,
  size_bytes: 0,
  modified_at_unix_ms: 0,
});
const page = (
  path: string,
  entries: readonly DirectoryEntry[],
  more = false,
): DirectoryPage => ({
  current_directory_path: path,
  parent_directory_path: "/",
  entries,
  total_entry_count: entries.length,
  offset: 0,
  limit: 200,
  has_more: more,
});
let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
  vi.resetAllMocks();
  vi.useRealTimers();
});

function setup(listingKind: "directory" | "explicit_file_set" = "directory") {
  const root = document.createElement("div");
  document.body.append(root);
  const [path, setPath] = createSignal("/workspace");
  const [selected, setSelected] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const [rootEntries, setRootEntries] = createSignal([
    entry("/workspace/src", true),
  ]);
  const confirm = vi.fn();
  const onSort = vi.fn();
  dispose = render(
    () => (
      <FileBrowserPane
        active
        listingKind={listingKind}
        directory={{
          current_directory_path: path(),
          parent_directory_path: "/",
          entries: rootEntries(),
          total_entry_count: 1,
        }}
        sort={{ field: "name", direction: "asc" }}
        query={query()}
        hideGitIgnored={true}
        selectedPath={selected()}
        canLoadMore={false}
        isLoadingMore={false}
        onChangeQuery={setQuery}
        onChangeSort={onSort}
        onLoadMore={() => {}}
        onSelectEntry={(entry) => setSelected(entry.path)}
        onConfirmEntry={confirm}
        onNavigateToParent={() => {}}
        onToggleGitIgnored={() => {}}
      />
    ),
    root,
  );
  return {
    setPath,
    setQuery,
    confirm,
    onSort,
    selected,
    clearEntries: () => setRootEntries([]),
    refresh: () => setRootEntries([entry("/workspace/src", true)]),
  };
}
const button = (label: string): HTMLButtonElement => {
  const result = Array.from(document.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label,
  );
  if (result === undefined) throw new Error(`Missing button ${label}`);
  return result;
};

describe("directory Tree view", () => {
  it("shows persistent next-key help and handles every comma sort direction", () => {
    vi.useFakeTimers();
    const state = setup();
    const row = button("src");
    row.focus();
    const press = (key: string, init: KeyboardEventInit = {}) =>
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    press(",");
    expect(
      document.querySelector('[aria-label="Sort shortcuts"]'),
    ).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll(".file-browser__sequence-key")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["a", "A", "e", "E", "m", "M", "s", "S", "0"]);
    vi.advanceTimersByTime(10_000);
    expect(
      document.querySelector('[aria-label="Sort shortcuts"]'),
    ).not.toBeNull();
    expect(document.activeElement).toBe(row);
    press("Escape");
    for (const [key, field] of [
      ["a", "name"],
      ["e", "extension"],
      ["m", "mtime"],
      ["s", "size"],
    ] as const) {
      press(",");
      press(key);
      expect(state.onSort).toHaveBeenLastCalledWith({
        field,
        direction: "asc",
      });
      press(",");
      press("Shift", { shiftKey: true });
      press(key.toUpperCase(), { shiftKey: true });
      expect(state.onSort).toHaveBeenLastCalledWith({
        field,
        direction: "desc",
      });
      expect(
        document.querySelector('[aria-label="Sort shortcuts"]'),
      ).toBeNull();
    }
    press(",");
    press("0");
    expect(state.onSort).toHaveBeenLastCalledWith({
      field: "name",
      direction: "asc",
    });
    expect(document.querySelector(".directory-search")).toBeNull();
  });

  it("consumes invalid continuations, cancels on focus/root/mode/editing, and guards modified keys", () => {
    const state = setup();
    const row = button("src");
    row.focus();
    const press = (key: string, init: KeyboardEventInit = {}) =>
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    const bubbled = vi.fn();
    window.addEventListener("keydown", bubbled);
    for (const key of ["1", "?", "q", "Escape"]) {
      press(",");
      press(key);
      expect(
        document.querySelector('[aria-label="Sort shortcuts"]'),
      ).toBeNull();
    }
    expect(bubbled).not.toHaveBeenCalled();
    window.removeEventListener("keydown", bubbled);
    press(",");
    window.dispatchEvent(new Event("blur"));
    expect(document.querySelector('[aria-label="Sort shortcuts"]')).toBeNull();
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
      { repeat: true },
    ]) {
      press(",", modifiers);
      expect(
        document.querySelector('[aria-label="Sort shortcuts"]'),
      ).toBeNull();
    }
    press(",");
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    expect(document.querySelector('[aria-label="Sort shortcuts"]')).toBeNull();
    outside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", bubbles: true }),
    );
    expect(document.querySelector(".directory-search")).toBeNull();
    row.focus();
    press(",");
    state.setPath("/other");
    expect(document.querySelector('[aria-label="Sort shortcuts"]')).toBeNull();
    press(",");
    button("Tree").click();
    expect(document.querySelector('[aria-label="Sort shortcuts"]')).toBeNull();
    expect(state.onSort).not.toHaveBeenCalled();
  });

  it("opens filename/content search with s/S and filter with f", () => {
    setup();
    const row = button("src");
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", bubbles: true }),
    );
    expect(
      document.querySelector('[aria-label="Find files query"]'),
    ).not.toBeNull();
    button("Close directory search").click();
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "S", shiftKey: true, bubbles: true }),
    );
    expect(
      document.querySelector('[aria-label="Search file contents query"]'),
    ).not.toBeNull();
    button("Close directory search").click();
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", bubbles: true }),
    );
    expect(
      document.querySelector('[aria-label="Filter files"]'),
    ).not.toBeNull();
  });
  it("opens recursive search without scanning, isolates keys, and restores the cached tree on close", async () => {
    vi.mocked(listDirectory).mockResolvedValue(
      page("/workspace", [entry("/workspace/src", true)]),
    );
    const state = setup();
    button("Tree").click();
    await vi.waitFor(() => expect(button("src")).toBeDefined());
    const requestCount = vi.mocked(listDirectory).mock.calls.length;
    button("Search file contents").click();
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("class")).toBe(
        "directory-search__input",
      ),
    );
    expect(searchDirectory).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLElement>(".file-browser__entries")?.style
        .display,
    ).toBe("none");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(state.selected()).toBeNull();
    const input = document.querySelector<HTMLInputElement>(
      ".directory-search__input",
    );
    if (input === null) throw new Error("missing recursive query");
    input.value = "keep query";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    button("Search file contents").click();
    await Promise.resolve();
    expect(input.value).toBe("keep query");
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button("Search file contents")),
    );
    expect(document.querySelector(".directory-search")).toBeNull();
    expect(button("Tree").getAttribute("aria-pressed")).toBe("true");
    expect(listDirectory).toHaveBeenCalledTimes(requestCount);
    button("Find files").click();
    button("Show filter").click();
    expect(document.querySelector(".directory-search")).toBeNull();
    expect(document.querySelector('[role="searchbox"]')).not.toBeNull();
    button("Find files").click();
    button("List").click();
    expect(document.querySelector(".directory-search")).toBeNull();
  });
  it("keeps controls compact and reveals, focuses, clears and hides the filter", async () => {
    const state = setup();
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
    expect(button("List").textContent?.trim()).toBe("");
    expect(button("Tree").querySelector("svg")).not.toBeNull();
    expect(document.querySelector(".file-browser__filter-label")).toBeNull();
    expect(
      button("Show filter").closest(".file-browser__toolbar-actions"),
    ).not.toBeNull();
    expect(
      document
        .querySelector(".file-browser__git-ignored-toggle")
        ?.closest(".file-browser__toolbar-actions"),
    ).not.toBeNull();
    button("Show filter").click();
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("role")).toBe("searchbox"),
    );
    state.setQuery("src");
    button("Show filter").click();
    await Promise.resolve();
    const filter =
      document.querySelector<HTMLInputElement>('[role="searchbox"]');
    expect(filter?.value).toBe("src");
    expect(filter?.selectionStart).toBe(0);
    expect(filter?.selectionEnd).toBe(3);
    filter?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await vi.waitFor(() => {
      expect(document.querySelector('[role="searchbox"]')).toBeNull();
      expect(document.activeElement?.getAttribute("data-path")).toBe(
        "/workspace/src",
      );
    });
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { isComposing: true },
      { repeat: true },
    ]) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "/", ...modifier }),
      );
      expect(document.querySelector('[role="searchbox"]')).toBeNull();
    }
    const editable = document.createElement("textarea");
    document.body.append(editable);
    editable.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
    button("Tree").dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("role")).toBe("searchbox"),
    );
  });

  it("shows externally active queries and gives explicit selections a filter-only toolbar", () => {
    const state = setup("explicit_file_set");
    expect(
      document.querySelector('[aria-label="Search file contents"]'),
    ).toBeNull();
    expect(document.querySelector('[aria-label="Find files"]')).toBeNull();
    expect(document.querySelector(".file-browser__view-toggle")).toBeNull();
    expect(
      document.querySelector(".file-browser__git-ignored-toggle"),
    ).toBeNull();
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
    state.setQuery("src");
    expect(
      document.querySelector<HTMLInputElement>('[role="searchbox"]')?.value,
    ).toBe("src");
    expect(button("Show filter").getAttribute("aria-expanded")).toBe("true");
  });

  it("restores the filter icon when Escape closes an empty listing filter", async () => {
    const state = setup();
    state.clearEntries();
    button("Show filter").click();
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("role")).toBe("searchbox"),
    );
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button("Show filter")),
    );
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
  });

  it("toggles with plain t, including focused mode controls, and ignores typing and modified keys", async () => {
    vi.mocked(listDirectory).mockResolvedValue(
      page("/workspace", [entry("/workspace/src", true)]),
    );
    setup();
    const shortcut = (init: KeyboardEventInit = {}) =>
      new KeyboardEvent("keydown", {
        key: "t",
        bubbles: true,
        cancelable: true,
        ...init,
      });
    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { key: "T", shiftKey: true },
      { repeat: true },
      { isComposing: true },
    ]) {
      window.dispatchEvent(shortcut(modifiers));
      expect(button("List").getAttribute("aria-pressed")).toBe("true");
    }
    button("Show filter").click();
    document.querySelector("input")?.dispatchEvent(shortcut());
    expect(button("List").getAttribute("aria-pressed")).toBe("true");
    button("Tree").dispatchEvent(shortcut());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="treeitem"]')).not.toBeNull(),
    );
    expect(button("Tree").getAttribute("aria-pressed")).toBe("true");
    expect(button("Tree").title).toBe("Tree view (t toggles)");
    button("src").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    window.dispatchEvent(shortcut());
    expect(button("Tree").getAttribute("aria-pressed")).toBe("true");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(shortcut());
    expect(button("List").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not enable Tree for an explicit file selection", () => {
    setup("explicit_file_set");
    const event = new KeyboardEvent("keydown", { key: "t", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('[role="tree"]')).toBeNull();
    expect(listDirectory).not.toHaveBeenCalled();
  });

  it("refreshes an unchanged root and expanded branches while ignoring superseded requests", async () => {
    let resolveOld: ((page: DirectoryPage) => void) | undefined;
    vi.mocked(listDirectory)
      .mockResolvedValueOnce(
        page("/workspace", [entry("/workspace/src", true)]),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(
        page("/workspace", [entry("/workspace/src", true)]),
      )
      .mockResolvedValueOnce(
        page("/workspace/src", [entry("/workspace/src/new.md")]),
      );
    const state = setup();
    button("Tree").click();
    await vi.waitFor(() => expect(button("src")).toBeDefined());
    button("src").click();
    await vi.waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(2));
    state.refresh();
    await vi.waitFor(() => expect(button("new.md")).toBeDefined());
    resolveOld?.(page("/workspace/src", [entry("/workspace/src/old.md")]));
    await Promise.resolve();
    expect(
      document.querySelector('[data-path="/workspace/src/old.md"]'),
    ).toBeNull();
    expect(button("src").getAttribute("aria-expanded")).toBe("true");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    button("List").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(state.confirm).not.toHaveBeenCalled();
  });
  it("defaults to List and expands nested files without changing the root, with visible-row keyboard selection", async () => {
    vi.mocked(listDirectory).mockImplementation(async (path) =>
      page(
        path,
        path === "/workspace"
          ? [entry("/workspace/src", true)]
          : [entry("/workspace/src/note.md")],
      ),
    );
    const state = setup();
    expect(listDirectory).not.toHaveBeenCalled();
    button("Tree").click();
    await vi.waitFor(() => expect(button("src")).toBeDefined());
    button("src").click();
    await vi.waitFor(() => expect(button("note.md")).toBeDefined());
    expect(document.querySelector(".file-browser__path")?.textContent).toBe(
      "/workspace",
    );
    expect(state.confirm).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(state.selected()).toBe("/workspace/src/note.md");
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("data-path")).toBe(
        "/workspace/src/note.md",
      ),
    );
    button("note.md").click();
    expect(state.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/workspace/src/note.md" }),
      expect.anything(),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(state.selected()).toBe("/workspace/src");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(
      document.querySelector('[data-path="/workspace/src/note.md"]'),
    ).toBeNull();
    expect(listDirectory).toHaveBeenCalledWith(
      "/workspace/src",
      { field: "name", direction: "asc" },
      "",
      true,
      0,
      200,
    );
  });

  it("keeps folders through filtering, supports retry and paginated children", async () => {
    vi.mocked(listDirectory)
      .mockResolvedValueOnce(
        page("/workspace", [entry("/workspace/src", true)]),
      )
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(
        page("/workspace/src", [entry("/workspace/src/other.txt")], true),
      )
      .mockResolvedValueOnce(
        page("/workspace/src", [entry("/workspace/src/note.md")]),
      );
    const state = setup();
    button("Tree").click();
    await vi.waitFor(() => expect(button("src")).toBeDefined());
    state.setQuery("note");
    button("src").click();
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "Permission denied",
      ),
    );
    button("Retry: src").click();
    await vi.waitFor(() => expect(button("Load more: src")).toBeDefined());
    button("Load more: src").click();
    await vi.waitFor(() => expect(button("note.md")).toBeDefined());
    expect(
      document.querySelector('[data-path="/workspace/src/other.txt"]'),
    ).toBeNull();
    expect(listDirectory).toHaveBeenLastCalledWith(
      "/workspace/src",
      { field: "name", direction: "asc" },
      "",
      true,
      1,
      200,
    );
  });

  it("ignores responses from an old root", async () => {
    let resolveOld: ((page: DirectoryPage) => void) | undefined;
    vi.mocked(listDirectory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(page("/new", [entry("/new/new.md")]));
    const state = setup();
    button("Tree").click();
    await vi.waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(1));
    state.setPath("/new");
    await vi.waitFor(() => expect(button("new.md")).toBeDefined());
    resolveOld?.(page("/workspace", [entry("/workspace/old.md")]));
    await Promise.resolve();
    expect(
      document.querySelector('[data-path="/workspace/old.md"]'),
    ).toBeNull();
  });
});
