import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type RevisionToken = string;
export type WorkspaceMode = "markdown" | "file_view";

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
  readonly current_directory_path: string;
  readonly selected_file_path: string | null;
}

export interface DirectoryEntry {
  readonly path: string;
  readonly canonical_path: string;
  readonly name: string;
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
      readonly kind: "text";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly last_modified: string;
    }
  | {
      readonly kind: "binary";
      readonly path: string;
      readonly file_name: string;
      readonly mime_type: string;
      readonly html: string;
      readonly last_modified: string;
      readonly message: string;
    };

export const DOCUMENT_REFRESHED_EVENT = "document_refreshed";
export const DOCUMENT_CONFLICT_EVENT = "document_conflict";
const BROWSER_MOCK_ROOT = "/mock/workspace";
const BROWSER_MOCK_DOCS = `${BROWSER_MOCK_ROOT}/docs`;
const BROWSER_MOCK_MEDIA = `${BROWSER_MOCK_ROOT}/media`;
const BROWSER_MOCK_ARCHIVE = `${BROWSER_MOCK_ROOT}/archive`;
const BROWSER_MOCK_DEFAULT_LIMIT = 200;
const BROWSER_MOCK_TIMESTAMP = 1_710_000_000_000;

interface BrowserMockDirectoryFixture {
  readonly current_directory_path: string;
  readonly parent_directory_path: string | null;
  readonly entries: readonly DirectoryEntry[];
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Tauri error";
}

function isBrowserMockEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const forced = params.get("browser_mock");

  if (forced === "1") {
    return true;
  }

  if (forced === "0") {
    return false;
  }

  return !("__TAURI_INTERNALS__" in window);
}

function mockEntry(
  path: string,
  options: {
    readonly isDirectory?: boolean;
    readonly sizeBytes?: number;
    readonly modifiedAtUnixMs?: number;
  } = {},
): DirectoryEntry {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? path;

  return {
    path,
    canonical_path: path,
    name,
    is_directory: options.isDirectory ?? false,
    size_bytes: options.sizeBytes ?? 0,
    modified_at_unix_ms: options.modifiedAtUnixMs ?? BROWSER_MOCK_TIMESTAMP,
  };
}

const browserMockRootEntries: readonly DirectoryEntry[] = [
  mockEntry(BROWSER_MOCK_DOCS, {
    isDirectory: true,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 10,
  }),
  mockEntry(BROWSER_MOCK_MEDIA, {
    isDirectory: true,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 20,
  }),
  mockEntry(BROWSER_MOCK_ARCHIVE, {
    isDirectory: true,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 30,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/README.md`, {
    sizeBytes: 1_024,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 40,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/todo.md`, {
    sizeBytes: 2_048,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 50,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/image.png`, {
    sizeBytes: 250_000,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 60,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/movie.mp4`, {
    sizeBytes: 2_000_000,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 70,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/report.pdf`, {
    sizeBytes: 120_000,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 80,
  }),
  mockEntry(`${BROWSER_MOCK_ROOT}/data.bin`, {
    sizeBytes: 16_384,
    modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 90,
  }),
  ...Array.from({ length: 220 }, (_, index) =>
    mockEntry(
      `${BROWSER_MOCK_ROOT}/notes-${String(index + 1).padStart(3, "0")}.md`,
      {
        sizeBytes: 800 + index,
        modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP + 100 + index,
      },
    ),
  ),
];

const browserMockFixtures: Record<string, BrowserMockDirectoryFixture> = {
  [BROWSER_MOCK_ROOT]: {
    current_directory_path: BROWSER_MOCK_ROOT,
    parent_directory_path: null,
    entries: browserMockRootEntries,
  },
  [BROWSER_MOCK_DOCS]: {
    current_directory_path: BROWSER_MOCK_DOCS,
    parent_directory_path: BROWSER_MOCK_ROOT,
    entries: [
      mockEntry(`${BROWSER_MOCK_DOCS}/intro.md`, { sizeBytes: 2_500 }),
      mockEntry(`${BROWSER_MOCK_DOCS}/design.md`, { sizeBytes: 4_800 }),
      mockEntry(`${BROWSER_MOCK_DOCS}/roadmap.md`, { sizeBytes: 3_600 }),
      mockEntry(`${BROWSER_MOCK_DOCS}/changelog.txt`, { sizeBytes: 1_200 }),
    ],
  },
  [BROWSER_MOCK_MEDIA]: {
    current_directory_path: BROWSER_MOCK_MEDIA,
    parent_directory_path: BROWSER_MOCK_ROOT,
    entries: [
      mockEntry(`${BROWSER_MOCK_MEDIA}/cover.png`, { sizeBytes: 360_000 }),
      mockEntry(`${BROWSER_MOCK_MEDIA}/demo.mp4`, { sizeBytes: 9_400_000 }),
      mockEntry(`${BROWSER_MOCK_MEDIA}/manual.pdf`, { sizeBytes: 220_000 }),
    ],
  },
  [BROWSER_MOCK_ARCHIVE]: {
    current_directory_path: BROWSER_MOCK_ARCHIVE,
    parent_directory_path: BROWSER_MOCK_ROOT,
    entries: Array.from({ length: 12 }, (_, index) =>
      mockEntry(
        `${BROWSER_MOCK_ARCHIVE}/old-note-${String(index + 1).padStart(2, "0")}.md`,
        {
          sizeBytes: 640 + index,
          modifiedAtUnixMs: BROWSER_MOCK_TIMESTAMP - 1_000 - index,
        },
      ),
    ),
  },
};

function compareDirectoryEntriesForMock(
  left: DirectoryEntry,
  right: DirectoryEntry,
  sort: DirectoryListSort,
): number {
  if (
    (sort.field === "mtime" || sort.field === "size") &&
    left.is_directory !== right.is_directory
  ) {
    return left.is_directory ? -1 : 1;
  }

  const byField = (() => {
    switch (sort.field) {
      case "name":
        return compareText(left.name, right.name, sort.direction);
      case "mtime":
        return compareNumber(
          left.modified_at_unix_ms,
          right.modified_at_unix_ms,
          sort.direction,
        );
      case "size":
        return compareNumber(left.size_bytes, right.size_bytes, sort.direction);
      case "extension":
        return compareText(
          extensionForMock(left.name),
          extensionForMock(right.name),
          sort.direction,
        );
    }
  })();

  if (byField !== 0) {
    return byField;
  }

  return (
    compareText(left.name, right.name, "asc") ||
    left.path.localeCompare(right.path)
  );
}

function compareText(
  left: string,
  right: string,
  direction: DirectorySortDirection,
): number {
  const ordering =
    left.localeCompare(right, undefined, { sensitivity: "accent" }) ||
    left.localeCompare(right);

  return direction === "asc" ? ordering : -ordering;
}

function compareNumber(
  left: number,
  right: number,
  direction: DirectorySortDirection,
): number {
  if (left === right) {
    return 0;
  }

  return direction === "asc" ? left - right : right - left;
}

function extensionForMock(name: string): string {
  const lastDot = name.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === name.length - 1) {
    return "";
  }

  return name.slice(lastDot + 1).toLowerCase();
}

function browserMockGetStartupContext(): StartupContext {
  return {
    initial_mode: "file_view",
    current_directory_path: BROWSER_MOCK_ROOT,
    selected_file_path: null,
  };
}

function browserMockListDirectory(
  path: string,
  sort: DirectoryListSort,
  query: string,
  offset: number,
  limit: number,
): DirectoryPage {
  const fixture =
    browserMockFixtures[path] ?? browserMockFixtures[BROWSER_MOCK_ROOT];

  if (fixture === undefined) {
    throw new Error(`missing browser mock fixture for ${path}`);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = fixture.entries.filter((entry) =>
    normalizedQuery === ""
      ? true
      : entry.name.toLowerCase().includes(normalizedQuery),
  );
  const sorted = [...filtered].sort((left, right) =>
    compareDirectoryEntriesForMock(left, right, sort),
  );
  const normalizedOffset = Math.max(0, offset);
  const normalizedLimit =
    limit > 0
      ? Math.min(limit, BROWSER_MOCK_DEFAULT_LIMIT)
      : BROWSER_MOCK_DEFAULT_LIMIT;
  const entries = sorted.slice(
    normalizedOffset,
    normalizedOffset + normalizedLimit,
  );

  return {
    current_directory_path: fixture.current_directory_path,
    parent_directory_path: fixture.parent_directory_path,
    entries,
    total_entry_count: sorted.length,
    offset: normalizedOffset,
    limit: normalizedLimit,
    has_more: normalizedOffset + entries.length < sorted.length,
  };
}

function browserMockHeading(title: string): HeadingNode {
  return {
    level: 1,
    title,
    anchor_id: title.toLowerCase().replace(/\s+/g, "-"),
    line_start: 1,
    children: [],
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function browserMockSourceHtml(sourceText: string): string {
  return `<pre class="chilla-fallback"><code>${escapeHtml(sourceText)}</code></pre>`;
}

function browserMockOpenDocument(path: string): DocumentSnapshot {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? "mock.md";
  const title = fileName.replace(/\.(md|markdown|mdown)$/i, "");
  const sourceText = `# ${title}\n\nThis document is served by the browser mock adapter.\n`;

  return {
    path,
    file_name: fileName,
    source_text: sourceText,
    source_html: browserMockSourceHtml(sourceText),
    html: `<h1 id="${browserMockHeading(title).anchor_id}">${title}</h1><p>This document is served by the browser mock adapter.</p>`,
    headings: [browserMockHeading(title)],
    revision_token: `mock:${path}:1`,
    last_modified: String(BROWSER_MOCK_TIMESTAMP),
  };
}

function browserMockOpenFilePreview(path: string): FilePreview {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? path;

  if (/\.(png|jpg|jpeg|gif|webp)$/i.test(path)) {
    return {
      kind: "image",
      path,
      file_name: fileName,
      mime_type: "image/png",
      html: `<figure class="preview-media preview-media--image"><img alt="${fileName}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540'%3E%3Crect width='100%25' height='100%25' fill='%23d6d3d1'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-size='28'%3E${fileName}%3C/text%3E%3C/svg%3E" /></figure>`,
      last_modified: String(BROWSER_MOCK_TIMESTAMP),
    };
  }

  if (/\.(mp4|m4v|mov|webm|ogv)$/i.test(path)) {
    return {
      kind: "video",
      path,
      file_name: fileName,
      mime_type: "video/mp4",
      html: "",
      last_modified: String(BROWSER_MOCK_TIMESTAMP),
    };
  }

  if (/\.pdf$/i.test(path)) {
    return {
      kind: "pdf",
      path,
      file_name: fileName,
      mime_type: "application/pdf",
      html: "",
      last_modified: String(BROWSER_MOCK_TIMESTAMP),
    };
  }

  if (/\.(txt|json|toml|ya?ml)$/i.test(path)) {
    return {
      kind: "text",
      path,
      file_name: fileName,
      mime_type: "text/plain",
      html: `<pre class="file-preview file-preview--text">Mock preview for ${fileName}</pre>`,
      last_modified: String(BROWSER_MOCK_TIMESTAMP),
    };
  }

  return {
    kind: "binary",
    path,
    file_name: fileName,
    mime_type: "application/octet-stream",
    html: `<section class="file-preview file-preview--binary"><p>Binary file preview is not available.</p></section>`,
    last_modified: String(BROWSER_MOCK_TIMESTAMP),
    message: "Binary file preview is not available.",
  };
}

export const __browserMock = {
  getStartupContext: browserMockGetStartupContext,
  listDirectory: browserMockListDirectory,
  openDocument: browserMockOpenDocument,
  openFilePreview: browserMockOpenFilePreview,
};

export async function getStartupContext(): Promise<StartupContext> {
  if (isBrowserMockEnabled()) {
    return browserMockGetStartupContext();
  }

  try {
    return await invoke<StartupContext>("get_startup_context");
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
  if (isBrowserMockEnabled()) {
    return browserMockListDirectory(path, sort, query, offset, limit);
  }

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
  if (isBrowserMockEnabled()) {
    return browserMockOpenFilePreview(path);
  }

  try {
    return await invoke<FilePreview>("open_file_preview", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function openDocument(path: string): Promise<DocumentSnapshot> {
  if (isBrowserMockEnabled()) {
    return browserMockOpenDocument(path);
  }

  try {
    return await invoke<DocumentSnapshot>("open_document", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function stopDocumentWatch(): Promise<void> {
  if (isBrowserMockEnabled()) {
    return;
  }

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
  if (isBrowserMockEnabled()) {
    return {
      ...browserMockOpenDocument(path),
      source_text: sourceText,
      source_html: browserMockSourceHtml(sourceText),
      revision_token: `mock:${path}:saved`,
    };
  }

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
  if (isBrowserMockEnabled()) {
    return browserMockOpenDocument(path);
  }

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
  if (isBrowserMockEnabled()) {
    const titleMatch = sourceText.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1] ?? "Preview";
    return {
      html: `<h1 id="${browserMockHeading(title).anchor_id}">${title}</h1><pre>${sourceText}</pre>`,
      headings: [browserMockHeading(title)],
    };
  }

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
  if (isBrowserMockEnabled()) {
    void onRefresh;
    return () => {};
  }

  return listen<DocumentSnapshot>(DOCUMENT_REFRESHED_EVENT, (event) => {
    onRefresh(event.payload);
  });
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown)$/i.test(path);
}
