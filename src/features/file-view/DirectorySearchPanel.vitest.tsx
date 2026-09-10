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
  const onReveal = vi.fn();
  const onPreview = vi.fn();
  dispose = render(
    () => (
      <DirectorySearchPanel
        root={root()}
        kind={kind()}
        hideGitIgnored={hide()}
        onClose={onClose}
        onOpen={onOpen}
        onReveal={onReveal}
        onPreview={onPreview}
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
  return {
    input,
    type,
    submit,
    setRoot,
    setKind,
    setHide,
    onClose,
    onOpen,
    onReveal,
    onPreview,
  };
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

  it.each(["Enter", "Ctrl+M"])(
    "focuses the first result on %s and reuses current results",
    async (shortcut) => {
      vi.mocked(searchDirectory).mockResolvedValue(result);
      const panel = setup();
      await Promise.resolve();
      panel.type("literal");
      const submit = () =>
        panel.input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: shortcut === "Enter" ? "Enter" : "m",
            ctrlKey: shortcut === "Ctrl+M",
            bubbles: true,
            cancelable: true,
          }),
        );
      submit();
      await vi.waitFor(() =>
        expect(document.activeElement?.className).toBe(
          "directory-search__result",
        ),
      );
      expect(panel.onPreview).toHaveBeenCalledWith(result.matches[0]?.entry);
      expect(panel.onOpen).not.toHaveBeenCalled();
      panel.input.focus();
      submit();
      expect(document.activeElement?.className).toBe(
        "directory-search__result",
      );
      expect(searchDirectory).toHaveBeenCalledTimes(1);
      expect(panel.input.value).toBe("literal");
    },
  );

  it("allows a new query while an invalidated request is pending", async () => {
    let finishOld: ((value: DirectorySearchResult) => void) | undefined;
    vi.mocked(searchDirectory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...result, matches: [] });
    const panel = setup();
    panel.type("old");
    panel.submit();
    panel.type("new");
    panel.submit();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("No matches found"),
    );
    finishOld?.(result);
    await Promise.resolve();
    expect(document.querySelector(".directory-search__result")).toBeNull();
    expect(document.activeElement).toBe(panel.input);
    expect(panel.input.value).toBe("new");
    expect(searchDirectory).toHaveBeenCalledTimes(2);
  });

  it.each(["name", "content"] as const)(
    "navigates %s results with j/k and previews on focus and reveals with l, Shift+Enter or the jump button",
    async (kind) => {
      const first = result.matches[0];
      if (first === undefined) throw new Error("Missing fixture");
      vi.mocked(searchDirectory).mockResolvedValue({
        ...result,
        matches: [
          first,
          {
            ...first,
            relative_path: "sub/second.txt",
            entry: {
              ...first.entry,
              path: "/workspace/sub/second.txt",
              name: "second.txt",
            },
          },
        ],
      });
      const panel = setup();
      panel.setKind(kind);
      panel.type("file");
      panel.submit();
      await vi.waitFor(() =>
        expect(
          document.querySelectorAll(".directory-search__result"),
        ).toHaveLength(2),
      );
      const key = (
        target: Element,
        key: string,
        options: KeyboardEventInit = {},
      ) => {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...options,
        });
        target.dispatchEvent(event);
        return event;
      };
      panel.input.focus();
      expect(key(panel.input, "j").defaultPrevented).toBe(false);
      expect(key(panel.input, "k").defaultPrevented).toBe(false);
      expect(key(panel.input, "l").defaultPrevented).toBe(false);
      expect(panel.onPreview).toHaveBeenCalledWith(first.entry);
      expect(panel.onReveal).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(panel.input);
      key(panel.input, "ArrowDown");
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        ".directory-search__result",
      );
      const firstButton = buttons.item(0);
      const secondButton = buttons.item(1);
      expect(document.activeElement).toBe(firstButton);
      expect(panel.onPreview).toHaveBeenLastCalledWith(first.entry);
      for (const options of [
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true },
        { shiftKey: true },
        { isComposing: true },
      ]) {
        expect(key(firstButton, "j", options).defaultPrevented).toBe(false);
        expect(key(firstButton, "l", options).defaultPrevented).toBe(false);
        expect(panel.onReveal).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(firstButton);
      }
      key(firstButton, "j");
      expect(document.activeElement).toBe(secondButton);
      expect(secondButton.getAttribute("aria-current")).toBe("true");
      expect(panel.onPreview).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: "/workspace/sub/second.txt" }),
      );
      expect(panel.onReveal).not.toHaveBeenCalled();
      key(secondButton, "j");
      expect(document.activeElement).toBe(secondButton);
      key(secondButton, "k");
      expect(document.activeElement).toBe(firstButton);
      key(firstButton, "k");
      expect(document.activeElement).toBe(firstButton);
      expect(panel.onPreview).toHaveBeenLastCalledWith(first.entry);
      key(firstButton, "l");
      expect(panel.onReveal).toHaveBeenCalledExactlyOnceWith(first.entry);
      key(firstButton, "Enter", { shiftKey: true });
      expect(panel.onReveal).toHaveBeenCalledTimes(2);
      expect(panel.onOpen).not.toHaveBeenCalled();
      const jump = document.querySelector<HTMLButtonElement>(
        ".directory-search__jump",
      );
      expect(jump?.parentElement).toBe(firstButton.parentElement);
      jump?.focus();
      expect(panel.onPreview).toHaveBeenLastCalledWith(first.entry);
      jump?.click();
      expect(panel.onReveal).toHaveBeenCalledTimes(3);
      key(firstButton, "Enter");
      expect(panel.onOpen).toHaveBeenCalledExactlyOnceWith(first.entry);
      firstButton.click();
      expect(panel.onOpen).toHaveBeenCalledTimes(2);
    },
  );

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
