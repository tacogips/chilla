import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type RevisionToken = string;
export type WorkspaceMode = "markdown" | "file_view";
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

function readWorkspaceMode(value: unknown): WorkspaceMode | null {
  return value === "markdown" || value === "file_view" ? value : null;
}

function inferDirectoryPath(filePath: string): string | null {
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

  throw new Error("Startup context contains an unknown browser root");
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
