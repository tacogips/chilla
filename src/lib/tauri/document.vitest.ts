import { describe, expect, it } from "vitest";
import { PrFileStatus } from "./document";
import {
  normalizePrDiffSnapshotPayload,
  normalizeStartupContextPayload,
} from "./document";

describe("normalizeStartupContextPayload", () => {
  it("accepts snake_case directory startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "directory",
          current_directory_path: "/workspace",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("accepts camelCase directory startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "directory",
          currentDirectoryPath: "/workspace",
          selectedFilePath: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("accepts camelCase explicit file-set startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: 2,
          selectedFilePath: "/workspace/a.csv",
          sourceOrderPaths: ["/workspace/a.csv", "/workspace/b.csv"],
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "explicit_file_set",
        file_count: 2,
        selected_file_path: "/workspace/a.csv",
        source_order_paths: ["/workspace/a.csv", "/workspace/b.csv"],
      },
    });
  });

  it("infers the directory path from a selected file when needed", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "directory",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("maps file-style startup payloads to a directory selection", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "file",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("infers Windows drive-root directories from selected files", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "file",
          selectedFilePath: "C:\\dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "C:/",
        selected_file_path: "C:\\dummy.csv",
      },
    });
  });

  it("rejects invalid explicit file-set counts", () => {
    expect(() =>
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: Number.NaN,
          selectedFilePath: "/workspace/a.csv",
          sourceOrderPaths: ["/workspace/a.csv"],
        },
      }),
    ).toThrow("Startup file-set payload is missing required paths");
  });

  it("rejects inconsistent explicit file-set payloads", () => {
    expect(() =>
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: 2,
          selectedFilePath: "/workspace/missing.csv",
          sourceOrderPaths: ["/workspace/a.csv"],
        },
      }),
    ).toThrow("Startup file-set payload contains inconsistent paths");
  });

  it("copies explicit file-set source paths when normalizing", () => {
    const sourceOrderPaths = ["/workspace/a.csv"];
    const context = normalizeStartupContextPayload({
      initialMode: "file_view",
      browserRoot: {
        kind: "explicitFileSet",
        fileCount: 1,
        selectedFilePath: "/workspace/a.csv",
        sourceOrderPaths,
      },
    });

    sourceOrderPaths[0] = "/workspace/changed.csv";

    expect(context.browser_root).toEqual({
      kind: "explicit_file_set",
      file_count: 1,
      selected_file_path: "/workspace/a.csv",
      source_order_paths: ["/workspace/a.csv"],
    });
  });

  it("accepts GitHub PR startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "pr_diff",
        browser_root: {
          kind: "github_pr",
          target: {
            owner: "tacogips",
            repo: "chilla",
            source: {
              kind: "pull_request",
              number: 12,
            },
            url: "https://github.com/tacogips/chilla/pull/12",
            use_cache: false,
          },
        },
      }),
    ).toEqual({
      initial_mode: "pr_diff",
      browser_root: {
        kind: "github_pr",
        target: {
          owner: "tacogips",
          repo: "chilla",
          source: {
            kind: "pull_request",
            number: 12,
          },
          url: "https://github.com/tacogips/chilla/pull/12",
          use_cache: false,
        },
      },
    });
  });

  it("accepts legacy GitHub PR startup payload numbers and defaults cache-enabled", () => {
    const context = normalizeStartupContextPayload({
      initial_mode: "pr_diff",
      browser_root: {
        kind: "github_pr",
        target: {
          owner: "tacogips",
          repo: "rielflow",
          number: 44,
          url: "https://github.com/tacogips/rielflow/pull/44",
        },
      },
    });

    expect(context.browser_root).toEqual({
      kind: "github_pr",
      target: {
        owner: "tacogips",
        repo: "rielflow",
        source: {
          kind: "pull_request",
          number: 44,
        },
        url: "https://github.com/tacogips/rielflow/pull/44",
        use_cache: true,
      },
    });
  });

  it("accepts GitHub commit startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "pr_diff",
        browser_root: {
          kind: "github_pr",
          target: {
            owner: "tacogips",
            repo: "chilla",
            source: {
              kind: "commit",
              sha: "abcdef123456",
            },
            url: "https://github.com/tacogips/chilla/commit/abcdef123456",
          },
        },
      }),
    ).toEqual({
      initial_mode: "pr_diff",
      browser_root: {
        kind: "github_pr",
        target: {
          owner: "tacogips",
          repo: "chilla",
          source: {
            kind: "commit",
            sha: "abcdef123456",
          },
          url: "https://github.com/tacogips/chilla/commit/abcdef123456",
          use_cache: true,
        },
      },
    });
  });

  it("accepts GitHub compare startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "pr_diff",
        browser_root: {
          kind: "github_pr",
          target: {
            owner: "tacogips",
            repo: "chilla",
            source: {
              kind: "compare",
              base: "main",
              head: "feature/pr-diff",
            },
            url: "https://github.com/tacogips/chilla/compare/main...feature/pr-diff",
            useCache: false,
          },
        },
      }),
    ).toEqual({
      initial_mode: "pr_diff",
      browser_root: {
        kind: "github_pr",
        target: {
          owner: "tacogips",
          repo: "chilla",
          source: {
            kind: "compare",
            base: "main",
            head: "feature/pr-diff",
          },
          url: "https://github.com/tacogips/chilla/compare/main...feature/pr-diff",
          use_cache: false,
        },
      },
    });
  });

  it("accepts local Git diff startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "pr_diff",
        browser_root: {
          kind: "git_diff",
          target: {
            repo_path: "/workspace/repo",
            source: {
              kind: "range",
              base: "main",
              head: "feature/local-git",
              merge_base: true,
            },
          },
        },
      }),
    ).toEqual({
      initial_mode: "pr_diff",
      browser_root: {
        kind: "git_diff",
        target: {
          repo_path: "/workspace/repo",
          source: {
            kind: "range",
            base: "main",
            head: "feature/local-git",
            merge_base: true,
          },
        },
      },
    });
  });
});

describe("normalizePrDiffSnapshotPayload", () => {
  it("accepts complete GitHub diff payloads", () => {
    expect(
      normalizePrDiffSnapshotPayload({
        identity: {
          owner: "tacogips",
          repo: "chilla",
          source: {
            kind: "pull_request",
            number: 12,
          },
          url: "https://github.com/tacogips/chilla/pull/12",
          title: "Example",
          state: "open",
          merged: true,
          merged_at: "2026-06-02T03:04:05Z",
          updatedAt: "2026-06-02T03:05:06Z",
          base_branch: "main",
          head_branch: "feature",
        },
        files: [
          {
            path: "src/app.ts",
            old_path: null,
            status: "modified",
            additions: 1,
            deletions: 1,
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
            is_binary: false,
            raw_url:
              "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
            full_text: "new",
            full_text_truncated: false,
          },
        ],
        additions: 1,
        deletions: 1,
        warnings: [],
      }),
    ).toEqual({
      identity: {
        owner: "tacogips",
        repo: "chilla",
        source: {
          kind: "pull_request",
          number: 12,
        },
        url: "https://github.com/tacogips/chilla/pull/12",
        title: "Example",
        state: "open",
        merged: true,
        merged_at: "2026-06-02T03:04:05Z",
        updated_at: "2026-06-02T03:05:06Z",
        base_branch: "main",
        head_branch: "feature",
      },
      files: [
        {
          path: "src/app.ts",
          old_path: null,
          status: PrFileStatus.Modified,
          additions: 1,
          deletions: 1,
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
          is_binary: false,
          raw_url:
            "https://raw.githubusercontent.com/tacogips/chilla/main/src/app.ts",
          full_text: "new",
          full_text_truncated: false,
        },
      ],
      additions: 1,
      deletions: 1,
      warnings: [],
    });
  });

  it("rejects malformed GitHub diff files", () => {
    expect(() =>
      normalizePrDiffSnapshotPayload({
        identity: {
          owner: "tacogips",
          repo: "chilla",
          source: {
            kind: "pull_request",
            number: 12,
          },
          url: "https://github.com/tacogips/chilla/pull/12",
          title: "Example",
          state: null,
          merged: false,
          merged_at: null,
          updated_at: null,
          base_branch: null,
          head_branch: null,
        },
        files: [
          {
            path: "src/app.ts",
            old_path: null,
            status: "unsupported",
            additions: 1,
            deletions: 1,
            chunks: [],
            is_binary: false,
            raw_url: null,
            full_text: null,
            full_text_truncated: false,
          },
        ],
        additions: 1,
        deletions: 1,
        warnings: [],
      }),
    ).toThrow("GitHub diff file payload is missing required fields");
  });
});
