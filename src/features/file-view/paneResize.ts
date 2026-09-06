/**
 * Pure helpers for resizable-pane width calculations shared by the file tree
 * pane (viewer mode) and the PR/Git diff changed-files pane. Kept free of DOM
 * and Solid dependencies so the width math is unit-testable without
 * simulating pointer drags.
 */

/** Inclusive pixel bounds a pane width must be clamped into. */
export interface PaneWidthBounds {
  readonly minPx: number;
  readonly maxPx: number;
}

/** Minimal storage contract so callers can inject a mock in tests. */
export interface PaneWidthStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const FILE_TREE_WIDTH_STORAGE_KEY = "chilla.fileTreeWidthPx";
/** 10rem at the default 16px root font size. */
export const FILE_TREE_WIDTH_MIN_PX = 160;
/** Absolute ceiling for the file tree pane, independent of viewport size. */
export const FILE_TREE_WIDTH_ABSOLUTE_MAX_PX = 640;

export const PR_BROWSER_WIDTH_STORAGE_KEY = "chilla.prBrowserWidthPx";
/** 14rem at the default 16px root font size. */
export const PR_BROWSER_WIDTH_MIN_PX = 224;

/** Fraction of the viewport width a resizable pane may grow into. */
const VIEWPORT_MAX_WIDTH_RATIO = 0.6;

/** Clamps a candidate pane width into `bounds`, tolerating inverted bounds. */
export function clampPaneWidthPx(
  widthPx: number,
  bounds: PaneWidthBounds,
): number {
  if (Number.isNaN(widthPx)) {
    return bounds.minPx;
  }

  const maxPx = Math.max(bounds.minPx, bounds.maxPx);
  return Math.min(maxPx, Math.max(bounds.minPx, widthPx));
}

/** Computes the next pane width while a pointer drag is in progress. */
export function computeDraggedPaneWidthPx(
  startWidthPx: number,
  startClientX: number,
  currentClientX: number,
  bounds: PaneWidthBounds,
): number {
  const deltaPx = currentClientX - startClientX;
  return clampPaneWidthPx(startWidthPx + deltaPx, bounds);
}

/**
 * Derives the maximum pane width allowed for a given viewport width, applying
 * an optional absolute pixel cap on top of the viewport-relative ratio.
 */
export function maxPaneWidthPxForViewport(
  viewportWidthPx: number,
  ratio: number = VIEWPORT_MAX_WIDTH_RATIO,
  absoluteCapPx?: number,
): number {
  const ratioBoundPx = Math.max(0, viewportWidthPx) * ratio;
  const boundedPx =
    absoluteCapPx === undefined
      ? ratioBoundPx
      : Math.min(ratioBoundPx, absoluteCapPx);

  return Math.max(0, boundedPx);
}

/** Resize bounds for the viewer-mode file tree pane. */
export function fileTreeWidthBounds(viewportWidthPx: number): PaneWidthBounds {
  const maxPx = Math.max(
    FILE_TREE_WIDTH_MIN_PX,
    maxPaneWidthPxForViewport(
      viewportWidthPx,
      VIEWPORT_MAX_WIDTH_RATIO,
      FILE_TREE_WIDTH_ABSOLUTE_MAX_PX,
    ),
  );

  return { minPx: FILE_TREE_WIDTH_MIN_PX, maxPx };
}

/** Resize bounds for the PR/Git diff changed-files pane. */
export function prBrowserWidthBounds(viewportWidthPx: number): PaneWidthBounds {
  const maxPx = Math.max(
    PR_BROWSER_WIDTH_MIN_PX,
    maxPaneWidthPxForViewport(viewportWidthPx, VIEWPORT_MAX_WIDTH_RATIO),
  );

  return { minPx: PR_BROWSER_WIDTH_MIN_PX, maxPx };
}

/** Parses a value previously written by {@link persistPaneWidthPx}. */
export function parseStoredPaneWidthPx(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Reads and validates a persisted pane width, clamped into `bounds`. */
export function restorePersistedPaneWidthPx(
  storage: PaneWidthStorage | null,
  storageKey: string,
  bounds: PaneWidthBounds,
): number | null {
  if (storage === null) {
    return null;
  }

  try {
    const parsed = parseStoredPaneWidthPx(storage.getItem(storageKey));
    return parsed === null ? null : clampPaneWidthPx(parsed, bounds);
  } catch {
    return null;
  }
}

/** Persists a pane width, silently ignoring storage failures. */
export function persistPaneWidthPx(
  storage: PaneWidthStorage | null,
  storageKey: string,
  widthPx: number,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(storageKey, String(Math.round(widthPx)));
  } catch {
    // Storage may be unavailable (private browsing, disabled storage, quota
    // exceeded). Losing the persisted width is not fatal.
  }
}

/** Returns `window.localStorage`, or `null` when it cannot be accessed. */
export function safeLocalStorage(): PaneWidthStorage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}
