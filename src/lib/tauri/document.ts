import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type RevisionToken = string;
export type WorkspaceMode = "markdown" | "file_view" | "pr_diff";
/** Raw vs formatted/rendered presentation (Markdown and CSV file preview). */
export type DocumentPresentationMode = "raw" | "formatted";

export interface HeadingNode {
  readonly level: number;
  readonly title: string;
  readonly anchor_id: string;
  readonly line_start: number;
  readonly children: readonly HeadingNode[];
}

export interface DocumentSnapshot {
  readonly path: string;
  readonly file_name: string;
  readonly source_text: string;
  readonly source_html: string;
  readonly html: string;
  readonly headings: readonly HeadingNode[];
  readonly revision_token: RevisionToken;
  readonly last_modified: string;
}

export interface StartupContext {
  readonly initial_mode: WorkspaceMode;
  readonly browser_root: BrowserRoot;
}

export type GitHubDiffSource =
  | {
      readonly kind: "pull_request";
      readonly number: number;
    }
  | {
      readonly kind: "commit";
      readonly sha: string;
    }
  | {
      readonly kind: "compare";
      readonly base: string;
      readonly head: string;
    }
  | {
      readonly kind: "git_worktree";
      readonly repo_path: string;
    }
  | {
      readonly kind: "git_commit";
      readonly repo_path: string;
      readonly commit: string;
    }
  | {
      readonly kind: "git_range";
      readonly repo_path: string;
      readonly base: string;
      readonly head: string;
      readonly merge_base: boolean;
    };

export interface GitHubPrTarget {
  readonly owner: string;
  readonly repo: string;
  readonly source: GitHubDiffSource;
  readonly url: string;
  readonly use_cache: boolean;
}

export type GitDiffSource =
  | {
      readonly kind: "worktree";
    }
  | {
      readonly kind: "commit";
      readonly commit: string;
    }
  | {
      readonly kind: "range";
      readonly base: string;
      readonly head: string;
      readonly merge_base: boolean;
    };

export interface GitDiffTarget {
  readonly repo_path: string;
  readonly source: GitDiffSource;
}

export type DiffWorkspaceTarget =
  | {
      readonly kind: "github";
      readonly target: GitHubPrTarget;
    }
  | {
      readonly kind: "git";
      readonly target: GitDiffTarget;
    };

export type BrowserRoot =
  | {
      readonly kind: "directory";
      readonly current_directory_path: string;
      readonly selected_file_path: string | null;
    }
  | {
      readonly kind: "explicit_file_set";
      readonly file_count: number;
      readonly selected_file_path: string;
      readonly source_order_paths: readonly string[];
    }
  | {
      readonly kind: "github_pr";
      readonly target: GitHubPrTarget;
    }
  | {
      readonly kind: "git_diff";
      readonly target: GitDiffTarget;
    };

export interface DirectoryEntry {
  readonly path: string;
  readonly canonical_path: string;
  readonly name: string;
  readonly directory_hint: string;
  readonly is_directory: boolean;
  readonly size_bytes: number;
  readonly modified_at_unix_ms: number;
}

export type DirectorySortField = "name" | "mtime" | "size" | "extension";
export type DirectorySortDirection = "asc" | "desc";

export interface DirectoryListSort {
  readonly field: DirectorySortField;
  readonly direction: DirectorySortDirection;
}

export interface DirectoryPage {
  readonly current_directory_path: string;
  readonly parent_directory_path: string | null;
  readonly entries: readonly DirectoryEntry[];
  readonly total_entry_count: number;
  readonly offset: number;
  readonly limit: number;
  readonly has_more: boolean;
}

export interface EpubNavigationItem {
  readonly label: string;
  readonly href: string | null;
  readonly anchor_id: string | null;
  readonly children: readonly EpubNavigationItem[];
}

export type FilePreview =
  | ({
      readonly kind: "markdown";
      readonly mime_type: string;
    } & DocumentSnapshot)
  | {
      readonly kind: "image";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly last_modified: string;
    }
  | {
      readonly kind: "video";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly stream_url: string | null;
      readonly html: string;
      readonly last_modified: string;
    }
  | {
      readonly kind: "audio";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly stream_url: string | null;
      readonly html: string;
      readonly last_modified: string;
    }
  | {
      readonly kind: "pdf";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly last_modified: string;
    }
  | {
      readonly kind: "epub";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly toc: readonly EpubNavigationItem[];
      readonly last_modified: string;
    }
  | {
      readonly kind: "csv";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly raw_html: string;
      readonly rows: readonly (readonly string[])[];
      readonly column_count: number;
      readonly displayed_row_count: number;
      readonly total_row_count: number | null;
      readonly truncated: boolean;
      readonly formatted_available: boolean;
      readonly parse_error: string | null;
      readonly size_bytes: number;
      readonly last_modified: string;
    }
  | {
      readonly kind: "text";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly file_type: string;
      readonly html: string;
      readonly size_bytes: number;
      readonly last_modified: string;
    }
  | {
      readonly kind: "binary";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly size_bytes: number;
      readonly last_modified: string;
      readonly message: string;
    };

export enum PrFileStatus {
  Added = "added",
  Modified = "modified",
  Deleted = "deleted",
  Renamed = "renamed",
  Copied = "copied",
}

export type PrDiffChangeType = "add" | "delete" | "context";

export interface PrDiffChange {
  readonly change_type: PrDiffChangeType;
  readonly old_line: number | null;
  readonly new_line: number | null;
  readonly content: string;
}

export interface PrDiffChunk {
  readonly old_start: number;
  readonly old_lines: number;
  readonly new_start: number;
  readonly new_lines: number;
  readonly header: string;
  readonly changes: readonly PrDiffChange[];
}

export interface PrDiffFile {
  readonly path: string;
  readonly old_path: string | null;
  readonly status: PrFileStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly chunks: readonly PrDiffChunk[];
  readonly is_binary: boolean;
  readonly raw_url: string | null;
  readonly full_text: string | null;
  readonly full_text_truncated: boolean;
}

export interface PrDiffFileText {
  readonly full_text: string;
  readonly full_text_truncated: boolean;
}

export interface PrDiffIdentity {
  readonly owner: string;
  readonly repo: string;
  readonly source: GitHubDiffSource;
  readonly url: string;
  readonly title: string;
  readonly state: string | null;
  readonly merged: boolean;
  readonly merged_at: string | null;
  readonly updated_at: string | null;
  readonly base_branch: string | null;
  readonly head_branch: string | null;
}

export interface PrDiffSnapshot {
  readonly identity: PrDiffIdentity;
  readonly files: readonly PrDiffFile[];
  readonly additions: number;
  readonly deletions: number;
  readonly warnings: readonly string[];
}

export const DOCUMENT_REFRESHED_EVENT = "document_refreshed";
export const DOCUMENT_CONFLICT_EVENT = "document_conflict";

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Tauri error";
}

function readStringRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Readonly<Record<string, unknown>>;
}

function readStringProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return null;
}

function readOptionalStringProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string | null | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" || candidate === null) {
      return candidate;
    }
  }

  return undefined;
}

function readStringArrayProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly string[] | null {
  for (const key of keys) {
    const candidate = value[key];
    if (
      Array.isArray(candidate) &&
      candidate.every((entry) => typeof entry === "string")
    ) {
      return [...candidate];
    }
  }

  return null;
}

function readNumberProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): number | null {
  for (const key of keys) {
    const candidate = value[key];
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 0
    ) {
      return candidate;
    }
  }

  return null;
}

function readNullableNumberProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): number | null | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (candidate === null) {
      return null;
    }
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 0
    ) {
      return candidate;
    }
  }

  return undefined;
}

function readBooleanProperty(
  value: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): boolean | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return null;
}

function normalizeGitHubDiffSourcePayload(
  payload: unknown,
  context: string,
): GitHubDiffSource {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error(`${context} is missing source identity`);
  }

  const kind = readStringProperty(root, "kind");
  if (kind === "pull_request" || kind === "pullRequest") {
    const number = readNumberProperty(root, "number");
    if (number === null || number <= 0) {
      throw new Error(`${context} is missing pull request number`);
    }

    return {
      kind: "pull_request",
      number,
    };
  }

  if (kind === "commit") {
    const sha = readStringProperty(root, "sha");
    if (sha === null || sha.trim().length === 0) {
      throw new Error(`${context} is missing commit sha`);
    }

    return {
      kind: "commit",
      sha,
    };
  }

  if (kind === "compare") {
    const base = readStringProperty(root, "base");
    const head = readStringProperty(root, "head");
    if (
      base === null ||
      head === null ||
      base.trim().length === 0 ||
      head.trim().length === 0
    ) {
      throw new Error(`${context} is missing compare refs`);
    }

    return {
      kind: "compare",
      base,
      head,
    };
  }

  if (kind === "git_worktree" || kind === "gitWorktree") {
    const repoPath = readStringProperty(root, "repo_path", "repoPath");
    if (repoPath === null || repoPath.trim().length === 0) {
      throw new Error(`${context} is missing git repository path`);
    }

    return {
      kind: "git_worktree",
      repo_path: repoPath,
    };
  }

  if (kind === "git_commit" || kind === "gitCommit") {
    const repoPath = readStringProperty(root, "repo_path", "repoPath");
    const commit = readStringProperty(root, "commit");
    if (
      repoPath === null ||
      commit === null ||
      repoPath.trim().length === 0 ||
      commit.trim().length === 0
    ) {
      throw new Error(`${context} is missing git commit identity`);
    }

    return {
      kind: "git_commit",
      repo_path: repoPath,
      commit,
    };
  }

  if (kind === "git_range" || kind === "gitRange") {
    const repoPath = readStringProperty(root, "repo_path", "repoPath");
    const base = readStringProperty(root, "base");
    const head = readStringProperty(root, "head");
    const mergeBase = readBooleanProperty(root, "merge_base", "mergeBase");
    if (
      repoPath === null ||
      base === null ||
      head === null ||
      mergeBase === null ||
      repoPath.trim().length === 0 ||
      base.trim().length === 0 ||
      head.trim().length === 0
    ) {
      throw new Error(`${context} is missing git range identity`);
    }

    return {
      kind: "git_range",
      repo_path: repoPath,
      base,
      head,
      merge_base: mergeBase,
    };
  }

  throw new Error(`${context} contains an unknown source identity`);
}

function normalizeGitDiffSourcePayload(
  payload: unknown,
  context: string,
): GitDiffSource {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error(`${context} is missing source identity`);
  }

  const kind = readStringProperty(root, "kind");
  if (kind === "worktree") {
    return { kind: "worktree" };
  }

  if (kind === "commit") {
    const commit = readStringProperty(root, "commit");
    if (commit === null || commit.trim().length === 0) {
      throw new Error(`${context} is missing git commit`);
    }

    return {
      kind: "commit",
      commit,
    };
  }

  if (kind === "range") {
    const base = readStringProperty(root, "base");
    const head = readStringProperty(root, "head");
    const mergeBase = readBooleanProperty(root, "merge_base", "mergeBase");
    if (
      base === null ||
      head === null ||
      mergeBase === null ||
      base.trim().length === 0 ||
      head.trim().length === 0
    ) {
      throw new Error(`${context} is missing git range`);
    }

    return {
      kind: "range",
      base,
      head,
      merge_base: mergeBase,
    };
  }

  throw new Error(`${context} contains an unknown git source identity`);
}

function readWorkspaceMode(value: unknown): WorkspaceMode | null {
  return value === "markdown" || value === "file_view" || value === "pr_diff"
    ? value
    : null;
}

export function inferDirectoryPath(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex < 0) {
    return null;
  }

  if (separatorIndex === 0) {
    return normalizedPath.slice(0, 1);
  }

  const directoryPath = normalizedPath.slice(0, separatorIndex);
  if (/^[A-Za-z]:$/.test(directoryPath)) {
    return `${directoryPath}/`;
  }

  return directoryPath;
}

export function normalizeStartupContextPayload(
  payload: unknown,
): StartupContext {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid startup context payload");
  }

  const initialMode = readWorkspaceMode(
    root["initial_mode"] ?? root["initialMode"] ?? null,
  );
  if (initialMode === null) {
    throw new Error("Startup context is missing initial mode");
  }

  const browserRootRaw = readStringRecord(
    root["browser_root"] ?? root["browserRoot"] ?? null,
  );
  if (browserRootRaw === null) {
    throw new Error("Startup context is missing browser root");
  }

  const kind = readStringProperty(browserRootRaw, "kind");
  if (kind === "directory") {
    const selectedFilePath = readOptionalStringProperty(
      browserRootRaw,
      "selected_file_path",
      "selectedFilePath",
    );
    const currentDirectoryPath =
      readStringProperty(
        browserRootRaw,
        "current_directory_path",
        "currentDirectoryPath",
      ) ??
      (typeof selectedFilePath === "string"
        ? inferDirectoryPath(selectedFilePath)
        : null);

    if (currentDirectoryPath === null || selectedFilePath === undefined) {
      throw new Error("Startup directory payload is missing required paths");
    }

    return {
      initial_mode: initialMode,
      browser_root: {
        kind: "directory",
        current_directory_path: currentDirectoryPath,
        selected_file_path: selectedFilePath,
      },
    };
  }

  if (kind === "file" || kind === "selected_file") {
    const selectedFilePath = readStringProperty(
      browserRootRaw,
      "selected_file_path",
      "selectedFilePath",
    );
    const currentDirectoryPath =
      selectedFilePath === null ? null : inferDirectoryPath(selectedFilePath);

    if (currentDirectoryPath === null || selectedFilePath === null) {
      throw new Error("Startup file payload is missing required paths");
    }

    return {
      initial_mode: initialMode,
      browser_root: {
        kind: "directory",
        current_directory_path: currentDirectoryPath,
        selected_file_path: selectedFilePath,
      },
    };
  }

  if (kind === "explicit_file_set" || kind === "explicitFileSet") {
    const fileCount = readNumberProperty(
      browserRootRaw,
      "file_count",
      "fileCount",
    );
    const selectedFilePath = readStringProperty(
      browserRootRaw,
      "selected_file_path",
      "selectedFilePath",
    );
    const sourceOrderPaths = readStringArrayProperty(
      browserRootRaw,
      "source_order_paths",
      "sourceOrderPaths",
    );

    if (
      fileCount === null ||
      selectedFilePath === null ||
      sourceOrderPaths === null
    ) {
      throw new Error("Startup file-set payload is missing required paths");
    }

    if (
      fileCount !== sourceOrderPaths.length ||
      !sourceOrderPaths.includes(selectedFilePath)
    ) {
      throw new Error("Startup file-set payload contains inconsistent paths");
    }

    return {
      initial_mode: initialMode,
      browser_root: {
        kind: "explicit_file_set",
        file_count: fileCount,
        selected_file_path: selectedFilePath,
        source_order_paths: sourceOrderPaths,
      },
    };
  }

  if (kind === "github_pr" || kind === "gitHubPr" || kind === "git_hub_pr") {
    const targetRaw = readStringRecord(browserRootRaw["target"]);
    if (targetRaw === null) {
      throw new Error("Startup GitHub diff payload is missing target");
    }

    const owner = readStringProperty(targetRaw, "owner");
    const repo = readStringProperty(targetRaw, "repo");
    const url = readStringProperty(targetRaw, "url");
    const sourceRaw =
      targetRaw["source"] ??
      (readNumberProperty(targetRaw, "number") === null
        ? undefined
        : {
            kind: "pull_request",
            number: readNumberProperty(targetRaw, "number"),
          });
    const useCache = readBooleanProperty(targetRaw, "use_cache", "useCache");

    if (owner === null || repo === null || url === null) {
      throw new Error("Startup GitHub diff payload is missing required fields");
    }
    const source = normalizeGitHubDiffSourcePayload(
      sourceRaw,
      "Startup GitHub diff payload",
    );

    return {
      initial_mode: initialMode,
      browser_root: {
        kind: "github_pr",
        target: {
          owner,
          repo,
          source,
          url,
          use_cache: useCache ?? true,
        },
      },
    };
  }

  if (kind === "git_diff" || kind === "gitDiff") {
    const targetRaw = readStringRecord(browserRootRaw["target"]);
    if (targetRaw === null) {
      throw new Error("Startup Git diff payload is missing target");
    }

    const repoPath = readStringProperty(targetRaw, "repo_path", "repoPath");
    const source = normalizeGitDiffSourcePayload(
      targetRaw["source"],
      "Startup Git diff payload",
    );

    if (repoPath === null) {
      throw new Error("Startup Git diff payload is missing repository path");
    }

    return {
      initial_mode: initialMode,
      browser_root: {
        kind: "git_diff",
        target: {
          repo_path: repoPath,
          source,
        },
      },
    };
  }

  throw new Error("Startup context contains an unknown browser root");
}

export async function loadGitHubPrDiff(
  target: GitHubPrTarget,
): Promise<PrDiffSnapshot> {
  return loadPrDiff(target);
}

export function normalizePrDiffSnapshotPayload(
  payload: unknown,
): PrDiffSnapshot {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid GitHub diff payload");
  }

  const identityRaw = readStringRecord(root["identity"]);
  const filesRaw = root["files"];
  const additions = readNumberProperty(root, "additions");
  const deletions = readNumberProperty(root, "deletions");
  const warnings = readStringArrayProperty(root, "warnings");

  if (
    identityRaw === null ||
    !Array.isArray(filesRaw) ||
    additions === null ||
    deletions === null ||
    warnings === null
  ) {
    throw new Error("GitHub diff payload is missing required fields");
  }

  const owner = readStringProperty(identityRaw, "owner");
  const repo = readStringProperty(identityRaw, "repo");
  const sourceRaw =
    identityRaw["source"] ??
    (readNumberProperty(identityRaw, "number") === null
      ? undefined
      : {
          kind: "pull_request",
          number: readNumberProperty(identityRaw, "number"),
        });
  const url = readStringProperty(identityRaw, "url");
  const title = readStringProperty(identityRaw, "title");
  const state = readOptionalStringProperty(identityRaw, "state");
  const merged = readBooleanProperty(identityRaw, "merged");
  const mergedAt = readOptionalStringProperty(
    identityRaw,
    "merged_at",
    "mergedAt",
  );
  const updatedAt = readOptionalStringProperty(
    identityRaw,
    "updated_at",
    "updatedAt",
  );
  const baseBranch = readOptionalStringProperty(
    identityRaw,
    "base_branch",
    "baseBranch",
  );
  const headBranch = readOptionalStringProperty(
    identityRaw,
    "head_branch",
    "headBranch",
  );

  if (
    owner === null ||
    repo === null ||
    url === null ||
    title === null ||
    state === undefined ||
    merged === null ||
    mergedAt === undefined ||
    updatedAt === undefined ||
    baseBranch === undefined ||
    headBranch === undefined
  ) {
    throw new Error("GitHub diff identity payload is missing required fields");
  }
  const source = normalizeGitHubDiffSourcePayload(
    sourceRaw,
    "GitHub diff identity payload",
  );

  return {
    identity: {
      owner,
      repo,
      source,
      url,
      title,
      state,
      merged,
      merged_at: mergedAt,
      updated_at: updatedAt,
      base_branch: baseBranch,
      head_branch: headBranch,
    },
    files: filesRaw.map(normalizePrDiffFilePayload),
    additions,
    deletions,
    warnings,
  };
}

function normalizePrDiffFilePayload(payload: unknown): PrDiffFile {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid GitHub diff file payload");
  }

  const path = readStringProperty(root, "path");
  const oldPath = readOptionalStringProperty(root, "old_path", "oldPath");
  const statusRaw = readStringProperty(root, "status");
  const status = normalizePrFileStatus(statusRaw);
  const additions = readNumberProperty(root, "additions");
  const deletions = readNumberProperty(root, "deletions");
  const chunksRaw = root["chunks"];
  const isBinary = readBooleanProperty(root, "is_binary", "isBinary");
  const rawUrl = readOptionalStringProperty(root, "raw_url", "rawUrl");
  const fullText = readOptionalStringProperty(root, "full_text", "fullText");
  const fullTextTruncated = readBooleanProperty(
    root,
    "full_text_truncated",
    "fullTextTruncated",
  );

  if (
    path === null ||
    oldPath === undefined ||
    status === null ||
    additions === null ||
    deletions === null ||
    !Array.isArray(chunksRaw) ||
    isBinary === null ||
    rawUrl === undefined ||
    fullText === undefined ||
    fullTextTruncated === null
  ) {
    throw new Error("GitHub diff file payload is missing required fields");
  }

  return {
    path,
    old_path: oldPath,
    status,
    additions,
    deletions,
    chunks: chunksRaw.map(normalizePrDiffChunkPayload),
    is_binary: isBinary,
    raw_url: rawUrl,
    full_text: fullText,
    full_text_truncated: fullTextTruncated,
  };
}

export function normalizePrDiffFileTextPayload(
  payload: unknown,
): PrDiffFileText {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid GitHub diff file text payload");
  }

  const fullText = readStringProperty(root, "full_text", "fullText");
  const fullTextTruncated = readBooleanProperty(
    root,
    "full_text_truncated",
    "fullTextTruncated",
  );

  if (fullText === null || fullTextTruncated === null) {
    throw new Error("GitHub diff file text payload is missing required fields");
  }

  return {
    full_text: fullText,
    full_text_truncated: fullTextTruncated,
  };
}

function normalizePrDiffChunkPayload(payload: unknown): PrDiffChunk {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid GitHub diff chunk payload");
  }

  const oldStart = readNumberProperty(root, "old_start", "oldStart");
  const oldLines = readNumberProperty(root, "old_lines", "oldLines");
  const newStart = readNumberProperty(root, "new_start", "newStart");
  const newLines = readNumberProperty(root, "new_lines", "newLines");
  const header = readStringProperty(root, "header");
  const changesRaw = root["changes"];

  if (
    oldStart === null ||
    oldLines === null ||
    newStart === null ||
    newLines === null ||
    header === null ||
    !Array.isArray(changesRaw)
  ) {
    throw new Error("GitHub diff chunk payload is missing required fields");
  }

  return {
    old_start: oldStart,
    old_lines: oldLines,
    new_start: newStart,
    new_lines: newLines,
    header,
    changes: changesRaw.map(normalizePrDiffChangePayload),
  };
}

function normalizePrDiffChangePayload(payload: unknown): PrDiffChange {
  const root = readStringRecord(payload);
  if (root === null) {
    throw new Error("Invalid GitHub diff change payload");
  }

  const changeTypeRaw = readStringProperty(root, "change_type", "changeType");
  const oldLine = readNullableNumberProperty(root, "old_line", "oldLine");
  const newLine = readNullableNumberProperty(root, "new_line", "newLine");
  const content = readStringProperty(root, "content");

  if (
    !isPrDiffChangeType(changeTypeRaw) ||
    oldLine === undefined ||
    newLine === undefined ||
    content === null
  ) {
    throw new Error("GitHub diff change payload is missing required fields");
  }

  return {
    change_type: changeTypeRaw,
    old_line: oldLine,
    new_line: newLine,
    content,
  };
}

function normalizePrFileStatus(value: string | null): PrFileStatus | null {
  switch (value) {
    case PrFileStatus.Added:
      return PrFileStatus.Added;
    case PrFileStatus.Modified:
      return PrFileStatus.Modified;
    case PrFileStatus.Deleted:
      return PrFileStatus.Deleted;
    case PrFileStatus.Renamed:
      return PrFileStatus.Renamed;
    case PrFileStatus.Copied:
      return PrFileStatus.Copied;
    default:
      return null;
  }
}

function isPrDiffChangeType(value: string | null): value is PrDiffChangeType {
  return value === "add" || value === "delete" || value === "context";
}

export async function loadPrDiff(
  target: GitHubPrTarget,
): Promise<PrDiffSnapshot> {
  try {
    return normalizePrDiffSnapshotPayload(
      await invoke<unknown>("load_pr_diff", { target }),
    );
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function loadGitDiff(
  target: GitDiffTarget,
): Promise<PrDiffSnapshot> {
  try {
    return normalizePrDiffSnapshotPayload(
      await invoke<unknown>("load_git_diff", { target }),
    );
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function detectGitRepository(
  path: string,
): Promise<GitDiffTarget | null> {
  try {
    const payload = await invoke<unknown>("detect_git_repository", { path });
    if (payload === null) {
      return null;
    }

    const root = readStringRecord(payload);
    if (root === null) {
      throw new Error("Git repository detection payload is invalid");
    }

    const repoPath = readStringProperty(root, "repo_path", "repoPath");
    if (repoPath === null) {
      throw new Error("Git repository detection payload is missing path");
    }

    return {
      repo_path: repoPath,
      source: normalizeGitDiffSourcePayload(
        root["source"],
        "Git repository detection payload",
      ),
    };
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function loadPrDiffFileText(
  rawUrl: string,
): Promise<PrDiffFileText> {
  try {
    return normalizePrDiffFileTextPayload(
      await invoke<unknown>("load_pr_diff_file_text", { rawUrl }),
    );
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function getStartupContext(): Promise<StartupContext> {
  try {
    return normalizeStartupContextPayload(
      await invoke<unknown>("get_startup_context"),
    );
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export interface ExplicitFileSetPage {
  readonly entries: readonly DirectoryEntry[];
  readonly total_entry_count: number;
  readonly offset: number;
  readonly limit: number;
  readonly has_more: boolean;
}

export async function listExplicitFileSet(
  paths: readonly string[],
  sort: DirectoryListSort,
  query: string,
  offset: number,
  limit: number,
): Promise<ExplicitFileSetPage> {
  try {
    return await invoke<ExplicitFileSetPage>("list_explicit_file_set", {
      paths,
      sort,
      query,
      offset,
      limit,
    });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function listDirectory(
  path: string,
  sort: DirectoryListSort,
  query: string,
  offset: number,
  limit: number,
): Promise<DirectoryPage> {
  if (path.length === 0) {
    throw new Error("Directory path is required before listing files");
  }

  try {
    return await invoke<DirectoryPage>("list_directory", {
      input: {
        path,
        sort,
        query,
        offset,
        limit,
      },
    });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function openFilePreview(path: string): Promise<FilePreview> {
  try {
    return await invoke<FilePreview>("open_file_preview", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function openDocument(path: string): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("open_document", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function stopDocumentWatch(): Promise<void> {
  try {
    await invoke("stop_document_watch");
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function saveDocument(
  path: string,
  sourceText: string,
): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("save_document", {
      path,
      sourceText,
    });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function reloadDocument(path: string): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("reload_document", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export interface MarkdownPreviewOutput {
  readonly html: string;
  readonly headings: readonly HeadingNode[];
}

export async function renderMarkdownPreview(
  sourceText: string,
): Promise<MarkdownPreviewOutput> {
  try {
    return await invoke<MarkdownPreviewOutput>("render_markdown_preview", {
      sourceText,
    });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function listenDocumentRefreshed(
  onRefresh: (snapshot: DocumentSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<DocumentSnapshot>(DOCUMENT_REFRESHED_EVENT, (event) => {
    onRefresh(event.payload);
  });
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown)$/i.test(path);
}
