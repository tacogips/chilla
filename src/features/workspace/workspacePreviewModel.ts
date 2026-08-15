import type { FilePreview } from "../../lib/tauri/document";

const SELECTION_PREVIEW_DEBOUNCE_MS = 500;
const SELECTION_PREVIEW_DEBOUNCE_FAST_MS = 120;

export function selectionPreviewDebounceMsForPath(filePath: string): number {
  if (/\.csv$/i.test(filePath)) {
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
export function previewPath(preview: FilePreview | null): string | null {
  return preview?.path ?? null;
}

export function previewHtml(preview: FilePreview | null): string {
  if (preview === null) {
    return '<section class="file-preview-empty"><p class="file-preview-empty__title">No file selected</p><p class="file-preview-empty__hint">Pick a file in the file tree to open it here.</p></section>';
  }

  if (preview.kind === "csv") {
    return preview.raw_html;
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
    return `File type: CSV | File size: ${formatPreviewSize(preview.size_bytes)}`;
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
