import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import {
  detectGitRepository,
  listDirectory,
  loadGitDiff,
  loadPrDiff,
  loadPrDiffFileText,
  saveDocument,
} from "./document";
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

  it("sends source-aware GitHub diff targets through the Tauri command", async () => {
    const target = {
      owner: "tacogips",
      repo: "chilla",
      source: {
        kind: "pull_request" as const,
        number: 12,
      },
      url: "https://github.com/tacogips/chilla/pull/12",
      use_cache: false,
    };
    const response = {
      identity: {
        owner: target.owner,
        repo: target.repo,
        source: target.source,
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

  it("sends commit and compare targets without rewriting source identity", async () => {
    const commitTarget = {
      owner: "tacogips",
      repo: "chilla",
      source: {
        kind: "commit" as const,
        sha: "abcdef123456",
      },
      url: "https://github.com/tacogips/chilla/commit/abcdef123456",
      use_cache: true,
    };
    const compareTarget = {
      owner: "tacogips",
      repo: "chilla",
      source: {
        kind: "compare" as const,
        base: "main",
        head: "feature/pr-diff",
      },
      url: "https://github.com/tacogips/chilla/compare/main...feature/pr-diff",
      use_cache: false,
    };
    const response = {
      identity: {
        owner: "tacogips",
        repo: "chilla",
        source: commitTarget.source,
        url: commitTarget.url,
        title: "Example",
        state: null,
        merged: false,
        merged_at: null,
        updated_at: null,
        base_branch: null,
        head_branch: null,
      },
      files: [],
      additions: 0,
      deletions: 0,
      warnings: [],
    };
    invokeMock.mockResolvedValue(response);

    await loadPrDiff(commitTarget);
    await loadPrDiff(compareTarget);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_pr_diff", {
      target: commitTarget,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "load_pr_diff", {
      target: compareTarget,
    });
  });
});

describe("saveDocument", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the expected revision token with the save payload", async () => {
    const response = {
      path: "/workspace/README.md",
      file_name: "README.md",
      source_text: "# Updated\n",
      source_html: "<pre></pre>",
      html: "<h1>Updated</h1>",
      headings: [],
      revision_token: "next-revision",
      last_modified: "1",
    };
    invokeMock.mockResolvedValue(response);

    await expect(
      saveDocument("/workspace/README.md", "# Updated\n", "current-revision"),
    ).resolves.toEqual(response);

    expect(invokeMock).toHaveBeenCalledWith("save_document", {
      path: "/workspace/README.md",
      sourceText: "# Updated\n",
      expectedRevisionToken: "current-revision",
    });
  });
});

describe("loadGitDiff", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends local Git diff targets through the Tauri command", async () => {
    const target = {
      repo_path: "/workspace/repo",
      source: {
        kind: "worktree" as const,
      },
    };
    const response = {
      identity: {
        owner: "local",
        repo: "repo",
        source: {
          kind: "git_worktree",
          repo_path: "/workspace/repo",
        },
        url: "/workspace/repo",
        title: "Uncommitted changes in /workspace/repo",
        state: "uncommitted",
        merged: false,
        merged_at: null,
        updated_at: null,
        base_branch: null,
        head_branch: null,
      },
      files: [],
      additions: 0,
      deletions: 0,
      warnings: [],
    };
    invokeMock.mockResolvedValue(response);

    await expect(loadGitDiff(target)).resolves.toEqual(response);

    expect(invokeMock).toHaveBeenCalledWith("load_git_diff", {
      target,
    });
  });
});

describe("detectGitRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("normalizes detected local Git worktree targets", async () => {
    const response = {
      repo_path: "/workspace/repo",
      source: {
        kind: "worktree",
      },
    };
    invokeMock.mockResolvedValue(response);

    await expect(detectGitRepository("/workspace/repo/src")).resolves.toEqual(
      response,
    );

    expect(invokeMock).toHaveBeenCalledWith("detect_git_repository", {
      path: "/workspace/repo/src",
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
