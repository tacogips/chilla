import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createComponent, createSignal, Show } from "solid-js";
import {
  createKeymapController,
  KeymapContextProvider,
  KeymapPopup,
} from "../keymap/KeymapProvider";
import type {
  GitDiffTarget,
  GitHubDiffSource,
  GitHubPrTarget,
  PrDiffFile,
  PrDiffSnapshot,
} from "../../lib/tauri/document";
import { PrFileStatus } from "../../lib/tauri/document";

const loadPrDiffMock = vi.hoisted(() => vi.fn());
const loadPrDiffFileTextMock = vi.hoisted(() => vi.fn());
const loadGitDiffMock = vi.hoisted(() => vi.fn());
const loadGitDiffFileTextMock = vi.hoisted(() => vi.fn());
const openUrlMock = vi.hoisted(() => vi.fn());
const getKeymapConfigMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/tauri/keymap", () => ({
  getKeymapConfig: getKeymapConfigMock,
}));

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
    loadGitDiff: loadGitDiffMock,
    loadGitDiffFileText: loadGitDiffFileTextMock,
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

const gitTarget: GitDiffTarget = {
  repo_path: "/workspace/repo",
  source: {
    kind: "worktree",
  },
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

function svgDiffFile(
  path = "icon.svg",
  fullText:
    | string
    | null = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" /></svg>',
): PrDiffFile {
  return {
    ...textDiffFile(path, "<svg>"),
    full_text: fullText,
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
  let reload: (() => Promise<void>) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    loadPrDiffMock.mockReset();
    loadPrDiffFileTextMock.mockReset();
    loadPrDiffFileTextMock.mockResolvedValue({
      full_text: "",
      full_text_truncated: false,
    });
    loadGitDiffMock.mockReset();
    loadGitDiffFileTextMock.mockReset();
    loadGitDiffFileTextMock.mockResolvedValue({
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
      () =>
        PrDiffWorkspace({
          target: { kind: "github", target },
          onReloadReady: (next) => {
            reload = next;
          },
        }),
      root,
    );
  }

  function renderGitWorkspace(): void {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }
    dispose = render(
      () => PrDiffWorkspace({ target: { kind: "git", target: gitTarget } }),
      root,
    );
  }

  it("reloads fresh data while preserving Tree selection, expansions and filter; removed selections clear", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("src/note.md", "old text")]),
    );
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="src"]')).not.toBeNull(),
    );
    click('[data-path="src"]');
    click('[data-path="src/note.md"]');
    click('[aria-label="Show filter"]');
    const input = document.querySelector<HTMLInputElement>(
      '[aria-label="Filter changed files"]',
    );
    if (input === null) throw new Error("missing filter");
    input.value = "note";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("src/note.md", "fresh text")]),
    );
    await reload?.();
    expect(loadPrDiffMock).toHaveBeenLastCalledWith({
      ...target,
      use_cache: false,
    });
    expect(document.querySelector('[role="tree"]')).not.toBeNull();
    expect(input.value).toBe("note");
    expect(document.body.textContent).toContain("fresh text");
    loadPrDiffMock.mockResolvedValue(snapshot([textDiffFile("elsewhere.md")]));
    await reload?.();
    expect(document.body.textContent).toContain("No file selected.");
  });

  it("ignores overlapping reloads and preserves last success on failure with Retry", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("note.md", "initial")]),
    );
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="note.md"]')).not.toBeNull(),
    );
    click('[data-path="note.md"]');
    let finishOld: ((value: PrDiffSnapshot) => void) | undefined;
    loadPrDiffMock.mockImplementationOnce(
      () =>
        new Promise<PrDiffSnapshot>((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = reload?.();
    loadPrDiffMock.mockResolvedValueOnce(
      snapshot([textDiffFile("note.md", "newest")]),
    );
    await reload?.();
    finishOld?.(snapshot([textDiffFile("note.md", "stale data")]));
    await old;
    expect(document.body.textContent).toContain("newest");
    expect(document.body.textContent).not.toContain("stale data");
    loadPrDiffMock.mockRejectedValueOnce(new Error("Reload failed"));
    await reload?.();
    expect(document.body.textContent).toContain("newest");
    expect(document.body.textContent).toContain("Reload failed");
    loadPrDiffMock.mockResolvedValueOnce(
      snapshot([textDiffFile("note.md", "retried")]),
    );
    click(".pr-diff-retry button");
    await waitFor(() => expect(document.body.textContent).toContain("retried"));
    dispose?.();
    dispose = undefined;
    expect(reload).toBeNull();
  });

  it("does not fetch old lazy content during refresh and ignores prior lazy results", async () => {
    const lazyFile = { ...textDiffFile("note.md"), full_text: null };
    loadPrDiffMock.mockResolvedValue(snapshot([lazyFile]));
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="note.md"]')).not.toBeNull(),
    );
    click('[data-path="note.md"]');
    let finishText:
      | ((value: { full_text: string; full_text_truncated: boolean }) => void)
      | undefined;
    loadPrDiffFileTextMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishText = resolve;
        }),
    );
    click('[aria-label="Full file"]');
    expect(loadPrDiffFileTextMock).toHaveBeenCalledTimes(1);
    let finishReload: ((value: PrDiffSnapshot) => void) | undefined;
    loadPrDiffMock.mockImplementationOnce(
      () =>
        new Promise<PrDiffSnapshot>((resolve) => {
          finishReload = resolve;
        }),
    );
    const refreshing = reload?.();
    click('[aria-label="Left/right diff"]');
    click('[aria-label="Full file"]');
    expect(loadPrDiffFileTextMock).toHaveBeenCalledTimes(1);
    finishReload?.(snapshot([textDiffFile("note.md", "fresh full content")]));
    await refreshing;
    finishText?.({
      full_text: "outdated lazy text",
      full_text_truncated: false,
    });
    await Promise.resolve();
    expect(document.body.textContent).toContain("fresh full content");
    expect(document.body.textContent).not.toContain("outdated lazy text");
  });

  it("disposes stale target loads when keyed diff targets change without clearing the new reload callback", async () => {
    let finishOld: ((value: PrDiffSnapshot) => void) | undefined;
    loadPrDiffMock.mockImplementationOnce(
      () =>
        new Promise<PrDiffSnapshot>((resolve) => {
          finishOld = resolve;
        }),
    );
    let switchTarget: ((next: GitHubPrTarget) => void) | undefined;
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing root");
    dispose = render(() => {
      const [active, setActive] = createSignal(target);
      switchTarget = (next) => {
        setActive(next);
      };
      return Show({
        get when() {
          return active();
        },
        keyed: true,
        children: (next: GitHubPrTarget) =>
          createComponent(PrDiffWorkspace, {
            target: { kind: "github", target: next },
            onReloadReady: (ready) => {
              reload = ready;
            },
          }),
      });
    }, root);
    loadPrDiffMock.mockResolvedValue(snapshot([textDiffFile("new-target.md")]));
    switchTarget?.({ ...target, source: { kind: "pull_request", number: 2 } });
    await waitFor(() =>
      expect(document.body.textContent).toContain("new-target.md"),
    );
    finishOld?.(snapshot([textDiffFile("obsolete-target.md")]));
    await Promise.resolve();
    expect(document.body.textContent).not.toContain("obsolete-target.md");
    expect(reload).not.toBeNull();
    await reload?.();
    expect(loadPrDiffMock).toHaveBeenLastCalledWith({
      ...target,
      source: { kind: "pull_request", number: 2 },
      use_cache: false,
    });
  });

  it("dispatches configured diff sequences with dynamic help and no legacy mode/view shortcuts", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("README.md", "readme")]),
    );
    getKeymapConfigMock.mockResolvedValue({
      path: null,
      error: null,
      config: {
        mgr: {
          keymap: [
            { on: ["v", "s"], run: "diff.view.stack", desc: "My stacked view" },
            { on: "x", run: "view.toggle", desc: "My browser view" },
          ],
        },
        workspace: { keymap: [] },
      },
    });
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing root");
    dispose = render(() => {
      const controller = createKeymapController();
      return createComponent(KeymapContextProvider.Provider, {
        value: controller,
        get children() {
          return [
            PrDiffWorkspace({ target: { kind: "github", target } }),
            createComponent(KeymapPopup, { controller }),
          ];
        },
      });
    }, root);
    await waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[aria-label="Tree"]')?.title,
      ).toBe("Tree view (x toggles)"),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-path="README.md"]')).not.toBeNull(),
    );
    click('[data-path="README.md"]');
    for (const key of ["t", "2", "Tab"])
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    expect(document.querySelector('[role="tree"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Stack diff"]')).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    expect(document.querySelector(".keymap-popup")?.textContent).toContain(
      "My stacked view",
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    expect(document.querySelector(".keymap-popup")).toBeNull();
    await waitFor(() =>
      expect(
        document.querySelector('[aria-label="Stack diff"]'),
      ).not.toBeNull(),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    expect(document.querySelector('[role="tree"]')).toBeNull();
  });

  it("retries after an error and renders the resolved diff", async () => {
    const notifications = document.createElement("div");
    notifications.id = "workspace-notifications";
    document.body.append(notifications);
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

    expect(
      notifications.querySelector(".workspace-notification"),
    ).not.toBeNull();
    click('[aria-label="Close notification"]');
    expect(document.querySelector(".workspace-notification")).toBeNull();
    expect(document.querySelector(".pr-diff-retry button")).not.toBeNull();
    const retry = document.querySelector<HTMLButtonElement>(
      ".pr-diff-retry button",
    );
    retry?.focus();
    for (const key of ["Enter", " ", "Tab"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      retry?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    click(".pr-diff-retry button");

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

  it("navigates file diffs in path order and selects the visible tree item", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("src/z-last.ts", "last"),
        textDiffFile("README.md", "readme"),
        textDiffFile("src/a-first.ts", "first"),
      ]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("No file selected.");
      expect(document.querySelector('[data-path="README.md"]')).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: ">" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("readme");
      expect(
        document
          .querySelector('[data-path="README.md"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: ">" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("first");
      expect(document.querySelector(".pr-browser__path")?.textContent).toBe(
        "/",
      );
      expect(
        document
          .querySelector('[data-path="src/a-first.ts"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: ">" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("last");
      expect(
        document
          .querySelector('[data-path="src/z-last.ts"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "<" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("first");
      expect(
        document
          .querySelector('[data-path="src/a-first.ts"]')
          ?.classList.contains("file-browser__button--active"),
      ).toBe(true);
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

    click('[aria-label="Show filter"]');
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

  it("loads full file text lazily for local Git diff targets without a raw URL", async () => {
    loadGitDiffMock.mockResolvedValue(
      snapshot(
        [{ ...textDiffFile("src/app.ts"), raw_url: null, full_text: null }],
        { kind: "git_worktree", repo_path: gitTarget.repo_path },
        gitTarget.repo_path,
      ),
    );
    loadGitDiffFileTextMock.mockResolvedValue({
      full_text: 'const lazy = "loaded";',
      full_text_truncated: false,
    });

    renderGitWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    click('[data-path="src"]');
    await waitFor(() => {
      expect(document.querySelector('[data-path="src/app.ts"]')).not.toBeNull();
    });
    click('[data-path="src/app.ts"]');
    expect(loadGitDiffFileTextMock).not.toHaveBeenCalled();
    expect(loadPrDiffFileTextMock).not.toHaveBeenCalled();

    click('[aria-label="Full file"]');

    await waitFor(() => {
      expect(loadGitDiffFileTextMock).toHaveBeenCalledWith(
        gitTarget,
        "src/app.ts",
      );
      expect(document.body.textContent).toContain("loaded");
    });
    expect(loadPrDiffFileTextMock).not.toHaveBeenCalled();
  });

  it("skips lazy loading for deleted files in Git diff targets", async () => {
    loadGitDiffMock.mockResolvedValue(
      snapshot(
        [
          {
            ...textDiffFile("src/removed.ts"),
            raw_url: null,
            full_text: null,
            status: PrFileStatus.Deleted,
          },
        ],
        { kind: "git_worktree", repo_path: gitTarget.repo_path },
        gitTarget.repo_path,
      ),
    );

    renderGitWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="src"]')).not.toBeNull();
    });

    click('[data-path="src"]');
    await waitFor(() => {
      expect(
        document.querySelector('[data-path="src/removed.ts"]'),
      ).not.toBeNull();
    });
    click('[data-path="src/removed.ts"]');
    click('[aria-label="Full file"]');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadGitDiffFileTextMock).not.toHaveBeenCalled();
  });

  it("shows image mode only for SVG paths and renders encoded SVG content", async () => {
    const svgText =
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="12">safe &amp; isolated</text></svg>';
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("README.md"), svgDiffFile("ICON.SVG", svgText)]),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(document.querySelector('[data-path="ICON.SVG"]')).not.toBeNull();
    });
    expect(document.querySelector('[aria-label="SVG image"]')).toBeNull();

    click('[data-path="ICON.SVG"]');
    await waitFor(() => {
      expect(document.querySelector('[aria-label="SVG image"]')).not.toBeNull();
    });
    click('[aria-label="SVG image"]');

    await waitFor(() => {
      const image = document.querySelector<HTMLImageElement>(
        '.pr-diff-image img[alt="Rendered preview of ICON.SVG"]',
      );
      expect(image?.getAttribute("src")).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`,
      );
      expect(document.querySelector(".pr-diff-image svg")).toBeNull();
    });
  });

  it("loads complete SVG text lazily when image mode is selected", async () => {
    const svgText =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>';
    let resolveText!: (value: {
      readonly full_text: string;
      readonly full_text_truncated: boolean;
    }) => void;
    loadPrDiffMock.mockResolvedValue(snapshot([svgDiffFile("icon.svg", null)]));
    loadPrDiffFileTextMock.mockReturnValue(
      new Promise((resolve) => {
        resolveText = resolve;
      }),
    );

    renderWorkspace();
    await waitFor(() => {
      expect(document.querySelector('[data-path="icon.svg"]')).not.toBeNull();
    });
    click('[data-path="icon.svg"]');
    click('[aria-label="SVG image"]');

    await waitFor(() => {
      expect(loadPrDiffFileTextMock).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/tacogips/chilla/main/icon.svg",
      );
      expect(document.body.textContent).toContain("Loading SVG image...");
      expect(document.querySelector(".pr-diff-image img")).toBeNull();
    });

    resolveText({ full_text: svgText, full_text_truncated: false });
    await waitFor(() => {
      expect(
        document.querySelector<HTMLImageElement>(".pr-diff-image img")?.src,
      ).toContain(encodeURIComponent(svgText));
    });
  });

  it("shows explicit SVG image fallbacks for load failures and truncated content", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        svgDiffFile("broken.svg", null),
        {
          ...svgDiffFile("truncated.svg"),
          full_text_truncated: true,
        },
      ]),
    );
    loadPrDiffFileTextMock.mockRejectedValue(new Error("raw content failed"));

    renderWorkspace();
    await waitFor(() => {
      expect(document.querySelector('[data-path="broken.svg"]')).not.toBeNull();
    });
    click('[data-path="broken.svg"]');
    click('[aria-label="SVG image"]');
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "Unable to load SVG image: raw content failed",
      );
      expect(document.querySelector(".pr-diff-image img")).toBeNull();
    });

    click('[data-path="truncated.svg"]');
    click('[aria-label="SVG image"]');
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "SVG image preview is unavailable because the file content is truncated.",
      );
      expect(document.querySelector(".pr-diff-image img")).toBeNull();
    });
  });

  it("shows explicit unavailable SVG image fallbacks", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        {
          ...svgDiffFile("deleted.svg", null),
          status: PrFileStatus.Deleted,
          raw_url: null,
        },
        {
          ...svgDiffFile("unavailable.svg", null),
          raw_url: null,
        },
      ]),
    );

    renderWorkspace();
    await waitFor(() => {
      expect(
        document.querySelector('[data-path="deleted.svg"]'),
      ).not.toBeNull();
    });
    click('[data-path="deleted.svg"]');
    click('[aria-label="SVG image"]');
    expect(document.body.textContent).toContain(
      "SVG image preview is unavailable for deleted files.",
    );

    click('[data-path="unavailable.svg"]');
    click('[aria-label="SVG image"]');
    expect(document.body.textContent).toContain(
      "SVG image content is unavailable.",
    );
    expect(loadPrDiffFileTextMock).not.toHaveBeenCalled();
  });

  it("supports shortcut 4 and SVG-aware Tab cycling", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([svgDiffFile("icon.svg"), textDiffFile("plain.txt")]),
    );

    renderWorkspace();
    await waitFor(() => {
      expect(document.querySelector('[data-path="icon.svg"]')).not.toBeNull();
    });
    click('[data-path="icon.svg"]');

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "4" }));
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="SVG image review"]'),
      ).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(
      document.querySelector('[aria-label="Left/right diff"]'),
    ).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.querySelector('[aria-label="Stack diff"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(
      document.querySelector('[aria-label="Full file diff"]'),
    ).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(
      document.querySelector('[aria-label="SVG image review"]'),
    ).not.toBeNull();

    click('[data-path="plain.txt"]');
    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Left/right diff"]'),
      ).not.toBeNull();
      expect(document.querySelector('[aria-label="SVG image"]')).toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "4" }));
    expect(
      document.querySelector('[aria-label="Left/right diff"]'),
    ).not.toBeNull();
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
    click('[aria-label="List"]');

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
    click('[aria-label="List"]');

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

  it.each(["git", "pr"])(
    "toggles %s diff Tree with plain t and ignores typing and modified keys",
    async (kind) => {
      const files = snapshot([textDiffFile("src/app.ts", "preview")]);
      loadGitDiffMock.mockResolvedValue(files);
      loadPrDiffMock.mockResolvedValue(files);
      if (kind === "git") renderGitWorkspace();
      else renderWorkspace();
      await waitFor(() =>
        expect(document.querySelector('[role="tree"]')).not.toBeNull(),
      );
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
        expect(document.querySelector('[role="tree"]')).not.toBeNull();
      }
      click('[aria-label="Show filter"]');
      const input = document.querySelector("input");
      expect(input).not.toBeNull();
      input?.dispatchEvent(shortcut());
      expect(document.querySelector('[role="tree"]')).not.toBeNull();
      const toggle = document.querySelector<HTMLButtonElement>(
        '[aria-label="List"]',
      );
      expect(toggle?.title).toBe("List view (t toggles)");
      toggle?.dispatchEvent(shortcut());
      expect(document.querySelector('[role="tree"]')).toBeNull();
      expect(toggle?.getAttribute("aria-pressed")).toBe("true");
      window.dispatchEvent(shortcut());
      expect(document.querySelector('[role="tree"]')).not.toBeNull();
    },
  );

  it("isolates the folded browser while preserving diff scrolling, modes and file navigation", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([textDiffFile("a.md", "first"), textDiffFile("b.md", "second")]),
    );
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing root");
    const [visible, setVisible] = createSignal(true);
    dispose = render(
      () =>
        PrDiffWorkspace({
          target: { kind: "github", target },
          get isFileTreeOpen() {
            return visible();
          },
        }),
      root,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-path="a.md"]')).not.toBeNull(),
    );
    click('[data-path="a.md"]');
    const browser = document.querySelector<HTMLElement>(".pr-browser");
    const selectedPath = () =>
      browser
        ?.querySelector('[aria-selected="true"]')
        ?.getAttribute("data-path");
    expect(selectedPath()).toBe("a.md");
    const pane = document.querySelector<HTMLElement>(".pr-diff-pane");
    setVisible(false);
    pane?.focus();
    for (const key of ["ArrowRight", "Enter", "f", "t", "h", "l"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    expect(browser?.hidden).toBe(true);
    expect(browser?.inert).toBe(true);
    expect(browser?.querySelector("input")).toBeNull();
    expect(browser?.querySelector('[role="tree"]')).not.toBeNull();
    expect(selectedPath()).toBe("a.md");
    const fileView = document.querySelector<HTMLElement>(".pr-diff-fileview");
    expect(fileView).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(fileView?.scrollTop).toBeGreaterThan(0);
    expect(selectedPath()).toBe("a.md");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(fileView?.scrollTop).toBe(0);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true }),
    );
    expect(fileView?.scrollTop).toBeGreaterThan(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    expect(
      document
        .querySelector('[aria-label="Stack"]')
        ?.classList.contains("workspace__mode--active"),
    ).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ">" }));
    await waitFor(() =>
      expect(document.querySelector(".pr-diff-pane")?.textContent).toContain(
        "second",
      ),
    );
    await Promise.resolve();
    expect(document.activeElement).toBe(pane);
    setVisible(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(browser?.querySelector("input")),
    );
  });

  it("defaults Git diff to a tree and preserves the preview while collapsing folders", async () => {
    loadGitDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("src/deep/app.ts", "nested preview"),
        textDiffFile("README.md", "readme"),
      ]),
    );
    renderGitWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="src"]')).not.toBeNull(),
    );
    expect(
      document
        .querySelector('[aria-label="Tree"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(document.querySelector('[role="tree"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(document.querySelector('[data-path="src/deep"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(
      document
        .querySelector('[data-path="src/deep/app.ts"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      document
        .querySelector('[data-path="src/deep/app.ts"]')
        ?.getAttribute("aria-level"),
    ).toBe("3");
    expect(document.body.textContent).toContain("nested preview");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(document.querySelector('[data-path="src/deep/app.ts"]')).toBeNull();
    expect(document.body.textContent).toContain("nested preview");
    expect(document.querySelector(".pr-browser__path")?.textContent).toBe("/");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(
      document
        .querySelector('[data-path="README.md"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("keeps DOM focus and the tree cursor together through expansion and collapse", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("src/deep/app.ts", "app"),
        textDiffFile("README.md", "readme"),
      ]),
    );
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="src"]')).not.toBeNull(),
    );
    const focusRow = (path: string) => {
      const row = document.querySelector<HTMLButtonElement>(
        `[data-path="${path}"]`,
      );
      if (row === null) throw new Error(`missing row ${path}`);
      row.focus();
      return row;
    };
    const press = async (key: string, expectedPath: string) => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("data-path")).toBe(
          expectedPath,
        ),
      );
      expect(
        document.querySelectorAll('[role="treeitem"][tabindex="0"]'),
      ).toHaveLength(1);
      expect(document.activeElement?.getAttribute("aria-selected")).toBe(
        "true",
      );
    };
    focusRow("src");
    await press("ArrowRight", "src");
    expect(document.querySelector('[data-path="src/deep"]')).not.toBeNull();
    await press("ArrowDown", "src/deep");
    await press("ArrowRight", "src/deep");
    await press("ArrowRight", "src/deep/app.ts");
    await press("ArrowLeft", "src/deep");
    await press("ArrowLeft", "src/deep");
    expect(document.querySelector('[data-path="src/deep/app.ts"]')).toBeNull();
    focusRow("README.md");
    await press("Enter", "README.md");
    expect(document.body.textContent).toContain("readme");
    expect(
      document
        .querySelector('[data-path="src/deep"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it.each(["/", "f"])(
    "shows an icon toolbar and reveals filtering with %s and focus restoration",
    async (filterKey) => {
      loadPrDiffMock.mockResolvedValue(
        snapshot([textDiffFile("README.md", "readme")]),
      );
      renderWorkspace();
      await waitFor(() =>
        expect(
          document.querySelector('[data-path="README.md"]'),
        ).not.toBeNull(),
      );
      expect(document.querySelector(".pr-browser__filter")).toBeNull();
      for (const label of ["List", "Tree", "Show filter"]) {
        const button = document.querySelector<HTMLButtonElement>(
          `[aria-label="${label}"]`,
        );
        expect(button?.textContent?.trim()).toBe("");
        expect(button?.querySelector("svg")).not.toBeNull();
        expect(button?.title).not.toBe("");
      }
      const filterButton = document.querySelector<HTMLButtonElement>(
        '[aria-label="Show filter"]',
      );
      click('[aria-label="Show filter"]');
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
          "Filter changed files",
        ),
      );
      const input = document.querySelector<HTMLInputElement>(
        ".pr-browser__filter",
      );
      if (input === null) throw new Error("missing filter");
      expect(filterButton?.getAttribute("aria-controls")).toBe(input.id);
      input.value = "README";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      filterButton?.click();
      await Promise.resolve();
      expect(input.value).toBe("README");
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(6);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("data-path")).toBe(
          "README.md",
        ),
      );
      expect(document.querySelector(".pr-browser__filter")).toBeNull();
      expect(filterButton?.getAttribute("aria-expanded")).toBe("false");
      for (const modifiers of [
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true },
        { shiftKey: true },
        { isComposing: true },
      ]) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: filterKey, ...modifiers }),
        );
        expect(document.querySelector(".pr-browser__filter")).toBeNull();
      }
      const list = document.querySelector<HTMLButtonElement>(
        '[aria-label="List"]',
      );
      list?.focus();
      list?.dispatchEvent(
        new KeyboardEvent("keydown", { key: filterKey, bubbles: true }),
      );
      await waitFor(() =>
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
          "Filter changed files",
        ),
      );
      expect(
        document.querySelector<HTMLInputElement>(".pr-browser__filter")?.value,
      ).toBe("");
      expect(filterButton?.getAttribute("aria-expanded")).toBe("true");
    },
  );

  it("returns filter focus to its icon when no changed rows exist", async () => {
    loadPrDiffMock.mockResolvedValue(snapshot([]));
    renderWorkspace();
    await waitFor(() =>
      expect(document.body.textContent).toContain("No changed files here."),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Filter changed files",
      ),
    );
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Show filter",
      ),
    );
    expect(document.querySelector(".pr-browser__filter")).toBeNull();
  });

  it("reveals filtered deleted paths and ancestors without changing stored expansion", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        {
          ...textDiffFile("src/removed/gone.ts", "deleted"),
          status: PrFileStatus.Deleted,
        },
        textDiffFile("src/keep.ts", "keep"),
        textDiffFile("other.ts", "other"),
      ]),
    );
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="src"]')).not.toBeNull(),
    );
    click('[aria-label="Show filter"]');
    const input = document.querySelector<HTMLInputElement>(
      ".pr-browser__filter",
    );
    if (input === null) throw new Error("missing filter");
    input.value = "gone";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      Array.from(document.querySelectorAll("[data-path]")).map((row) =>
        row.getAttribute("data-path"),
      ),
    ).toEqual(["src", "src/removed", "src/removed/gone.ts"]);
    click('[data-path="src/removed/gone.ts"]');
    expect(document.body.textContent).toContain("deleted");
    expect(document.querySelector('[data-path="src"]')?.textContent).toContain(
      "2 files",
    );
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector('[data-path="src/removed"]')).toBeNull();
    expect(document.querySelector(".pr-browser__path")?.textContent).toBe("/");
  });

  it("roots Tree at the current List directory and reveals next files within that root", async () => {
    loadPrDiffMock.mockResolvedValue(
      snapshot([
        textDiffFile("src/a.ts", "first"),
        textDiffFile("src/deep/b.ts", "second"),
        textDiffFile("outside.ts", "outside"),
      ]),
    );
    renderWorkspace();
    await waitFor(() =>
      expect(document.querySelector('[data-path="src"]')).not.toBeNull(),
    );
    click('[aria-label="List"]');
    click('[data-path="src"]');
    click('[data-path="src/a.ts"]');
    click('[aria-label="Tree"]');
    expect(document.querySelector(".pr-browser__path")?.textContent).toBe(
      "src",
    );
    expect(document.querySelector('[data-path="outside.ts"]')).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ">" }));
    expect(
      document
        .querySelector('[data-path="src/deep/b.ts"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.querySelector(".pr-browser__path")?.textContent).toBe(
      "src",
    );
    click('[aria-label="List"]');
    expect(document.querySelector(".pr-browser__path")?.textContent).toBe(
      "src",
    );
    expect(document.querySelector('[data-path="src/deep/b.ts"]')).toBeNull();
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

  it("applies requested language syntax spans to full file content", () => {
    const cases: readonly {
      readonly path: string;
      readonly content: string;
      readonly keyword: string;
      readonly comment: string;
    }[] = [
      {
        path: "src/App.java",
        content: "public class App { // java comment",
        keyword: "public",
        comment: "// java comment",
      },
      {
        path: "src/App.scala",
        content: "object App extends Runnable // scala comment",
        keyword: "object",
        comment: "// scala comment",
      },
      {
        path: "src/app.lisp",
        content: "(defun app () ; lisp comment",
        keyword: "defun",
        comment: "; lisp comment",
      },
      {
        path: "src/app.rb",
        content: "class App # ruby comment",
        keyword: "class",
        comment: "# ruby comment",
      },
      {
        path: "src/app.py",
        content: "def app(): # python comment",
        keyword: "def",
        comment: "# python comment",
      },
      {
        path: "src/app.c",
        content: "static int app(void) { // c comment",
        keyword: "static",
        comment: "// c comment",
      },
      {
        path: "src/app.cpp",
        content: "namespace app { // cpp comment",
        keyword: "namespace",
        comment: "// cpp comment",
      },
      {
        path: "src/app.zig",
        content: "pub fn app() void { // zig comment",
        keyword: "pub",
        comment: "// zig comment",
      },
      {
        path: "src/App.vue",
        content: "<template><!-- vue comment",
        keyword: "template",
        comment: "<!-- vue comment",
      },
      {
        path: "db/migration.sql",
        content: "SELECT id FROM users -- sql comment",
        keyword: "SELECT",
        comment: "-- sql comment",
      },
      {
        path: "build.gradle",
        content: "plugins { // gradle comment",
        keyword: "plugins",
        comment: "// gradle comment",
      },
      {
        path: "config/application.xml",
        content: '<?xml version="1.0"?><!-- xml comment',
        keyword: "xml",
        comment: "<!-- xml comment",
      },
      {
        path: "assets/icon.svg",
        content: "<svg><!-- svg comment",
        keyword: "svg",
        comment: "<!-- svg comment",
      },
      {
        path: "config/application.properties",
        content: "enabled=true # properties comment",
        keyword: "true",
        comment: "# properties comment",
      },
      {
        path: "proto/service.proto",
        content: "message User { // proto comment",
        keyword: "message",
        comment: "// proto comment",
      },
      {
        path: "flake.nix",
        content: "let value = true; # nix comment",
        keyword: "let",
        comment: "# nix comment",
      },
      {
        path: "Dockerfile",
        content: "FROM alpine # docker comment",
        keyword: "FROM",
        comment: "# docker comment",
      },
      {
        path: "Makefile",
        content: "include common.mk # make comment",
        keyword: "include",
        comment: "# make comment",
      },
      {
        path: "src/Main.hs",
        content: "module Main where -- haskell comment",
        keyword: "module",
        comment: "-- haskell comment",
      },
      {
        path: "src/App.swift",
        content: 'struct App { let title = "chilla" // swift comment',
        keyword: "struct",
        comment: "// swift comment",
      },
    ];

    for (const testCase of cases) {
      document.body.innerHTML = '<div id="root"></div>';
      const root = document.getElementById("root");

      if (root === null) {
        throw new Error("missing test root");
      }

      const file: PrDiffFile = {
        path: testCase.path,
        old_path: null,
        status: PrFileStatus.Modified,
        additions: 1,
        deletions: 0,
        is_binary: false,
        raw_url: `https://raw.githubusercontent.com/tacogips/chilla/main/${testCase.path}`,
        chunks: [],
        full_text: testCase.content,
        full_text_truncated: false,
      };

      const dispose = render(() => FullFileDiff({ file }), root);

      const keywordTexts = Array.from(
        document.querySelectorAll(".pr-syntax--keyword"),
      ).map((element) => element.textContent);
      const commentTexts = Array.from(
        document.querySelectorAll(".pr-syntax--comment"),
      ).map((element) => element.textContent);

      expect(keywordTexts).toContain(testCase.keyword);
      expect(commentTexts).toContain(testCase.comment);

      dispose();
      document.body.innerHTML = "";
    }
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
