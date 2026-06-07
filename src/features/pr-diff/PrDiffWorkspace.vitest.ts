import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type {
  GitHubDiffSource,
  GitHubPrTarget,
  PrDiffFile,
  PrDiffSnapshot,
} from "../../lib/tauri/document";
import { PrFileStatus } from "../../lib/tauri/document";

const loadPrDiffMock = vi.hoisted(() => vi.fn());
const loadPrDiffFileTextMock = vi.hoisted(() => vi.fn());
const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("../../lib/tauri/document", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/tauri/document")>();

  return {
    ...actual,
    loadPrDiff: loadPrDiffMock,
    loadPrDiffFileText: loadPrDiffFileTextMock,
  };
});

import {
  buildDirectoryEntries,
  FullFileDiff,
  PrDiffWorkspace,
} from "./PrDiffWorkspace";

function diffFile(
  path: string,
  additions: number,
  deletions: number,
): PrDiffFile {
  return {
    path,
    old_path: null,
    status: PrFileStatus.Modified,
    additions,
    deletions,
    chunks: [],
    is_binary: false,
    raw_url: `https://raw.githubusercontent.com/tacogips/chilla/main/${path}`,
    full_text: null,
    full_text_truncated: false,
  };
}

const target: GitHubPrTarget = {
  owner: "tacogips",
  repo: "chilla",
  source: {
    kind: "pull_request",
    number: 12,
  },
  url: "https://github.com/tacogips/chilla/pull/12",
  use_cache: true,
};

function textDiffFile(
  path: string,
  content = "new",
  oldPath: string | null = null,
): PrDiffFile {
  return {
    path,
    old_path: oldPath,
    status: oldPath === null ? PrFileStatus.Modified : PrFileStatus.Renamed,
    additions: 1,
    deletions: 1,
    is_binary: false,
    raw_url: `https://raw.githubusercontent.com/tacogips/chilla/main/${path}`,
    chunks: [
      {
        old_start: 1,
        old_lines: 1,
        new_start: 1,
        new_lines: 1,
        header: "@@ -1 +1 @@",
        changes: [
          {
            change_type: "delete",
            old_line: 1,
            new_line: null,
            content: "old",
          },
          {
            change_type: "add",
            old_line: null,
            new_line: 1,
            content,
          },
        ],
      },
    ],
    full_text: `before\n${content}\nafter`,
    full_text_truncated: false,
  };
}

function binaryDiffFile(path: string): PrDiffFile {
  return {
    path,
    old_path: null,
    status: PrFileStatus.Modified,
    additions: 0,
    deletions: 0,
    chunks: [],
    is_binary: true,
    raw_url: null,
    full_text: null,
    full_text_truncated: false,
  };
}

function snapshot(
  files: readonly PrDiffFile[],
  source: GitHubDiffSource = target.source,
  url = target.url,
): PrDiffSnapshot {
  return {
    identity: {
      owner: target.owner,
      repo: target.repo,
      source,
      url,
      title: "Example PR",
      state: "open",
      merged: false,
      merged_at: null,
      updated_at: "2026-06-02T00:00:00Z",
      base_branch: "main",
      head_branch: "feature/pr-diff",
    },
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    warnings: [],
  };
}

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

function click(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`missing element ${selector}`);
  }
  element.click();
}

describe("PrDiffWorkspace", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    loadPrDiffMock.mockReset();
    loadPrDiffFileTextMock.mockReset();
    loadPrDiffFileTextMock.mockResolvedValue({
      full_text: "",
      full_text_truncated: false,
    });
    openUrlMock.mockReset();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  function renderWorkspace(): void {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }
    dispose = render(
      () => PrDiffWorkspace({ target: { kind: "github", target } }),
      root,
    );
  }

  it("retries after an error and renders the resolved diff", async () => {
    loadPrDiffMock
      .mockRejectedValueOnce(new Error("GitHub rate limit was exceeded"))
      .mockResolvedValueOnce(snapshot([textDiffFile("README.md")]));

    renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "GitHub rate limit was exceeded",
      );
      expect(document.body.textContent).toContain("Retry");
    });

    click(".pr-diff-error button");

    await waitFor(() => {
      expect(loadPrDiffMock).toHaveBeenCalledTimes(2);
      expect(document.body.textContent).toContain("README.md");
      expect(document.body.textContent).toContain("No file selected.");
    });

    click('[data-path="README.md"]');

    await waitFor(() => {
      expect(document.body.textContent).toContain("new");
    });
  });

  it("shows loading indicators while the GitHub diff is loading", () => {
    loadPrDiffMock.mockReturnValue(new Promise(() => undefined));

    renderWorkspace();

    expect(document.body.textContent).toContain("Loading files...");
    expect(document.body.textContent).toContain("Loading diff...");
    expect(document.querySelectorAll(".pr-diff-loading__spinner")).toHaveLength(
      2,
    );
  });

  it("shows merged state ahead of closed state", async () => {
    loadPrDiffMock.mockResolvedValue({
      ...snapshot([textDiffFile("README.md")]),
      identity: {
        ...snapshot([]).identity,
        state: "closed",
        merged: true,
        merged_at: "2026-06-02T03:04:05Z",
      },
    });

    renderWorkspace();

    await waitFor(() => {
      const state = document.querySelector<HTMLElement>(
        ".pr-diff-header__state",
      );
      expect(state?.textContent).toBe("Merged");
      expect(state?.title).toBe("Merged at 2026-06-02T03:04:05Z");
    });
  });

  it("opens the canonical GitHub source URL from the header jump button", async () => {
    loadPrDiffMock.mockResolvedValue(snapshot([textDiffFile("README.md")]));

    renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Example PR");
    });

    click('[aria-label="Open source in GitHub"]');

    expect(openUrlMock).toHaveBeenCalledWith(
      "https://github.com/tacogips/chilla/pull/12",
    );
  });

  it("renders commit source labels and jump action", async () => {
    const commitTarget: GitHubPrTarget = {
      owner: "tacogips",
      repo: "chilla",
      source: {
        kind: "commit",
        sha: "abcdef1234567890",
      },
      url: "https://github.com/tacogips/chilla/commit/abcdef1234567890",
      use_cache: true,
    };
    loadPrDiffMock.mockResolvedValue(
      snapshot(
        [textDiffFile("README.md")],
        commitTarget.source,
        commitTarget.url,
      ),
    );

    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }
    dispose = render(
      () =>
        PrDiffWorkspace({ target: { kind: "github", target: commitTarget } }),
      root,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain("chilla @abcdef123456");
      expect(document.body.textContent).toContain("Commit: Example PR");
      expect(document.body.textContent).toContain("Commit");
    });

    click('[aria-label="Open source in GitHub"]');

    expect(openUrlMock).toHaveBeenCalledWith(commitTarget.url);
  });

  it("renders compare source labels and jump action", async () => {
    const compareTarget: GitHubPrTarget = {
      owner: "tacogips",
      repo: "chilla",
      source: {
        kind: "compare",
        base: "main",
        head: "feature/pr-diff",
      },
      url: "https://github.com/tacogips/chilla/compare/main...feature/pr-diff",
      use_cache: false,
    };
    loadPrDiffMock.mockResolvedValue({
      ...snapshot(
        [textDiffFile("README.md")],
        compareTarget.source,
        compareTarget.url,
      ),
      identity: {
        ...snapshot([], compareTarget.source, compareTarget.url).identity,
        title: "Compare main...feature/pr-diff",
        state: "ahead",
        base_branch: "main",
        head_branch: "feature/pr-diff",
      },
    });

    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }
    dispose = render(
      () =>
        PrDiffWorkspace({ target: { kind: "github", target: compareTarget } }),
      root,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "chilla main...feature/pr-diff",
      );
      expect(document.body.textContent).toContain(
        "Compare: Compare main...feature/pr-diff",
      );
      expect(document.body.textContent).toContain("ahead");
    });

    click('[aria-label="Open source in GitHub"]');

    expect(openUrlMock).toHaveBeenCalledWith(compareTarget.url);
  });

  it("starts at the top-level diff browser without opening a diff", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile(".agents/skills/rielflow-node-addons/SKILL.md", "skill"),
        textDiffFile("src/app.ts", "app"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Changed Files");
      expect(document.querySelector('[data-path=".agents"]')).not.toBeNull();
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
      expect(document.body.textContent).toContain("No file selected.");
      expect(document.body.textContent).not.toContain("skill");
    });

    expect(
      document
        .querySelector('[data-path=".agents"]')
        ?.classList.contains("file-browser__button--active"),
    ).toBe(true);
  });

  it("moves the browser cursor without opening directories and opens focused files", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile(".agents/skills/rielflow-node-addons/SKILL.md", "skill"),
        textDiffFile("src/app.ts", "app"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path=".agents"]')).not.toBeNull();
      expect(document.body.textContent).toContain("No file selected.");
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Down" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("No file selected.");
      expect(document.body.textContent).toContain(".agents");
      expect(document.body.textContent).toContain("src");
      expect(
        document
          .querySelector('[data-path="src"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Return" }));

    await waitFor(() => {
      expect(document.querySelector('[data-path="src/app.ts"]')).not.toBeNull();
      expect(document.body.textContent).toContain("app");
    });
  });

  it("opens a file diff as soon as keyboard focus lands on a file", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile(".agents/skills/rielflow-node-addons/SKILL.md", "skill"),
        textDiffFile("README.md", "readme"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path=".agents"]')).not.toBeNull();
      expect(document.body.textContent).toContain("No file selected.");
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Down" }));

    await waitFor(() => {
      expect(
        document
          .querySelector('[data-path="README.md"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
      expect(document.body.textContent).toContain("readme");
    });
  });

  it("uses one horizontal scrollbar per left/right diff hunk", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("bun.lock", "long content")]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="bun.lock"]')).not.toBeNull();
    });
    click('[data-path="bun.lock"]');

    await waitFor(() => {
      expect(
        document.querySelector(".pr-diff-segment-scrollbar"),
      ).not.toBeNull();
    });

    const hunkBodies = document.querySelectorAll<HTMLDivElement>(
      ".pr-diff-split__hunk-body",
    );
    const scrollbar = hunkBodies
      .item(0)
      .querySelector<HTMLDivElement>(".pr-diff-segment-scrollbar");
    const panes = hunkBodies
      .item(0)
      .querySelectorAll<HTMLDivElement>(".pr-diff-split__pane");
    const cells = hunkBodies
      .item(0)
      .querySelectorAll<HTMLDivElement>(".pr-diff-split__cell");
    expect(hunkBodies).toHaveLength(1);
    expect(scrollbar).not.toBeNull();
    expect(panes).toHaveLength(2);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.querySelector(".pr-diff-line__content")).not.toBeNull();
    }
    const oldPane = panes.item(0);
    const newPane = panes.item(1);

    scrollbar!.scrollLeft = 96;
    scrollbar!.dispatchEvent(new Event("scroll"));

    expect(oldPane.scrollLeft).toBe(96);
    expect(newPane.scrollLeft).toBe(96);

    oldPane.scrollLeft = 48;
    oldPane.dispatchEvent(new Event("scroll"));

    expect(newPane.scrollLeft).toBe(48);
    expect(scrollbar!.scrollLeft).toBe(48);

    hunkBodies
      .item(0)
      .dispatchEvent(new WheelEvent("wheel", { deltaY: 24, shiftKey: true }));

    expect(oldPane.scrollLeft).toBe(72);
    expect(newPane.scrollLeft).toBe(72);
    expect(scrollbar!.scrollLeft).toBe(72);
  });

  it("pages the diff body with Ctrl-D and Ctrl-U", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("README.md", "readme")]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="README.md"]')).not.toBeNull();
    });
    click('[data-path="README.md"]');

    const body = document.querySelector<HTMLDivElement>(".pr-diff-fileview");
    if (body === null) {
      throw new Error("missing diff file view");
    }

    Object.defineProperty(body, "clientHeight", {
      configurable: true,
      value: 400,
    });
    body.scrollTop = 0;

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyD",
        ctrlKey: true,
        key: "d",
      }),
    );

    expect(body.scrollTop).toBe(180);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyU",
        ctrlKey: true,
        key: "u",
      }),
    );

    expect(body.scrollTop).toBe(0);

    const filter = document.querySelector<HTMLInputElement>(
      ".pr-browser__filter",
    );
    if (filter === null) {
      throw new Error("missing diff filter input");
    }

    body.scrollTop = 50;
    filter.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "KeyD",
        ctrlKey: true,
        key: "d",
      }),
    );

    expect(body.scrollTop).toBe(50);
  });

  it("loads full file text lazily only after selecting full file mode", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([{ ...textDiffFile("src/app.ts"), full_text: null }]),
    );
    loadPrDiffFileTextMock.mockResolvedValue({
      full_text: 'const lazy = "loaded";',
      full_text_truncated: false,
    });

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    click('[data-path="src"]');
    await waitFor(() => {
      expect(document.querySelector('[data-path="src/app.ts"]')).not.toBeNull();
    });
    click('[data-path="src/app.ts"]');
    expect(loadPrDiffFileTextMock).not.toHaveBeenCalled();

    click('[aria-label="Full file"]');

    await waitFor(() => {
      expect(loadPrDiffFileTextMock).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
      );
      expect(document.body.textContent).toContain("loaded");
    });
  });

  it("loads full file text for large text files without patch chunks", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        {
          ...textDiffFile("src/large.ts"),
          chunks: [],
          full_text: null,
          is_binary: false,
        },
      ]),
    );
    loadPrDiffFileTextMock.mockResolvedValue({
      full_text: "const large = true;",
      full_text_truncated: false,
    });

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    click('[data-path="src"]');
    await waitFor(() => {
      expect(
        document.querySelector('[data-path="src/large.ts"]'),
      ).not.toBeNull();
    });
    click('[data-path="src/large.ts"]');

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "No patch is available for this file. Use full file view.",
      );
    });
    expect(loadPrDiffFileTextMock).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3" }));

    await waitFor(() => {
      expect(loadPrDiffFileTextMock).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/large.ts",
      );
      expect(document.body.textContent).toContain("const large = true;");
    });
  });

  it("supports pointer directory navigation, parent navigation, and selection", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("README.md", "readme"),
        textDiffFile("src/app/App.tsx", "app"),
        textDiffFile("src/lib/document.ts", "document"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    click('[data-path="src"]');
    await waitFor(() => {
      expect(document.body.textContent).toContain("app");
      expect(document.querySelector('[data-path="src/app"]')).not.toBeNull();
      expect(document.querySelector('[data-path="src/lib"]')).not.toBeNull();
    });

    click('[data-path="src/lib"]');
    await waitFor(() => {
      expect(
        document.querySelector('[data-path="src/lib/document.ts"]'),
      ).not.toBeNull();
    });

    click('[data-path="src/lib/document.ts"]');
    await waitFor(() => {
      expect(document.body.textContent).toContain("document");
    });

    click(".file-browser__button--dir");
    await waitFor(() => {
      expect(document.querySelector('[data-path="src/app"]')).not.toBeNull();
    });
  });

  it("supports keyboard directory navigation and mode switching", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("README.md", "readme"),
        textDiffFile("src/app.ts", "app"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    await waitFor(() => {
      expect(document.querySelector('[data-path="src/app.ts"]')).not.toBeNull();
      expect(document.body.textContent).toContain("app");
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Stack diff"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Full file diff"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Left/right diff"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Stack diff"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Full file diff"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "o" }));
    expect(openUrlMock).toHaveBeenCalledWith(
      "https://github.com/tacogips/chilla/pull/12",
    );
  });

  it("shows rename metadata and binary placeholders", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        binaryDiffFile("assets/logo.png"),
        textDiffFile("src/new-name.ts", "renamed", "src/old-name.ts"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="assets"]')).not.toBeNull();
    });

    click('[data-path="assets"]');
    click('[data-path="assets/logo.png"]');
    await waitFor(() => {
      expect(document.body.textContent).toContain("No text diff is available");
    });

    click(".file-browser__button--dir");
    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });
    click('[data-path="src"]');
    await waitFor(() => {
      expect(
        document.querySelector('[data-path="src/new-name.ts"]'),
      ).not.toBeNull();
    });
    click('[data-path="src/new-name.ts"]');

    await waitFor(() => {
      expect(document.body.textContent).toContain("from src/old-name.ts");
      expect(document.body.textContent).toContain("renamed");
    });
  });

  it("renders empty diff state", async () => {
    loadPrDiffMock.mockResolvedValue(snapshot([]));

    renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("No changed files here.");
      expect(document.body.textContent).toContain("No file selected.");
    });
  });
});

describe("buildDirectoryEntries", () => {
  it("projects changed files into the current directory only", () => {
    const entries = buildDirectoryEntries(
      [
        diffFile("README.md", 1, 0),
        diffFile("src/app/App.tsx", 4, 2),
        diffFile("src/lib/document.ts", 3, 1),
      ],
      "",
      "",
    );

    expect(entries).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        fileCount: 2,
        additions: 7,
        deletions: 3,
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        file: diffFile("README.md", 1, 0),
      },
    ]);
  });

  it("filters direct entries by name or path", () => {
    const entries = buildDirectoryEntries(
      [
        diffFile("src/app/App.tsx", 4, 2),
        diffFile("src/lib/document.ts", 3, 1),
      ],
      "src",
      "doc",
    );

    expect(entries.map((entry) => entry.path)).toEqual(["src/lib"]);
  });
});

describe("FullFileDiff", () => {
  it("renders old gutter, new gutter, and content cells in grid order", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const file: PrDiffFile = {
      path: "src/app.ts",
      old_path: null,
      status: PrFileStatus.Modified,
      additions: 1,
      deletions: 1,
      is_binary: false,
      raw_url:
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
      chunks: [
        {
          old_start: 1,
          old_lines: 1,
          new_start: 1,
          new_lines: 1,
          header: "@@ -1 +1 @@",
          changes: [
            {
              change_type: "delete",
              old_line: 1,
              new_line: null,
              content: "old",
            },
            {
              change_type: "add",
              old_line: null,
              new_line: 1,
              content: "new",
            },
          ],
        },
      ],
      full_text: null,
      full_text_truncated: false,
    };

    const dispose = render(() => FullFileDiff({ file }), root);
    const row = document.querySelector(".pr-diff-line--full-file");

    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(3);
    expect(row?.children[0]?.textContent).toBe("");
    expect(row?.children[1]?.textContent).toBe("1");
    expect(row?.children[2]?.classList.contains("pr-diff-line__content")).toBe(
      true,
    );

    dispose();
    document.body.innerHTML = "";
  });

  it("applies extension-based syntax spans to full file content", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const file: PrDiffFile = {
      path: "src/app.ts",
      old_path: null,
      status: PrFileStatus.Modified,
      additions: 1,
      deletions: 0,
      is_binary: false,
      raw_url:
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
      chunks: [],
      full_text: 'const message = "hello";',
      full_text_truncated: false,
    };

    const dispose = render(() => FullFileDiff({ file }), root);

    expect(document.querySelector(".pr-syntax--keyword")?.textContent).toBe(
      "const",
    );
    expect(document.querySelector(".pr-syntax--string")?.textContent).toBe(
      '"hello"',
    );

    dispose();
    document.body.innerHTML = "";
  });

  it("highlights latest full-file changes and shows deletion markers", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const file: PrDiffFile = {
      path: "src/app.ts",
      old_path: null,
      status: PrFileStatus.Modified,
      additions: 2,
      deletions: 2,
      is_binary: false,
      raw_url:
        "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
      chunks: [
        {
          old_start: 1,
          old_lines: 5,
          new_start: 1,
          new_lines: 5,
          header: "@@ -1,5 +1,5 @@",
          changes: [
            {
              change_type: "context",
              old_line: 1,
              new_line: 1,
              content: "same",
            },
            {
              change_type: "delete",
              old_line: 2,
              new_line: null,
              content: "old",
            },
            {
              change_type: "add",
              old_line: null,
              new_line: 2,
              content: "new",
            },
            {
              change_type: "context",
              old_line: 3,
              new_line: 3,
              content: "middle",
            },
            {
              change_type: "add",
              old_line: null,
              new_line: 4,
              content: "inserted",
            },
            {
              change_type: "delete",
              old_line: 4,
              new_line: null,
              content: "removed",
            },
            {
              change_type: "context",
              old_line: 5,
              new_line: 5,
              content: "after",
            },
          ],
        },
      ],
      full_text: ["same", "new", "middle", "inserted", "after"].join("\n"),
      full_text_truncated: false,
    };

    const dispose = render(() => FullFileDiff({ file }), root);

    expect(document.querySelectorAll(".pr-diff-line--modify")).toHaveLength(1);
    expect(
      document.querySelector(".pr-diff-line--modify")?.textContent,
    ).toContain("new");
    expect(document.querySelectorAll(".pr-diff-line--add")).toHaveLength(1);
    expect(document.querySelector(".pr-diff-line--add")?.textContent).toContain(
      "inserted",
    );
    expect(
      document.querySelectorAll(".pr-diff-line--delete-marker"),
    ).toHaveLength(2);
    expect(document.body.textContent).not.toContain("-1");
    expect(document.body.textContent).not.toContain("deleted 1 line");
    expect(document.body.textContent).not.toContain("old");
    expect(document.body.textContent).not.toContain("removed");

    dispose();
    document.body.innerHTML = "";
  });

  it("applies markdown syntax spans to inline code and headings", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const file: PrDiffFile = {
      path: ".agents/skills/rielflow-node-addons/SKILL.md",
      old_path: null,
      status: PrFileStatus.Modified,
      additions: 2,
      deletions: 0,
      is_binary: false,
      raw_url:
        "https://raw.githubusercontent.com/tacogips/rielflow/main/.agents/skills/rielflow-node-addons/SKILL.md",
      chunks: [],
      full_text: [
        "# rielflow node add-ons",
        "- Use `rielflow/codex-sdk-worker` for worker nodes.",
      ].join("\n"),
      full_text_truncated: false,
    };

    const dispose = render(() => FullFileDiff({ file }), root);

    expect(document.querySelector(".pr-syntax--markup")?.textContent).toBe("#");
    expect(document.querySelector(".pr-syntax--string")?.textContent).toBe(
      "`rielflow/codex-sdk-worker`",
    );

    dispose();
    document.body.innerHTML = "";
  });
});
