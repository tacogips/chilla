import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type {
  DirectoryPage,
  DocumentSnapshot,
  FilePreview,
  StartupContext,
} from "../../lib/tauri/document";

const documentMocks = vi.hoisted(() => ({
  getStartupContext: vi.fn(),
  getKeymapConfig: vi.fn(),
  loadGitDiff: vi.fn(),
  loadPrDiff: vi.fn(),
  listDirectory: vi.fn(),
  searchDirectory: vi.fn(),
  listExplicitFileSet: vi.fn(),
  openDocument: vi.fn(),
  openFilePreview: vi.fn(),
  reloadDocument: vi.fn(),
  saveDocument: vi.fn(),
  listenDocumentRefreshed: vi.fn(),
  stopDocumentWatch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  async invoke() {
    return undefined;
  },
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));
vi.mock("../../lib/tauri/directory-search", () => ({
  searchDirectory: documentMocks.searchDirectory,
}));

vi.mock("../../lib/tauri/keymap", () => ({
  getKeymapConfig: documentMocks.getKeymapConfig,
}));

vi.mock("@tauri-apps/api/event", () => ({
  async listen() {
    return () => {};
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  async dirname(path: string) {
    return path.slice(0, path.lastIndexOf("/"));
  },
  async join(...paths: readonly string[]) {
    return paths.join("/").replace(/\/{2,}/g, "/");
  },
  async normalize(path: string) {
    return path.replace(/\\/g, "/");
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow() {
    return {
      close: vi.fn().mockResolvedValue(undefined),
      minimize: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  async openPath() {
    return undefined;
  },
  async openUrl() {
    return undefined;
  },
}));

vi.mock("../../lib/tauri/document", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/tauri/document")>();

  return {
    ...actual,
    getStartupContext: documentMocks.getStartupContext,
    loadGitDiff: documentMocks.loadGitDiff,
    loadPrDiff: documentMocks.loadPrDiff,
    listDirectory: documentMocks.listDirectory,
    listExplicitFileSet: documentMocks.listExplicitFileSet,
    openDocument: documentMocks.openDocument,
    openFilePreview: documentMocks.openFilePreview,
    reloadDocument: documentMocks.reloadDocument,
    saveDocument: documentMocks.saveDocument,
    listenDocumentRefreshed: documentMocks.listenDocumentRefreshed,
    stopDocumentWatch: documentMocks.stopDocumentWatch,
  };
});

import { WorkspaceShell } from "./WorkspaceShell";

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function renderWorkspace(): VoidFunction {
  const root = document.getElementById("root");
  if (root === null) {
    throw new Error("missing test root");
  }

  return render(() => <WorkspaceShell />, root);
}

function directoryStartupContext(
  selectedFilePath: string | null,
): StartupContext {
  return {
    initial_mode: "file_view",
    browser_root: {
      kind: "directory",
      current_directory_path: "/workspace",
      selected_file_path: selectedFilePath,
    },
  };
}

function explicitFileSetStartupContext(): StartupContext {
  return {
    initial_mode: "file_view",
    browser_root: {
      kind: "explicit_file_set",
      file_count: 2,
      selected_file_path: "/workspace/data.csv",
      source_order_paths: ["/workspace/data.csv", "/workspace/other.csv"],
    },
  };
}

function directoryPage(filePath: string): DirectoryPage {
  const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
  return {
    current_directory_path: "/workspace",
    parent_directory_path: "/",
    entries: [
      {
        path: filePath,
        canonical_path: filePath,
        name: fileName,
        directory_hint: "",
        is_directory: false,
        is_symlink: false,
        size_bytes: 24,
        modified_at_unix_ms: 0,
      },
    ],
    total_entry_count: 1,
    offset: 0,
    limit: 200,
    has_more: false,
  };
}

function directoryPageWithPaths(filePaths: readonly string[]): DirectoryPage {
  return {
    current_directory_path: "/workspace",
    parent_directory_path: "/",
    entries: filePaths.map((filePath) => ({
      path: filePath,
      canonical_path: filePath,
      name: filePath.slice(filePath.lastIndexOf("/") + 1),
      directory_hint: "",
      is_directory: false,
      is_symlink: false,
      size_bytes: 24,
      modified_at_unix_ms: 0,
    })),
    total_entry_count: filePaths.length,
    offset: 0,
    limit: 200,
    has_more: false,
  };
}

function emptyDirectoryPage(): DirectoryPage {
  return {
    current_directory_path: "/workspace",
    parent_directory_path: "/",
    entries: [],
    total_entry_count: 0,
    offset: 0,
    limit: 200,
    has_more: false,
  };
}

function markdownSnapshot(): DocumentSnapshot {
  return {
    path: "/workspace/note.md",
    file_name: "note.md",
    source_text: "# Note\n\nBody",
    source_html:
      '<section class="file-preview file-preview--text"><pre># Note</pre></section>',
    html: '<h1 id="note">Note</h1><p>Body</p>',
    headings: [
      {
        level: 1,
        title: "Note",
        anchor_id: "note",
        line_start: 1,
        children: [],
      },
    ],
    revision_token: "rev-1",
    last_modified: "2026-06-04T00:00:00Z",
  };
}

function csvPreview(
  overrides: Partial<Extract<FilePreview, { kind: "csv" }>> = {},
): Extract<FilePreview, { kind: "csv" }> {
  return {
    kind: "csv",
    path: "/workspace/data.csv",
    file_name: "data.csv",
    mime_type: "text/csv",
    raw_html:
      '<section class="file-preview file-preview--text"><pre>name,count</pre></section>',
    rows: [["name", "count"]],
    column_count: 2,
    displayed_row_count: 1,
    total_row_count: 1,
    row_count_status: "complete",
    truncated: false,
    formatted_available: true,
    parse_error: null,
    size_bytes: 24,
    last_modified: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

function textPreview(): Extract<FilePreview, { kind: "text" }> {
  return {
    kind: "text",
    path: "/workspace/keep.txt",
    file_name: "keep.txt",
    mime_type: "text/plain",
    file_type: "Plain text",
    html: '<section class="file-preview"><pre>keep</pre></section>',
    size_bytes: 4,
    last_modified: "2026-08-17T00:00:00Z",
  };
}

function modeButton(ariaLabel: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${ariaLabel}"]`,
  );

  if (button === null) {
    throw new Error(`missing button ${ariaLabel}`);
  }

  return button;
}

function expectActiveMode(ariaLabel: string): void {
  expect(
    modeButton(ariaLabel).classList.contains("workspace__mode--active"),
  ).toBe(true);
}

describe("WorkspaceShell numeric view shortcuts", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    documentMocks.getStartupContext.mockReset();
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: null,
      config: {},
      error: null,
    });
    documentMocks.listDirectory.mockReset();
    documentMocks.searchDirectory.mockReset();
    documentMocks.listExplicitFileSet.mockReset();
    documentMocks.openDocument.mockReset();
    documentMocks.openFilePreview.mockReset();
    documentMocks.reloadDocument.mockReset();
    documentMocks.listenDocumentRefreshed.mockReset();
    documentMocks.stopDocumentWatch.mockReset();
    documentMocks.listenDocumentRefreshed.mockResolvedValue(() => {});
    documentMocks.stopDocumentWatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("stacks workspace errors and keymap warnings outside panes with native dismiss controls", async () => {
    documentMocks.getStartupContext.mockRejectedValue(
      new Error("This directory is not inside a Git repository."),
    );
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: null,
      config: {},
      error: "Invalid keymap configuration",
    });
    dispose = renderWorkspace();
    await waitFor(() =>
      expect(
        document.querySelectorAll(
          "#workspace-notifications .workspace-notification",
        ),
      ).toHaveLength(2),
    );
    expect(document.querySelector(".pane .workspace-notification")).toBeNull();
    const close = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close notification"]',
    );
    close?.focus();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    close?.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    close?.click();
    expect(document.querySelectorAll(".workspace-notification")).toHaveLength(
      1,
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close notification"]')
      ?.click();
    expect(document.querySelectorAll(".workspace-notification")).toHaveLength(
      0,
    );
  });

  it("mounts diff failures into the same workspace stack as keymap warnings", async () => {
    documentMocks.getStartupContext.mockResolvedValue({
      initial_mode: "file_view",
      browser_root: {
        kind: "git_diff",
        target: { repo_path: "/workspace", source: { kind: "worktree" } },
      },
    });
    documentMocks.loadGitDiff.mockRejectedValue(
      new Error("Diff could not load"),
    );
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: null,
      config: {},
      error: "Invalid keymap configuration",
    });
    dispose = renderWorkspace();
    await waitFor(() =>
      expect(
        document.querySelectorAll(
          "#workspace-notifications .workspace-notification",
        ),
      ).toHaveLength(2),
    );
    expect(document.querySelectorAll(".workspace-notifications")).toHaveLength(
      1,
    );
    expect(
      document.querySelector("#workspace-notifications")?.textContent,
    ).toContain("Diff could not load");
    expect(document.querySelector(".pr-diff-retry button")).not.toBeNull();
  });

  it.each(["git_diff", "github_pr"] as const)(
    "routes header and r refresh to %s even after failure",
    async (kind) => {
      const target =
        kind === "git_diff"
          ? { repo_path: "/workspace", source: { kind: "worktree" } }
          : {
              owner: "example",
              repo: "project",
              source: { kind: "pull_request", number: 1 },
              url: "https://github.com/example/project/pull/1",
              use_cache: true,
            };
      const loader =
        kind === "git_diff"
          ? documentMocks.loadGitDiff
          : documentMocks.loadPrDiff;
      loader.mockReset();
      loader.mockRejectedValue(new Error("Try reloading"));
      documentMocks.getStartupContext.mockResolvedValue({
        initial_mode: "file_view",
        browser_root: { kind, target },
      });
      dispose = renderWorkspace();
      const button = await waitForElement<HTMLButtonElement>(
        '[aria-label="Refresh workspace"]',
      );
      await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      expect(button.disabled).toBe(false);
      button.click();
      await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "r", bubbles: true }),
      );
      await waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
      expect(loader).toHaveBeenLastCalledWith(
        kind === "github_pr" ? { ...target, use_cache: false } : target,
      );
    },
  );

  it.each(["directory", "git_diff", "github_pr"] as const)(
    "collapses and expands the %s left pane through the header and Shift+L",
    async (kind) => {
      if (kind === "directory") {
        documentMocks.getStartupContext.mockResolvedValue(
          directoryStartupContext(null),
        );
        documentMocks.listDirectory.mockResolvedValue(emptyDirectoryPage());
      } else {
        const target =
          kind === "git_diff"
            ? { repo_path: "/workspace", source: { kind: "worktree" } }
            : {
                owner: "example",
                repo: "project",
                source: { kind: "pull_request", number: 1 },
                url: "https://github.com/example/project/pull/1",
                use_cache: true,
              };
        documentMocks.getStartupContext.mockResolvedValue({
          initial_mode: "file_view",
          browser_root: { kind, target },
        });
        const loader =
          kind === "git_diff"
            ? documentMocks.loadGitDiff
            : documentMocks.loadPrDiff;
        loader.mockReset();
        loader.mockRejectedValue(new Error("Diff unavailable"));
      }
      dispose = renderWorkspace();
      const selector = kind === "directory" ? ".file-browser" : ".pr-browser";
      await waitForElement<HTMLElement>(selector);
      const diffPane = document.querySelector(".pr-diff-pane");
      const button = modeButton("Collapse left pane");
      expect(button.title).toBe("Collapse left pane (Shift+L)");
      expect(button.getAttribute("aria-expanded")).toBe("true");
      const expectVisibility = (visible: boolean): void => {
        const pane = document.querySelector<HTMLElement>(selector);
        expect(pane !== null && !pane.hidden).toBe(visible);
        expect(button.getAttribute("aria-expanded")).toBe(String(visible));
        expect(button.getAttribute("aria-label")).toBe(
          visible ? "Collapse left pane" : "Expand left pane",
        );
        if (kind !== "directory") {
          expect(document.querySelector(".pr-diff-pane")).toBe(diffPane);
          expect(
            document
              .querySelector(".pr-workspace")
              ?.classList.contains("pr-workspace--no-browser"),
          ).toBe(!visible);
        }
      };
      button.click();
      expectVisibility(false);
      await waitFor(() =>
        expect(document.activeElement).toBe(
          document.querySelector(
            kind === "directory"
              ? ".workspace__document-column"
              : ".pr-diff-pane",
          ),
        ),
      );
      button.click();
      expectVisibility(true);
      await waitFor(() =>
        expect(
          document.querySelector(selector)?.contains(document.activeElement),
        ).toBe(true),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "L",
          shiftKey: true,
          bubbles: true,
        }),
      );
      expectVisibility(false);
      button.click();
      expectVisibility(true);
      if (kind !== "directory") {
        expect(
          kind === "git_diff"
            ? documentMocks.loadGitDiff
            : documentMocks.loadPrDiff,
        ).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(["single", "set"] as const)(
    "starts explicit %s files folded with preview focus and restores browser navigation",
    async (kind) => {
      documentMocks.getStartupContext.mockResolvedValue(
        kind === "single"
          ? directoryStartupContext("/workspace/data.csv")
          : explicitFileSetStartupContext(),
      );
      const page = directoryPageWithPaths([
        "/workspace/data.csv",
        "/workspace/other.csv",
      ]);
      documentMocks.listDirectory.mockResolvedValue(page);
      documentMocks.listExplicitFileSet.mockResolvedValue(page);
      documentMocks.openFilePreview.mockResolvedValue(csvPreview());
      dispose = renderWorkspace();
      await waitFor(() => {
        expect(document.querySelector(".csv-preview-table")).not.toBeNull();
        expect(document.activeElement).toBe(
          document.querySelector(".workspace__document-column"),
        );
      });
      expect(document.querySelector(".file-browser")).toBeNull();
      for (const key of ["j", "ArrowRight", "Enter", "f", "t"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      }
      expect(document.querySelector(".file-browser")).toBeNull();
      expect(documentMocks.openFilePreview).toHaveBeenCalledTimes(1);
      modeButton("Expand left pane").click();
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("data-path")).toBe(
          "/workspace/data.csv",
        ),
      );
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
      await waitFor(() =>
        expect(
          document
            .querySelector(".file-browser__button--active")
            ?.getAttribute("data-path"),
        ).toBe("/workspace/other.csv"),
      );
      modeButton("Collapse left pane").click();
      await waitFor(() =>
        expect(document.activeElement).toBe(
          document.querySelector(".workspace__document-column"),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(documentMocks.openFilePreview).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the configured sidebar shortcut in the icon tooltip and toggle action", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(emptyDirectoryPage());
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: null,
      error: null,
      config: {
        workspace: {
          keymap: [
            { on: "<C-b>", run: "sidebar.toggle", desc: "Toggle sidebar" },
          ],
        },
      },
    });
    dispose = renderWorkspace();
    await waitForElement<HTMLElement>(".file-browser");
    const button = modeButton("Collapse left pane");
    expect(button.title).toBe("Collapse left pane (Ctrl+B)");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }),
    );
    expect(button.title).toBe("Expand left pane (Ctrl+B)");
    expect(document.querySelector(".file-browser")).toBeNull();
    button.click();
    expect(document.querySelector(".file-browser")).not.toBeNull();
  });

  it("restores the default Tree sort after another sort without stale listing state", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    dispose = renderWorkspace();
    const treeToggle = await waitForElement<HTMLButtonElement>(
      ".file-browser__view-option:nth-child(2)",
    );
    treeToggle.click();
    await waitFor(() =>
      expect(document.querySelector('[role="treeitem"]')).not.toBeNull(),
    );
    for (const key of ["m", "0", "m", "a"]) {
      const row =
        document.querySelector<HTMLButtonElement>('[role="treeitem"]');
      if (row === null) throw new Error("missing Tree row");
      if (key !== "0")
        row.dispatchEvent(
          new KeyboardEvent("keydown", { key: ",", bubbles: true }),
        );
      row.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      await waitFor(() => {
        if (key === "m")
          expect(documentMocks.listDirectory).toHaveBeenLastCalledWith(
            "/workspace",
            { field: "mtime", direction: "asc" },
            "",
            false,
            0,
            200,
          );
        expect(document.querySelector(".pane__header")?.textContent).toContain(
          key === "m" ? "mtime" : "name",
        );
        expect(document.querySelector('[role="treeitem"]')).not.toBeNull();
      });
    }
  });

  it.each(["list", "tree"])(
    "reveals a later-page search file with exact selection and focus in %s mode, clearing stale filters",
    async (mode) => {
      documentMocks.getStartupContext.mockResolvedValue(
        directoryStartupContext(null),
      );
      documentMocks.listDirectory.mockResolvedValue(
        directoryPage("/workspace/note.md"),
      );
      const targetPage = {
        ...directoryPage("/workspace/sub/target.txt"),
        current_directory_path: "/workspace/sub",
        parent_directory_path: "/workspace",
        offset: 1,
        total_entry_count: 2,
      };
      const target = targetPage.entries[0];
      if (target === undefined) throw new Error("Missing fixture");
      documentMocks.searchDirectory.mockResolvedValue({
        root_path: "/workspace",
        matches: [
          {
            entry: target,
            relative_path: "sub/target.txt",
            line_number: null,
            line_text: null,
          },
        ],
        truncated: false,
        skipped_count: 0,
        scanned_files: 2,
      });
      documentMocks.openFilePreview.mockResolvedValue({
        ...textPreview(),
        path: target.path,
        file_name: target.name,
      });
      dispose = renderWorkspace();
      await waitForElement(".file-browser__button");
      if (mode === "tree") {
        document
          .querySelector<HTMLButtonElement>('[aria-label="Tree"]')
          ?.click();
        expect(document.querySelector('[role="tree"]')).not.toBeNull();
      }
      document
        .querySelector<HTMLButtonElement>('[aria-label="Show filter"]')
        ?.click();
      const filter = await waitForElement<HTMLInputElement>(
        '[aria-label="Filter files"]',
      );
      filter.value = "note";
      filter.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await waitFor(() => expect(filter.value).toBe("note"));
      document
        .querySelector<HTMLButtonElement>('[aria-label="Find files"]')
        ?.click();
      const query = await waitForElement<HTMLInputElement>(
        '[aria-label="Find files query"]',
      );
      query.value = "target";
      query.dispatchEvent(new InputEvent("input", { bubbles: true }));
      query.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      const resultButton = await waitForElement<HTMLButtonElement>(
        ".directory-search__result",
      );
      documentMocks.listDirectory.mockImplementation(
        async (
          path: string,
          _sort: unknown,
          query: string,
          _hide: boolean,
          offset: number,
        ) => {
          if (path !== "/workspace/sub")
            return directoryPage("/workspace/note.md");
          expect(query).toBe("");
          if (offset === 0)
            return {
              ...directoryPage("/workspace/sub/first.txt"),
              current_directory_path: path,
              parent_directory_path: "/workspace",
              total_entry_count: 2,
              has_more: true,
            };
          return targetPage;
        },
      );
      resultButton.focus();
      if (mode === "list")
        resultButton.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "l",
            bubbles: true,
          }),
        );
      else
        document
          .querySelector<HTMLButtonElement>(".directory-search__jump")
          ?.click();
      await waitFor(() => {
        expect(document.querySelector(".directory-search")).toBeNull();
        expect(document.activeElement?.getAttribute("data-path")).toBe(
          target.path,
        );
        expect(
          document.activeElement?.classList.contains(
            "file-browser__button--active",
          ),
        ).toBe(true);
        if (mode === "tree")
          expect(document.activeElement?.getAttribute("aria-selected")).toBe(
            "true",
          );
      });
      expect(document.querySelector('[aria-label="Filter files"]')).toBeNull();
      await waitFor(() =>
        expect(documentMocks.openFilePreview).toHaveBeenCalledExactlyOnceWith(
          target.path,
        ),
      );
      await waitFor(() =>
        expect(document.querySelector(".file-preview")?.textContent).toContain(
          "keep",
        ),
      );
    },
  );

  it.each(["name", "content"])(
    "previews the last focused %s result without leaving search or changing directory",
    async (kind) => {
      documentMocks.getStartupContext.mockResolvedValue(
        directoryStartupContext(null),
      );
      documentMocks.listDirectory.mockResolvedValue(
        directoryPage("/workspace/note.md"),
      );
      const entries = directoryPageWithPaths([
        "/workspace/sub/first.txt",
        "/workspace/sub/second.txt",
      ]).entries;
      documentMocks.searchDirectory.mockResolvedValue({
        root_path: "/workspace",
        matches: entries.map((entry) => ({
          entry,
          relative_path: `sub/${entry.name}`,
          line_number: kind === "content" ? 1 : null,
          line_text: kind === "content" ? "match" : null,
        })),
        truncated: false,
        skipped_count: 0,
        scanned_files: 2,
      });
      documentMocks.openFilePreview.mockImplementation(
        async (path: string) => ({
          ...textPreview(),
          path,
          file_name: path.slice(path.lastIndexOf("/") + 1),
          html: `<section class="file-preview"><pre>${path}</pre></section>`,
        }),
      );
      dispose = renderWorkspace();
      await waitForElement(".file-browser__button");
      document
        .querySelector<HTMLButtonElement>(
          kind === "name"
            ? '[aria-label="Find files"]'
            : '[aria-label="Search file contents"]',
        )
        ?.click();
      const query = await waitForElement<HTMLInputElement>(
        ".directory-search__input",
      );
      query.value = "match";
      query.dispatchEvent(new InputEvent("input", { bubbles: true }));
      query.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      const first = await waitForElement<HTMLButtonElement>(
        ".directory-search__result",
      );
      first.focus();
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "j", bubbles: true }),
      );
      await waitFor(() =>
        expect(documentMocks.openFilePreview).toHaveBeenCalledExactlyOnceWith(
          "/workspace/sub/second.txt",
        ),
      );
      await waitFor(() =>
        expect(document.querySelector(".file-preview")?.textContent).toContain(
          "/workspace/sub/second.txt",
        ),
      );
      expect(document.querySelector(".directory-search")).not.toBeNull();
      expect(document.activeElement?.getAttribute("aria-label")).toContain(
        "sub/second.txt",
      );
      expect(documentMocks.listDirectory).toHaveBeenCalledTimes(1);
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", bubbles: true }),
      );
      await waitFor(() =>
        expect(documentMocks.openFilePreview).toHaveBeenLastCalledWith(
          "/workspace/sub/first.txt",
        ),
      );
      expect(documentMocks.openFilePreview).toHaveBeenCalledTimes(2);
      expect(document.querySelector(".directory-search")).not.toBeNull();
      expect(documentMocks.listDirectory).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps results available after a failed reveal and allows retry", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    const target = directoryPage("/workspace/sub/target.txt").entries[0];
    documentMocks.searchDirectory.mockResolvedValue({
      root_path: "/workspace",
      matches: [
        {
          entry: target,
          relative_path: "sub/target.txt",
          line_number: 2,
          line_text: "target",
        },
      ],
      truncated: false,
      skipped_count: 0,
      scanned_files: 1,
    });
    documentMocks.openFilePreview.mockResolvedValue({
      ...textPreview(),
      path: "/workspace/sub/target.txt",
      file_name: "target.txt",
    });
    dispose = renderWorkspace();
    await waitForElement(".file-browser__button");
    document
      .querySelector<HTMLButtonElement>('[aria-label="Search file contents"]')
      ?.click();
    const query = await waitForElement<HTMLInputElement>(
      '[aria-label="Search file contents query"]',
    );
    query.value = "target";
    query.dispatchEvent(new InputEvent("input", { bubbles: true }));
    query.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    const jump = await waitForElement<HTMLButtonElement>(
      ".directory-search__jump",
    );
    documentMocks.listDirectory.mockRejectedValueOnce(
      new Error("Directory unavailable"),
    );
    jump.click();
    await waitFor(() =>
      expect(document.body.textContent).toContain("Directory unavailable"),
    );
    expect(jump.isConnected).toBe(true);
    documentMocks.listDirectory.mockResolvedValueOnce({
      ...emptyDirectoryPage(),
      current_directory_path: "/workspace/sub",
      parent_directory_path: "/workspace",
    });
    jump.click();
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "The selected file is no longer available",
      ),
    );
    expect(jump.isConnected).toBe(true);
    documentMocks.listDirectory.mockResolvedValue({
      ...directoryPage("/workspace/sub/target.txt"),
      current_directory_path: "/workspace/sub",
      parent_directory_path: "/workspace",
    });
    jump.click();
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-path")).toBe(
        "/workspace/sub/target.txt",
      ),
    );
    expect(document.querySelector(".directory-search")).toBeNull();
  });

  it("runs custom manager/workspace sequences and shows only effective configured help and tooltips", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: "/config/keymap.toml",
      error: null,
      config: {
        mgr: {
          prepend_keymap: [
            { on: ["g", "f"], run: "search.name", desc: "Find project files" },
            { on: "f", run: "noop", desc: "Disabled filter alias" },
          ],
        },
        workspace: {
          keymap: [
            { on: ["x", "h"], run: "help", desc: "My custom help" },
            {
              on: ["<C-b>", "t"],
              run: "theme.toggle",
              desc: "My custom theme",
            },
          ],
        },
      },
    });
    dispose = renderWorkspace();
    const row = await waitForElement<HTMLButtonElement>(
      ".file-browser__button",
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[aria-label="Find files"]')
          ?.title,
      ).toContain("g then f"),
    );
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Show filter"]')
        ?.title,
    ).toBe("Show and focus filter (/)");
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", bubbles: true }),
    );
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", bubbles: true }),
    );
    expect(document.querySelector(".keymap-popup")?.textContent).toContain(
      "Find project files",
    );
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", bubbles: true }),
    );
    expect(
      document.querySelector('[aria-label="Find files query"]'),
    ).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close directory search"]')
      ?.click();
    const theme = document
      .querySelector(".workspace__theme-toggle")
      ?.getAttribute("aria-label");
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }),
    );
    expect(document.querySelector(".keymap-popup")?.textContent).toContain(
      "My custom theme",
    );
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", bubbles: true }),
    );
    await waitFor(() =>
      expect(
        document
          .querySelector(".workspace__theme-toggle")
          ?.getAttribute("aria-label"),
      ).not.toBe(theme),
    );
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", bubbles: true }),
    );
    expect(document.querySelector(".keymap-popup")?.textContent).toContain(
      "My custom help",
    );
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "h", bubbles: true }),
    );
    expect(document.querySelector(".shortcuts-help")?.textContent).toContain(
      "My custom help",
    );
    expect(
      document.querySelector(".shortcuts-help")?.textContent,
    ).not.toContain("Quit application");
  });

  it("disables legacy manager/workspace keys with empty replacement maps", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: "/config/keymap.toml",
      error: null,
      config: { mgr: { keymap: [] }, workspace: { keymap: [] } },
    });
    dispose = renderWorkspace();
    const row = await waitForElement<HTMLButtonElement>(
      ".file-browser__button",
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[aria-label="Tree"]')?.title,
      ).toBe("Tree view"),
    );
    const theme = document
      .querySelector(".workspace__theme-toggle")
      ?.getAttribute("aria-label");
    for (const key of ["t", "f", "/", "s", "S", "D", ",", "m", "0", "?", "L"])
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          shiftKey: /^[A-Z?]$/.test(key),
          bubbles: true,
        }),
      );
    expect(document.querySelector('[role="tree"]')).toBeNull();
    expect(document.querySelector('[role="searchbox"]')).toBeNull();
    expect(document.querySelector(".directory-search")).toBeNull();
    expect(document.querySelector(".keymap-popup")).toBeNull();
    expect(document.querySelector(".shortcuts-help")).toBeNull();
    expect(
      document
        .querySelector(".workspace__theme-toggle")
        ?.getAttribute("aria-label"),
    ).toBe(theme);
    expect(documentMocks.listDirectory).toHaveBeenCalledTimes(1);
  });

  it("owns browser S and comma continuations without changing theme or preview, while preserving save", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());
    documentMocks.saveDocument.mockResolvedValue(markdownSnapshot());
    dispose = renderWorkspace();
    await waitFor(() => expectActiveMode("Markdown preview"));
    if (document.querySelector(".file-browser__button") === null)
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "L", shiftKey: true }),
      );
    const row = await waitForElement<HTMLButtonElement>(
      ".file-browser__button",
    );
    row.focus();
    const theme = document
      .querySelector(".workspace__theme-toggle")
      ?.getAttribute("aria-label");
    const press = (key: string, init: KeyboardEventInit = {}) =>
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
      );
    press(",");
    press("S", { shiftKey: true });
    await waitFor(() =>
      expect(document.querySelector(".pane__header")?.textContent).toContain(
        "size",
      ),
    );
    expect(
      document
        .querySelector(".workspace__theme-toggle")
        ?.getAttribute("aria-label"),
    ).toBe(theme);
    expect(document.querySelector(".directory-search")).toBeNull();
    const currentRow = await waitForElement<HTMLButtonElement>(
      ".file-browser__button",
    );
    for (const key of ["1", "2", "?"]) {
      currentRow.dispatchEvent(
        new KeyboardEvent("keydown", { key: ",", bubbles: true }),
      );
      currentRow.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          shiftKey: key === "?",
          bubbles: true,
        }),
      );
      expectActiveMode("Markdown preview");
      expect(document.querySelector(".shortcuts-help")).toBeNull();
    }
    currentRow.dispatchEvent(
      new KeyboardEvent("keydown", { key: "S", shiftKey: true, bubbles: true }),
    );
    expect(
      document.querySelector('[aria-label="Search file contents query"]'),
    ).not.toBeNull();
    expect(
      document
        .querySelector(".workspace__theme-toggle")
        ?.getAttribute("aria-label"),
    ).toBe(theme);
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close directory search"]')
      ?.click();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      currentRow.dispatchEvent(
        new KeyboardEvent("keydown", { key: ",", bubbles: true }),
      );
      currentRow.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", bubbles: true, ...modifier }),
      );
    }
    await waitFor(() =>
      expect(documentMocks.saveDocument).toHaveBeenCalledTimes(2),
    );
    expect(document.querySelector(".file-browser__sequence-popup")).toBeNull();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "D", shiftKey: true }),
    );
    await waitFor(() =>
      expect(
        document
          .querySelector(".workspace__theme-toggle")
          ?.getAttribute("aria-label"),
      ).not.toBe(theme),
    );
  });

  it("reuses the loaded directory across repeated List/Tree switches", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    dispose = renderWorkspace();
    await waitForElement<HTMLButtonElement>(".file-browser__button");
    for (const mode of ["tree", "list", "tree", "list"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
      await waitFor(() =>
        expect(document.querySelector('[role="tree"]') !== null).toBe(
          mode === "tree",
        ),
      );
    }
    expect(documentMocks.listDirectory).toHaveBeenCalledTimes(1);
  });

  it("does not page through the root searching for a nested Tree selection on List return", async () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1000);
    try {
      const rootPage = {
        ...directoryPage("/workspace/src"),
        entries: directoryPage("/workspace/src").entries.map((entry) => ({
          ...entry,
          is_directory: true,
        })),
      };
      documentMocks.getStartupContext.mockResolvedValue(
        directoryStartupContext(null),
      );
      documentMocks.openFilePreview.mockResolvedValue(
        csvPreview({ path: "/workspace/src/data.csv" }),
      );
      documentMocks.listDirectory.mockImplementation(
        async (path: string, sort: { field: string }) =>
          path === "/workspace/src"
            ? {
                ...directoryPage("/workspace/src/data.csv"),
                current_directory_path: path,
              }
            : sort.field === "mtime"
              ? { ...rootPage, total_entry_count: 201, has_more: true }
              : rootPage,
      );
      dispose = renderWorkspace();
      await waitForElement<HTMLButtonElement>(".file-browser__button");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
      (
        await waitForElement<HTMLButtonElement>('[data-path="/workspace/src"]')
      ).click();
      (
        await waitForElement<HTMLButtonElement>(
          '[data-path="/workspace/src/data.csv"]',
        )
      ).click();
      const nested = await waitForElement<HTMLButtonElement>(
        '[data-path="/workspace/src/data.csv"]',
      );
      nested.dispatchEvent(
        new KeyboardEvent("keydown", { key: ",", bubbles: true }),
      );
      nested.dispatchEvent(
        new KeyboardEvent("keydown", { key: "m", bubbles: true }),
      );
      await waitFor(() =>
        expect(
          document.querySelector('[data-path="/workspace/src/data.csv"]'),
        ).not.toBeNull(),
      );
      documentMocks.listDirectory.mockClear();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
      await waitFor(() => {
        expect(document.querySelector('[role="tree"]')).toBeNull();
        expect(documentMocks.listDirectory).toHaveBeenCalledWith(
          "/workspace",
          { field: "mtime", direction: "asc" },
          "",
          false,
          0,
          200,
        );
      });
      expect(documentMocks.listDirectory).toHaveBeenCalledTimes(1);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it("switches Markdown raw and preview modes with 1 and 2", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Markdown preview");
    });

    expect(modeButton("Raw Markdown source").title).toBe(
      "Raw source (1; Shift+P toggles)",
    );
    expect(modeButton("Markdown preview").title).toBe(
      "Preview (2; Shift+P toggles)",
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    await waitFor(() => {
      expectActiveMode("Raw Markdown source");
      expect(document.querySelector(".markdown-source-editor")).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    await waitFor(() => {
      expectActiveMode("Markdown preview");
      expect(document.body.textContent).toContain("Body");
    });
  });

  it("does not switch Markdown modes while typing in editable controls", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Markdown preview");
    });

    const editableInput = document.createElement("input");
    document.body.append(editableInput);

    editableInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", bubbles: true }),
    );

    await waitFor(() => {
      expectActiveMode("Markdown preview");
      expect(document.querySelector(".markdown-source-editor")).toBeNull();
    });
  });

  it("switches available CSV raw and formatted modes with 1 and 2", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/data.csv"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/data.csv"),
    );
    documentMocks.openFilePreview.mockResolvedValue(csvPreview());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Formatted CSV table");
      expect(document.body.textContent).toContain("Formatted CSV");
    });

    expect(modeButton("Raw CSV source").title).toBe("Raw (1; Shift+P toggles)");
    expect(modeButton("Formatted CSV table").title).toBe(
      "Formatted (2; Shift+P toggles)",
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(document.body.textContent).toContain("name,count");
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    await waitFor(() => {
      expectActiveMode("Formatted CSV table");
      expect(document.body.textContent).toContain("Formatted CSV");
    });
  });

  it("leaves unavailable CSV formatted mode unchanged when 2 is pressed", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/data.csv"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/data.csv"),
    );
    documentMocks.openFilePreview.mockResolvedValue(
      csvPreview({
        rows: [],
        column_count: 0,
        displayed_row_count: 0,
        total_row_count: null,
        row_count_status: "parse_error",
        formatted_available: false,
        parse_error: "CSV parse failed",
      }),
    );

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(modeButton("Formatted CSV table").disabled).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));

    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(
        modeButton("Formatted CSV table").classList.contains(
          "workspace__mode--active",
        ),
      ).toBe(false);
      expect(document.body.textContent).toContain("name,count");
      expect(document.body.textContent).not.toContain("Formatted CSV");
    });
  });

  it("shows direct numeric selectors in shortcut help", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Please select a file.");
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true }),
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "Toggle Raw / Preview (Markdown) or Raw / Formatted (CSV)",
      );
      expect(document.body.textContent).toContain(
        "Select Raw view (Markdown / CSV)",
      );
      expect(document.body.textContent).toContain(
        "Select Preview view (Markdown) or Formatted view (CSV)",
      );
      expect(document.body.textContent).toContain(", then s/S");
      expect(document.body.textContent).toContain(
        "Search file contents recursively",
      );

      const dialog = document.querySelector<HTMLElement>(
        '.shortcuts-help[role="dialog"]',
      );
      const sectionLayout = dialog?.querySelector<HTMLElement>(
        ".shortcuts-help__sections",
      );
      const sections = sectionLayout?.querySelectorAll(
        ":scope > .shortcuts-help__section",
      );

      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.getAttribute("aria-labelledby")).toBe(
        "shortcuts-help-title",
      );
      expect(sections).toHaveLength(4);
      expect(sectionLayout?.querySelector(".shortcuts-help__title")).toBeNull();
      expect(
        sectionLayout?.querySelector(".shortcuts-help__footer"),
      ).toBeNull();
    });
  });

  it("refreshes a directory when no file is open", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory
      .mockResolvedValueOnce(directoryPage("/workspace/old.txt"))
      .mockResolvedValueOnce(directoryPage("/workspace/new.txt"));

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("old.txt");
    });

    const reloadButton = modeButton("Refresh workspace");
    expect(reloadButton.disabled).toBe(false);
    reloadButton.click();

    await waitFor(() => {
      expect(document.body.textContent).toContain("new.txt");
      expect(document.body.textContent).not.toContain("old.txt");
      expect(documentMocks.listDirectory).toHaveBeenCalledTimes(2);
    });
  });

  it("refreshes an explicit file-set listing and its active preview", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      explicitFileSetStartupContext(),
    );
    documentMocks.listExplicitFileSet
      .mockResolvedValueOnce(directoryPage("/workspace/data.csv"))
      .mockResolvedValueOnce(directoryPage("/workspace/other.csv"));
    documentMocks.openFilePreview.mockResolvedValue(csvPreview());

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("data.csv");
    });
    modeButton("Expand left pane").click();
    modeButton("Refresh workspace").click();

    await waitFor(() => {
      expect(document.body.textContent).toContain("other.csv");
      expect(documentMocks.listExplicitFileSet).toHaveBeenCalledTimes(2);
      expect(documentMocks.openFilePreview).toHaveBeenCalledTimes(2);
    });
  });

  it("preserves the selected file when it remains in the refreshed listing", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/keep.txt"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPageWithPaths(["/workspace/first.txt", "/workspace/keep.txt"]),
    );
    documentMocks.openFilePreview.mockResolvedValue(textPreview());

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("keep");
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "L", shiftKey: true }),
    );
    modeButton("Refresh workspace").click();

    await waitFor(() => {
      const selected = document.querySelector<HTMLButtonElement>(
        'button[data-path="/workspace/keep.txt"]',
      );
      expect(selected?.classList.contains("file-browser__button--active")).toBe(
        true,
      );
    });
  });

  it("refreshes the listing and active Markdown file together", async () => {
    const refreshedSnapshot = {
      ...markdownSnapshot(),
      source_text: "# Updated",
      html: '<h1 id="updated">Updated</h1>',
      revision_token: "rev-2",
      last_modified: "2026-08-17T00:00:00Z",
    };
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory
      .mockResolvedValueOnce(directoryPage("/workspace/note.md"))
      .mockResolvedValueOnce(directoryPage("/workspace/renamed.txt"));
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());
    documentMocks.reloadDocument.mockResolvedValue(refreshedSnapshot);

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Body");
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "L", shiftKey: true }),
    );
    modeButton("Refresh workspace").click();

    await waitFor(() => {
      expect(document.body.textContent).toContain("renamed.txt");
      expect(document.body.textContent).toContain("Updated");
      expect(documentMocks.reloadDocument).toHaveBeenCalledWith(
        "/workspace/note.md",
      );
    });
  });

  it("does not overwrite unsaved Markdown while refreshing the listing", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory
      .mockResolvedValueOnce(directoryPage("/workspace/note.md"))
      .mockResolvedValueOnce(directoryPage("/workspace/fresh.txt"));
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Markdown preview");
    });
    modeButton("Raw Markdown source").click();
    const editor = await waitForElement<HTMLTextAreaElement>(
      ".markdown-source-editor",
    );
    editor.value = "# Unsaved";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "L", shiftKey: true }),
    );
    modeButton("Refresh workspace").click();

    await waitFor(() => {
      expect(document.body.textContent).toContain("fresh.txt");
      expect(editor.value).toBe("# Unsaved");
      expect(documentMocks.reloadDocument).not.toHaveBeenCalled();
    });
  });

  it("clears a clean active file that disappeared during refresh", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory
      .mockResolvedValueOnce(directoryPage("/workspace/note.md"))
      .mockResolvedValueOnce(emptyDirectoryPage());
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());
    documentMocks.reloadDocument.mockRejectedValue(
      new Error("File no longer exists"),
    );

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Body");
    });
    modeButton("Refresh workspace").click();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Please select a file.");
      expect(document.body.textContent).toContain("File no longer exists");
      expect(document.body.textContent).not.toContain("Body");
    });
  });
});

describe("WorkspaceShell Git-ignored visibility", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    documentMocks.getStartupContext.mockReset();
    documentMocks.listDirectory.mockReset();
    documentMocks.getKeymapConfig.mockResolvedValue({
      path: null,
      config: {},
      error: null,
    });
    documentMocks.listExplicitFileSet.mockReset();
    documentMocks.openDocument.mockReset();
    documentMocks.openFilePreview.mockReset();
    documentMocks.reloadDocument.mockReset();
    documentMocks.listenDocumentRefreshed.mockReset();
    documentMocks.stopDocumentWatch.mockReset();
    documentMocks.listenDocumentRefreshed.mockResolvedValue(() => {});
    documentMocks.stopDocumentWatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("defaults to showing ignored entries, then reloads from offset zero with the toggled state", async () => {
    const selectedPath = "/workspace/note.md";
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(directoryPage(selectedPath));

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(documentMocks.listDirectory).toHaveBeenCalledWith(
        "/workspace",
        { field: "name", direction: "asc" },
        "",
        false,
        0,
        200,
      );
    });

    const toggle = await waitForElement<HTMLButtonElement>(
      ".file-browser__git-ignored-toggle",
    );
    toggle.click();

    await waitFor(() => {
      expect(documentMocks.listDirectory).toHaveBeenLastCalledWith(
        "/workspace",
        { field: "name", direction: "asc" },
        "",
        true,
        0,
        200,
      );
      expect(
        document
          .querySelector<HTMLButtonElement>(".file-browser__git-ignored-toggle")
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        document.querySelector<HTMLButtonElement>(
          `.file-browser__button[data-path="${selectedPath}"]`,
        ),
      ).not.toBeNull();
    });

    modeButton("Refresh workspace").click();
    await waitFor(() => {
      expect(documentMocks.listDirectory).toHaveBeenLastCalledWith(
        "/workspace",
        { field: "name", direction: "asc" },
        "",
        true,
        0,
        200,
      );
    });
  });
});

async function waitForElement<T extends Element>(selector: string): Promise<T> {
  let element: T | null = null;
  await waitFor(() => {
    element = document.querySelector<T>(selector);
    expect(element).not.toBeNull();
  });

  if (element === null) {
    throw new Error(`missing element ${selector}`);
  }

  return element;
}
