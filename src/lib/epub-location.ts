export interface EpubLocation {
  readonly href: string;
  readonly progression: number | null;
  readonly updatedAtUnixMs: number;
}

const STORAGE_PREFIX = "chilla-epub-location:";

function clampProgression(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(Math.max(value, 0), 1);
}

function storageKey(path: string): string {
  return `${STORAGE_PREFIX}${path}`;
}

export function loadStoredEpubLocation(path: string): EpubLocation | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(storageKey(path));
    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<EpubLocation>;
    if (typeof parsed.href !== "string" || parsed.href.length === 0) {
      return null;
    }

    const updatedAtUnixMs =
      typeof parsed.updatedAtUnixMs === "number" &&
      Number.isFinite(parsed.updatedAtUnixMs)
        ? parsed.updatedAtUnixMs
        : Date.now();

    return {
      href: parsed.href,
      progression: clampProgression(parsed.progression),
      updatedAtUnixMs,
    };
  } catch {
    return null;
  }
}

export function saveStoredEpubLocation(
  path: string,
  location: EpubLocation,
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(storageKey(path), JSON.stringify(location));
  } catch {
    // Ignore blocked or unavailable storage.
  }
}

export function clearStoredEpubLocation(path: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(storageKey(path));
  } catch {
    // Ignore blocked or unavailable storage.
  }
}
