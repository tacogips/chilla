import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchDirectory,
  type DirectorySearchKind,
  type DirectorySearchResult,
} from "../../lib/tauri/directory-search";
import { DirectorySearchPanel } from "./DirectorySearchPanel";
vi.mock("../../lib/tauri/directory-search", () => ({
  searchDirectory: vi.fn(),
}));
const result: DirectorySearchResult = {
  root_path: "/workspace",
  matches: [
    {
      entry: {
        path: "/workspace/sub/file.txt",
        canonical_path: "/workspace/sub/file.txt",
        name: "file.txt",
        directory_hint: "",
        is_directory: false,
        is_symlink: false,
        size_bytes: 20,
        modified_at_unix_ms: 0,
      },
      relative_path: "sub/file.txt",
      line_number: 4,
      line_text: "<script>literal</script>",
    },
  ],
  truncated: true,
  skipped_count: 3,
  scanned_files: 10,
};
let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
  vi.resetAllMocks();
});
function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const [root, setRoot] = createSignal("/workspace");
  const [kind, setKind] = createSignal<DirectorySearchKind>("content");
  const [hide, setHide] = createSignal(false);
  const onClose = vi.fn();
  const onOpen = vi.fn();
  dispose = render(
    () => (
      <DirectorySearchPanel
        root={root()}
        kind={kind()}
        hideGitIgnored={hide()}
        onClose={onClose}
        onOpen={onOpen}
      />
    ),
    container,
  );
  const input = document.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("Missing search query");
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  const submit = () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  return { input, type, submit, setRoot, setKind, setHide, onClose, onOpen };
}
describe("DirectorySearchPanel", () => {
  it("submits only nonempty explicit queries, blocks duplicate pending submits, and opens escaped results", async () => {
    let complete: ((value: DirectorySearchResult) => void) | undefined;
    vi.mocked(searchDirectory).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const panel = setup();
    panel.submit();
    panel.type(" literal ");
    expect(searchDirectory).not.toHaveBeenCalled();
    panel.submit();
    panel.submit();
    expect(searchDirectory).toHaveBeenCalledTimes(1);
    expect(searchDirectory).toHaveBeenCalledWith({
      path: "/workspace",
      query: " literal ",
      kind: "content",
      hideGitIgnored: false,
    });
    expect(document.body.textContent).toContain("Searching...");
    complete?.(result);
    await vi.waitFor(() =>
      expect(
        document.querySelector(".directory-search__result"),
      ).not.toBeNull(),
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.textContent).toContain("<script>literal</script>");
    expect(document.body.textContent).toContain("Partial results");
    expect(document.body.textContent).toContain("3 entries skipped");
    panel.input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "sub/file.txt, line 4",
    );
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(panel.onOpen).toHaveBeenCalledWith(result.matches[0]?.entry);
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panel.onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["query", "root", "kind", "ignore", "close"])(
    "discards pending results after %s changes",
    async (change) => {
      let complete: ((value: DirectorySearchResult) => void) | undefined;
      vi.mocked(searchDirectory).mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const panel = setup();
      panel.type("old");
      panel.submit();
      if (change === "query") panel.type("new");
      if (change === "root") panel.setRoot("/other");
      if (change === "kind") panel.setKind("name");
      if (change === "ignore") panel.setHide(true);
      if (change === "close") {
        dispose?.();
        dispose = undefined;
      }
      complete?.(result);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelector(".directory-search__result")).toBeNull();
      expect(searchDirectory).toHaveBeenCalledTimes(1);
    },
  );

  it("reports errors and empty results, and retries the current query", async () => {
    vi.mocked(searchDirectory)
      .mockRejectedValueOnce(new Error("Unreadable root"))
      .mockResolvedValueOnce({
        ...result,
        matches: [],
        truncated: false,
        skipped_count: 0,
      });
    const panel = setup();
    panel.setKind("name");
    panel.type("file");
    panel.submit();
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "Unreadable root",
      ),
    );
    panel.submit();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("No matches found"),
    );
    expect(searchDirectory).toHaveBeenLastCalledWith({
      path: "/workspace",
      query: "file",
      kind: "name",
      hideGitIgnored: false,
    });
  });
});
