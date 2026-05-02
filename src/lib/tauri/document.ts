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

export async function getStartupContext(): Promise<StartupContext> {
  try {
    return await invoke<StartupContext>("get_startup_context");
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
  try {
    return await invoke<DirectoryPage>("list_directory", {
      path,
      sort,
      query,
      offset,
      limit,
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
