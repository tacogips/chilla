import { readFileSync } from "node:fs";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { DirectoryPage } from "../../lib/tauri/document";
import {
  FileBrowserPane,
  compactDirectoryPath,
  compactDirectoryPathRows,
  directoryPathComponents,
} from "./FileBrowserPane";

const appStyles = readFileSync("src/app/App.css", "utf8");

describe("FileBrowserPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("renders file names as stable ellipsized text without marquee DOM", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fileName = "very-long-file-name-for-scroll-behavior.md";

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: `/workspace/${fileName}`,
                canonical_path: `/workspace/${fileName}`,
                name: fileName,
                directory_hint: "",
                is_directory: false,
                is_symlink: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 1,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={`/workspace/${fileName}`}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const name = document.querySelector<HTMLElement>(".file-browser__name");

    if (name === null) {
      throw new Error("missing file browser name element");
    }

    expect(name.textContent).toBe(fileName);
    expect(name.title).toBe(fileName);
    expect(document.querySelector(".file-browser__name-marquee")).toBeNull();
    expect(name.dataset["overflowing"]).toBeUndefined();
    const shortPath = document.querySelector(".file-browser__path");
    expect(shortPath?.classList.contains("file-browser__path--compact")).toBe(
      false,
    );
    expect(shortPath?.textContent).toBe("/workspace");
    expect(shortPath?.querySelector(".file-browser__path-row")).toBeNull();
  });

  it("renders symbolic links with a dedicated glyph and resolved target", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const linkPath = "/workspace/notes-link";
    const targetPath = "/workspace/archive/notes.md";
    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: linkPath,
                canonical_path: targetPath,
                name: "notes-link",
                directory_hint: "",
                is_directory: true,
                is_symlink: true,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 1,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={linkPath}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const row = document.querySelector<HTMLButtonElement>(
      ".file-browser__button",
    );
    const target = document.querySelector<HTMLElement>(
      ".file-browser__symlink-target",
    );
    if (row === null || target === null) {
      throw new Error("missing symbolic-link presentation");
    }

    expect(row.getAttribute("aria-label")).toBe(
      `notes-link, symbolic link to ${targetPath}`,
    );
    expect(row.title).toBe(`notes-link, symbolic link to ${targetPath}`);
    expect(target.textContent).toBe(`→ ${targetPath}`);
    expect(target.title).toBe(targetPath);
    expect(row.classList.contains("file-browser__button--dir")).toBe(true);
    expect(row.classList.contains("file-browser__button--symlink")).toBe(true);
    expect(row.querySelector(".file-browser__glyph--symlink")).not.toBeNull();
    expect(row.querySelector(".file-browser__path-hint")).toBeNull();
  });

  it("keeps regular file and directory rows on their existing presentation", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: "/workspace/folder",
                canonical_path: "/workspace/folder",
                name: "folder",
                directory_hint: "",
                is_directory: true,
                is_symlink: false,
                size_bytes: 0,
                modified_at_unix_ms: 0,
              },
              {
                path: "/workspace/file.md",
                canonical_path: "/workspace/file.md",
                name: "file.md",
                directory_hint: "",
                is_directory: false,
                is_symlink: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 2,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const rows = document.querySelectorAll<HTMLButtonElement>(
      ".file-browser__button",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.classList.contains("file-browser__button--dir")).toBe(true);
    expect(rows[0]?.getAttribute("aria-label")).toBe("folder");
    expect(rows[1]?.classList.contains("file-browser__button--file")).toBe(
      true,
    );
    expect(rows[1]?.getAttribute("aria-label")).toBe("file.md");
    expect(document.querySelector(".file-browser__symlink-target")).toBeNull();
  });

  it("shows a stateful Git-ignored toggle only for directory listings", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={null}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={true}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const toggle = document.querySelector<HTMLButtonElement>(
      ".file-browser__git-ignored-toggle",
    );
    if (toggle === null) {
      throw new Error("missing Git-ignored toggle");
    }

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toContain("hidden");
    expect(toggle.title).toContain("(.)");
    expect(
      toggle.classList.contains("file-browser__git-ignored-toggle--active"),
    ).toBe(true);
  });

  it("uses the same toggle callback for click and the directory-only dot shortcut", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const onToggleGitIgnored = vi.fn();
    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [],
            total_entry_count: 0,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={onToggleGitIgnored}
        />
      ),
      root,
    );

    const toggle = document.querySelector<HTMLButtonElement>(
      ".file-browser__git-ignored-toggle",
    );
    const filter = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );
    if (toggle === null || filter === null) {
      throw new Error("missing file browser controls");
    }

    toggle.click();
    toggle.dispatchEvent(
      new KeyboardEvent("keydown", { key: ".", bubbles: true }),
    );
    filter.dispatchEvent(
      new KeyboardEvent("keydown", { key: ".", bubbles: true }),
    );

    expect(onToggleGitIgnored).toHaveBeenCalledTimes(2);
  });

  it("does not show the Git-ignored toggle for explicit file sets", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="explicit_file_set"
          directory={null}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    expect(
      document.querySelector(".file-browser__git-ignored-toggle"),
    ).toBeNull();
  });

  it("compacts long directory paths by Unicode code point", () => {
    const path = `/root/${"文".repeat(23)}/${"字".repeat(23)}`;
    const compact = compactDirectoryPath(path);

    expect(Array.from(compact)).toHaveLength(41);
    expect(compact).toBe(
      `${Array.from(path).slice(0, 20).join("")}…${Array.from(path)
        .slice(-20)
        .join("")}`,
    );
    expect(compactDirectoryPath("/short/path")).toBe("/short/path");
    expect(compactDirectoryPathRows("/short/path")).toBeNull();
    expect(compactDirectoryPathRows(path)).toEqual({
      leading: `${Array.from(path).slice(0, 20).join("")}…`,
      trailing: Array.from(path).slice(-20).join(""),
    });
  });

  it("keeps path and filter controls outside the entries scroll viewport", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const onLoadMore = vi.fn();
    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: `/workspace/${"long-directory/".repeat(4)}leaf`,
            parent_directory_path: "/",
            entries: [
              {
                path: "/workspace/readme.md",
                canonical_path: "/workspace/readme.md",
                name: "readme.md",
                directory_hint: "",
                is_directory: false,
                is_symlink: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 100,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={true}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={onLoadMore}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const pathLine = document.querySelector<HTMLElement>(".file-browser__path");
    const filterRow = document.querySelector<HTMLElement>(
      ".file-browser__filter-row",
    );
    const browserBody = document.querySelector<HTMLElement>(
      ".pane__body.file-browser",
    );
    const entriesViewport = document.querySelector<HTMLElement>(
      ".file-browser__entries",
    );
    if (
      pathLine === null ||
      filterRow === null ||
      browserBody === null ||
      entriesViewport === null
    ) {
      throw new Error("missing file browser layout elements");
    }

    expect(pathLine.parentElement).toBe(browserBody);
    expect(pathLine.classList.contains("file-browser__path--compact")).toBe(
      true,
    );
    expect(
      pathLine.querySelector(".file-browser__path-row--leading")?.textContent,
    ).toBe(`${Array.from(pathLine.title).slice(0, 20).join("")}…`);
    expect(
      pathLine.querySelector(".file-browser__path-row--trailing")?.textContent,
    ).toBe(Array.from(pathLine.title).slice(-20).join(""));
    expect(filterRow.parentElement).toBe(browserBody);
    expect(entriesViewport.parentElement).toBe(browserBody);
    expect(
      entriesViewport.contains(document.querySelector(".file-browser__list")),
    ).toBe(true);
    expect(appStyles).toMatch(/\.file-browser\s*\{[^}]*overflow:\s*hidden;/s);
    expect(appStyles).toMatch(
      /\.file-browser__path\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s,
    );
    expect(appStyles).toMatch(
      /\.file-browser__path--compact\s*\{[^}]*grid-template-rows:\s*repeat\(2, 1\.35em\);[^}]*block-size:\s*calc\(2\.7em \+ 0\.5rem \+ 1px\);/s,
    );
    expect(appStyles).toMatch(
      /\.file-browser__path-row\s*\{[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;/s,
    );
    expect(appStyles).toMatch(
      /\.file-browser__filter-row\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
    expect(appStyles).toMatch(
      /\.file-browser__entries\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s,
    );

    Object.defineProperties(entriesViewport, {
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 750, writable: true },
      clientHeight: { configurable: true, value: 100 },
    });
    const loadCallsBeforeScroll = onLoadMore.mock.calls.length;
    entriesViewport.dispatchEvent(new Event("scroll"));

    expect(onLoadMore).toHaveBeenCalledTimes(loadCallsBeforeScroll + 1);
    expect(browserBody.scrollTop).toBe(0);
  });

  it("resets only the entries viewport when navigating directories", async () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const directoryPage = (path: string): DirectoryPage => ({
      current_directory_path: path,
      parent_directory_path: "/",
      entries: [
        {
          path: `${path}/readme.md`,
          canonical_path: `${path}/readme.md`,
          name: "readme.md",
          directory_hint: "",
          is_directory: false,
          is_symlink: false,
          size_bytes: 42,
          modified_at_unix_ms: 0,
        },
      ],
      total_entry_count: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    const [directory, setDirectory] = createSignal(
      directoryPage("/workspace/first"),
    );

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={directory()}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const browserBody = document.querySelector<HTMLElement>(
      ".pane__body.file-browser",
    );
    const entriesViewport = document.querySelector<HTMLElement>(
      ".file-browser__entries",
    );
    if (browserBody === null || entriesViewport === null) {
      throw new Error("missing file browser scroll viewport");
    }

    entriesViewport.scrollTop = 240;
    setDirectory(directoryPage("/workspace/second"));
    await Promise.resolve();

    expect(entriesViewport.scrollTop).toBe(0);
    expect(browserBody.scrollTop).toBe(0);
  });

  it("shows the full path on hover and opens directory information with Tab", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const directoryPath = `/workspace/${"very-long-directory/".repeat(4)}leaf`;
    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: directoryPath,
            parent_directory_path: "/",
            entries: [],
            total_entry_count: 7,
          }}
          sort={{ field: "mtime", direction: "desc" }}
          query="needle"
          hideGitIgnored={true}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const pathLine = document.querySelector<HTMLElement>(".file-browser__path");
    if (pathLine === null) {
      throw new Error("missing directory path");
    }

    expect(pathLine.textContent).toBe(compactDirectoryPath(directoryPath));
    expect(pathLine.title).toBe(directoryPath);
    pathLine.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );

    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    if (dialog === null) {
      throw new Error("missing directory information dialog");
    }

    expect(dialog.textContent).toContain(directoryPath);
    expect(dialog.textContent).toContain("Total entries");
    expect(dialog.textContent).toContain("Loaded entries");
    expect(dialog.textContent).toContain("Sort: mtime new-old");
    expect(dialog.textContent).toContain("needle");
    expect(dialog.textContent).toContain("Hidden");
    expect(directoryPathComponents(directoryPath)).toEqual([
      "/",
      "workspace",
      ...Array(4).fill("very-long-directory"),
      "leaf",
    ]);
    expect(
      document.querySelectorAll(".directory-information__path-tree li"),
    ).toHaveLength(7);

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.querySelector(".directory-information")).toBeNull();

    const filter = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );
    if (filter === null) {
      throw new Error("missing filter");
    }
    filter.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.querySelector(".directory-information")).toBeNull();
  });

  it("traps directory-information focus and restores the opening row", async () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: "/workspace/readme.md",
                canonical_path: "/workspace/readme.md",
                name: "readme.md",
                directory_hint: "",
                is_directory: false,
                is_symlink: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 1,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath="/workspace/readme.md"
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const openingRow = document.querySelector<HTMLButtonElement>(
      ".file-browser__button",
    );
    if (openingRow === null) {
      throw new Error("missing file browser row");
    }

    openingRow.focus();
    openingRow.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    await Promise.resolve();

    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const closeButton = document.querySelector<HTMLButtonElement>(
      ".directory-information__close",
    );
    const filter = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );
    if (dialog === null || closeButton === null || filter === null) {
      throw new Error("missing directory information focus targets");
    }

    expect(document.activeElement).toBe(dialog);
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(closeButton);

    closeButton.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(closeButton);

    filter.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await Promise.resolve();

    expect(document.querySelector(".directory-information")).toBeNull();
    expect(document.activeElement).toBe(openingRow);
  });

  it("suppresses file-browser and workspace shortcuts while directory information is open", async () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    const onChangeSort = vi.fn();
    const onSelectEntry = vi.fn();
    const onConfirmEntry = vi.fn();
    const onNavigateToParent = vi.fn();
    const onToggleGitIgnored = vi.fn();
    const workspaceShortcut = vi.fn();
    window.addEventListener("keydown", workspaceShortcut);

    try {
      dispose = render(
        () => (
          <FileBrowserPane
            active={true}
            listingKind="directory"
            directory={{
              current_directory_path: "/workspace",
              parent_directory_path: "/",
              entries: [
                {
                  path: "/workspace/readme.md",
                  canonical_path: "/workspace/readme.md",
                  name: "readme.md",
                  directory_hint: "",
                  is_directory: false,
                  is_symlink: false,
                  size_bytes: 42,
                  modified_at_unix_ms: 0,
                },
              ],
              total_entry_count: 1,
            }}
            sort={{ field: "name", direction: "asc" }}
            query=""
            hideGitIgnored={false}
            selectedPath="/workspace/readme.md"
            canLoadMore={false}
            isLoadingMore={false}
            onChangeQuery={() => {}}
            onChangeSort={onChangeSort}
            onLoadMore={() => {}}
            onSelectEntry={onSelectEntry}
            onConfirmEntry={onConfirmEntry}
            onNavigateToParent={onNavigateToParent}
            onToggleGitIgnored={onToggleGitIgnored}
          />
        ),
        root,
      );

      const openingRow = document.querySelector<HTMLButtonElement>(
        ".file-browser__button",
      );
      if (openingRow === null) {
        throw new Error("missing file browser row");
      }

      openingRow.focus();
      openingRow.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      await Promise.resolve();

      const dialog = document.querySelector<HTMLElement>("[role=dialog]");
      if (dialog === null) {
        throw new Error("missing directory information dialog");
      }

      workspaceShortcut.mockClear();
      for (const key of [".", "h", "a", "j", "Enter"]) {
        dialog.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true }),
        );
      }

      expect(workspaceShortcut).not.toHaveBeenCalled();
      expect(onChangeSort).not.toHaveBeenCalled();
      expect(onSelectEntry).not.toHaveBeenCalled();
      expect(onConfirmEntry).not.toHaveBeenCalled();
      expect(onNavigateToParent).not.toHaveBeenCalled();
      expect(onToggleGitIgnored).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", workspaceShortcut);
    }
  });

  it("does not open directory information from editable controls or explicit file sets", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="explicit_file_set"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: null,
            entries: [],
            total_entry_count: 0,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          hideGitIgnored={false}
          selectedPath={null}
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
          onToggleGitIgnored={() => {}}
        />
      ),
      root,
    );

    const filter = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );
    if (filter === null) {
      throw new Error("missing filter");
    }

    const pathLine = document.querySelector<HTMLElement>(".file-browser__path");
    if (pathLine === null) {
      throw new Error("missing explicit file-set path");
    }
    pathLine.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    filter.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.querySelector(".directory-information")).toBeNull();
    expect(document.querySelector(".file-browser__path")?.textContent).toBe(
      "Opened from CLI selection",
    );
  });
});
