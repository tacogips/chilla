import type {
  DocumentPresentationMode,
  FilePreview,
  StructuredDataFormat,
} from "../../lib/tauri/document";
import { isTsvMimeType } from "../../lib/tauri/document";
import type { PaneWidthStorage } from "../file-view/paneResize";

/** localStorage key for the persisted structured-data (JSON/JSON Lines/XML) presentation preference. */
export const STRUCTURED_DATA_PRESENTATION_MODE_STORAGE_KEY =
  "chilla.structuredDataPresentationMode";

/** Reads the persisted structured-data presentation preference, defaulting to "formatted". */
export function restoreStructuredDataPresentationMode(
  storage: PaneWidthStorage | null,
): DocumentPresentationMode {
  if (storage === null) {
    return "formatted";
  }

  try {
    return storage.getItem(STRUCTURED_DATA_PRESENTATION_MODE_STORAGE_KEY) ===
      "raw"
      ? "raw"
      : "formatted";
  } catch {
    return "formatted";
  }
}

/** Persists the structured-data presentation preference, silently ignoring storage failures. */
export function persistStructuredDataPresentationMode(
  storage: PaneWidthStorage | null,
  mode: DocumentPresentationMode,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(STRUCTURED_DATA_PRESENTATION_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable (private browsing, disabled storage, quota
    // exceeded). Losing the persisted preference is not fatal.
  }
}

/** Raw source vs browser-style rendered preview, specific to HTML text previews. */
export type HtmlPresentationMode = "raw" | "preview";

/** localStorage key for the persisted HTML raw/preview presentation preference. */
export const HTML_PRESENTATION_MODE_STORAGE_KEY = "chilla.htmlPresentationMode";

/** Reads the persisted HTML presentation preference, defaulting to "raw". */
export function restoreHtmlPresentationMode(
  storage: PaneWidthStorage | null,
): HtmlPresentationMode {
  if (storage === null) {
    return "raw";
  }

  try {
    return storage.getItem(HTML_PRESENTATION_MODE_STORAGE_KEY) === "preview"
      ? "preview"
      : "raw";
  } catch {
    return "raw";
  }
}

/** Persists the HTML presentation preference, silently ignoring storage failures. */
export function persistHtmlPresentationMode(
  storage: PaneWidthStorage | null,
  mode: HtmlPresentationMode,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(HTML_PRESENTATION_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable (private browsing, disabled storage, quota
    // exceeded). Losing the persisted preference is not fatal.
  }
}

/** localStorage key for the persisted syntax-highlighting on/off preference. */
export const SYNTAX_HIGHLIGHTING_ENABLED_STORAGE_KEY =
  "chilla.syntaxHighlightingEnabled";

/** Reads the persisted syntax-highlighting preference, defaulting to enabled. */
export function restoreSyntaxHighlightingEnabled(
  storage: PaneWidthStorage | null,
): boolean {
  if (storage === null) {
    return true;
  }

  try {
    return storage.getItem(SYNTAX_HIGHLIGHTING_ENABLED_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Persists the syntax-highlighting preference, silently ignoring storage failures. */
export function persistSyntaxHighlightingEnabled(
  storage: PaneWidthStorage | null,
  enabled: boolean,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      SYNTAX_HIGHLIGHTING_ENABLED_STORAGE_KEY,
      enabled ? "on" : "off",
    );
  } catch {
    // Storage may be unavailable (private browsing, disabled storage, quota
    // exceeded). Losing the persisted preference is not fatal.
  }
}

const SELECTION_PREVIEW_DEBOUNCE_MS = 500;
const SELECTION_PREVIEW_DEBOUNCE_FAST_MS = 120;

export function selectionPreviewDebounceMsForPath(filePath: string): number {
  if (/\.(csv|tsv|tab)$/i.test(filePath)) {
    return SELECTION_PREVIEW_DEBOUNCE_FAST_MS;
  }

  if (
    /\.(pdf|apng|avif|bmp|dib|gif|heic|heics|heif|heifs|ico|jfif|jpe|jpeg|jpg|png|svg|tif|tiff|webp)$/i.test(
      filePath,
    )
  ) {
    return SELECTION_PREVIEW_DEBOUNCE_FAST_MS;
  }

  if (
    /\.(mp4|m4v|mov|webm|ogv|aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(
      filePath,
    )
  ) {
    return SELECTION_PREVIEW_DEBOUNCE_FAST_MS;
  }

  return SELECTION_PREVIEW_DEBOUNCE_MS;
}

export function isVideoPath(filePath: string): boolean {
  return /\.(mp4|m4v|mov|webm|ogv)$/i.test(filePath);
}

function isAudioPath(filePath: string): boolean {
  return /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(filePath);
}

export type InferredPreviewKind = "audio" | "video" | "pdf" | "default";
export type StructuredTextPreview = Extract<
  FilePreview,
  { readonly kind: "text" }
> & { readonly structured_format: StructuredDataFormat };

export function previewPath(preview: FilePreview | null): string | null {
  return preview?.path ?? null;
}

/** Narrows a preview to a text preview whose source belongs to a formattable family. */
export function isStructuredTextPreview(
  preview: FilePreview | null,
): preview is StructuredTextPreview {
  return preview?.kind === "text" && preview.structured_format !== null;
}

/** HTML previews get a browser-style rendered view instead of the generic Raw/Formatted group. */
export function isHtmlStructuredPreview(
  preview: FilePreview | null,
): preview is StructuredTextPreview & { readonly structured_format: "html" } {
  return (
    isStructuredTextPreview(preview) && preview.structured_format === "html"
  );
}

const TYPESCRIPT_EXTENSIONS = new Set(["ts", "mts", "cts", "tsx"]);

function pathExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dotIndex = name.lastIndexOf(".");
  return dotIndex < 0 ? "" : name.slice(dotIndex + 1).toLowerCase();
}

/**
 * Human-readable label for a structured data family. `path` disambiguates
 * "javascript", which covers both JS and TS sources: TypeScript extensions
 * (ts/mts/cts/tsx) label as "TypeScript", everything else as "JavaScript".
 */
export function structuredDataFormatLabel(
  format: StructuredDataFormat,
  path?: string,
): string {
  switch (format) {
    case "json":
      return "JSON";
    case "json_lines":
      return "JSON Lines";
    case "xml":
      return "XML";
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "javascript":
      return TYPESCRIPT_EXTENSIONS.has(pathExtension(path ?? ""))
        ? "TypeScript"
        : "JavaScript";
  }
}

export function previewHtml(
  preview: FilePreview | null,
  structuredDataMode: DocumentPresentationMode = "raw",
): string {
  if (preview === null) {
    return '<section class="file-preview-empty"><p class="file-preview-empty__title">No file selected</p><p class="file-preview-empty__hint">Pick a file in the file tree to open it here.</p></section>';
  }

  if (preview.kind === "csv") {
    return preview.raw_html;
  }

  if (
    isStructuredTextPreview(preview) &&
    structuredDataMode === "formatted" &&
    preview.formatted_html !== null
  ) {
    return preview.formatted_html;
  }

  if ("html" in preview) {
    return preview.html;
  }

  return '<section class="file-preview-empty"><p class="file-preview-empty__title">No file selected</p><p class="file-preview-empty__hint">Pick a file in the file tree to open it here.</p></section>';
}

function previewMimeType(preview: FilePreview | null): string {
  return preview?.mime_type ?? "";
}

function formatPreviewSize(sizeBytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = sizeBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${sizeBytes} ${units[unitIndex]}`;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function previewSubtitle(preview: FilePreview | null): string {
  if (preview?.kind === "csv") {
    const fileType = isTsvMimeType(preview.mime_type) ? "TSV" : "CSV";
    return `File type: ${fileType} | File size: ${formatPreviewSize(preview.size_bytes)}`;
  }

  if (preview?.kind === "epub") {
    return "File type: EPUB";
  }

  if (preview?.kind === "text") {
    return `File type: ${preview.file_type} | File size: ${formatPreviewSize(preview.size_bytes)}`;
  }

  if (preview?.kind === "binary") {
    return `File type: Binary | File size: ${formatPreviewSize(preview.size_bytes)}`;
  }

  return "Rendered HTML";
}

export function inferPreviewKind(
  preview: FilePreview | null,
): InferredPreviewKind {
  if (preview === null) {
    return "default";
  }

  const mimeType = previewMimeType(preview);
  const path = preview?.path ?? "";

  if (
    preview.kind === "audio" ||
    mimeType.startsWith("audio/") ||
    isAudioPath(path)
  ) {
    return "audio";
  }

  if (
    preview.kind === "video" ||
    mimeType.startsWith("video/") ||
    isVideoPath(path)
  ) {
    return "video";
  }

  if (preview.kind === "pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  return "default";
}

export function mediaPreviewKind(
  preview: FilePreview | null,
): "audio" | "video" | null {
  const kind = inferPreviewKind(preview);
  return kind === "audio" || kind === "video" ? kind : null;
}

export function mediaStreamUrl(preview: FilePreview | null): string | null {
  switch (preview?.kind) {
    case "audio":
    case "video":
      return preview.stream_url;
    default:
      return null;
  }
}

export function isMediaFilePreview(
  preview: FilePreview | null,
): preview is Extract<FilePreview, { path: string; file_name: string }> {
  return mediaPreviewKind(preview) !== null;
}
