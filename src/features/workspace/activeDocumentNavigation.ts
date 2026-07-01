import type { FilePreview } from "../../lib/tauri/document";
import { EPUB_PAGINATION_STEP_EVENT } from "../preview/EpubPreviewPane";

const SMALL_MEDIA_SEEK_SECONDS = 5;

function getActiveDocumentScrollBody(): HTMLElement | null {
  const column = document.querySelector(".workspace__document-column");

  if (column === null) {
    return null;
  }

  const pane = column.querySelector(".pane:not(.pane--hidden)");

  if (pane === null) {
    return null;
  }

  return pane.querySelector<HTMLElement>(".pane__body");
}

function getActiveDocumentMediaElement(): HTMLMediaElement | null {
  const body = getActiveDocumentScrollBody();

  if (body === null) {
    return null;
  }

  const media = body.querySelector("video, audio");

  return media instanceof HTMLMediaElement ? media : null;
}

export function hasActiveDocumentMediaElement(): boolean {
  return getActiveDocumentMediaElement() !== null;
}

export function scrollActiveDocumentPane(direction: 1 | -1): void {
  const body = getActiveDocumentScrollBody();

  if (body === null) {
    return;
  }

  const delta = Math.max(80, Math.floor(body.clientHeight * 0.45)) * direction;
  body.scrollTop += delta;
}

export function nudgeActiveDocumentPane(direction: 1 | -1): void {
  const body = getActiveDocumentScrollBody();

  if (body === null) {
    return;
  }

  const computedStyle = getComputedStyle(body);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight);
  const delta =
    (Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24) *
    direction;
  body.scrollTop += delta;
}

export function seekActiveDocumentMediaElement(direction: 1 | -1): void {
  const media = getActiveDocumentMediaElement();

  if (media === null) {
    return;
  }

  const unclampedTime =
    media.currentTime + direction * SMALL_MEDIA_SEEK_SECONDS;
  const duration = media.duration;
  const nextTime = Number.isFinite(duration)
    ? Math.min(Math.max(unclampedTime, 0), duration)
    : Math.max(unclampedTime, 0);

  media.currentTime = nextTime;
}

export function hasActiveEpubPreview(preview: FilePreview | null): boolean {
  return preview?.kind === "epub";
}

export function stepActiveEpubPage(step: number): boolean {
  const reader = document.querySelector<HTMLElement>(".epub-reader");

  if (!(reader instanceof HTMLElement)) {
    return false;
  }

  reader.dispatchEvent(
    new CustomEvent(EPUB_PAGINATION_STEP_EVENT, {
      detail: { step },
    }),
  );

  return true;
}
