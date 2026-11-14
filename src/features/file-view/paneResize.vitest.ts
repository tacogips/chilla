import { describe, expect, it } from "vitest";
import {
  clampPaneWidthPx,
  computeDraggedPaneWidthPx,
  FILE_TREE_WIDTH_MIN_PX,
  fileTreeWidthBounds,
  maxPaneWidthPxForViewport,
  parseStoredPaneWidthPx,
  persistPaneWidthPx,
  PR_BROWSER_WIDTH_MIN_PX,
  prBrowserWidthBounds,
  restorePersistedPaneWidthPx,
  type PaneWidthStorage,
} from "./paneResize";

function memoryStorage(
  initial: Readonly<Record<string, string>> = {},
): PaneWidthStorage & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };

  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("clampPaneWidthPx", () => {
  it("passes through a value already within bounds", () => {
    expect(clampPaneWidthPx(200, { minPx: 100, maxPx: 300 })).toBe(200);
  });

  it("clamps values below the minimum", () => {
    expect(clampPaneWidthPx(10, { minPx: 100, maxPx: 300 })).toBe(100);
  });

  it("clamps values above the maximum", () => {
    expect(clampPaneWidthPx(500, { minPx: 100, maxPx: 300 })).toBe(300);
  });

  it("falls back to the minimum for non-finite input", () => {
    expect(clampPaneWidthPx(Number.NaN, { minPx: 100, maxPx: 300 })).toBe(100);
    expect(
      clampPaneWidthPx(Number.POSITIVE_INFINITY, { minPx: 100, maxPx: 300 }),
    ).toBe(300);
  });

  it("tolerates inverted bounds by treating minPx as authoritative", () => {
    expect(clampPaneWidthPx(50, { minPx: 200, maxPx: 100 })).toBe(200);
  });
});

describe("computeDraggedPaneWidthPx", () => {
  const bounds = { minPx: 100, maxPx: 400 };

  it("adds the pointer delta to the starting width", () => {
    expect(computeDraggedPaneWidthPx(200, 50, 90, bounds)).toBe(240);
  });

  it("shrinks when the pointer moves left", () => {
    expect(computeDraggedPaneWidthPx(200, 90, 50, bounds)).toBe(160);
  });

  it("clamps the dragged result into bounds", () => {
    expect(computeDraggedPaneWidthPx(200, 0, 1000, bounds)).toBe(400);
    expect(computeDraggedPaneWidthPx(200, 1000, 0, bounds)).toBe(100);
  });
});

describe("maxPaneWidthPxForViewport", () => {
  it("applies the ratio to the viewport width", () => {
    expect(maxPaneWidthPxForViewport(1000, 0.6)).toBe(600);
  });

  it("applies an absolute cap when provided", () => {
    expect(maxPaneWidthPxForViewport(2000, 0.6, 640)).toBe(640);
  });

  it("never returns a negative width for a negative viewport", () => {
    expect(maxPaneWidthPxForViewport(-100, 0.6)).toBe(0);
  });
});

describe("fileTreeWidthBounds", () => {
  it("uses the fixed minimum and a viewport-derived maximum", () => {
    const bounds = fileTreeWidthBounds(2000);
    expect(bounds.minPx).toBe(FILE_TREE_WIDTH_MIN_PX);
    expect(bounds.maxPx).toBe(640);
  });

  it("never lets maxPx fall below minPx on a tiny viewport", () => {
    const bounds = fileTreeWidthBounds(100);
    expect(bounds.maxPx).toBeGreaterThanOrEqual(bounds.minPx);
  });
});

describe("prBrowserWidthBounds", () => {
  it("uses the fixed minimum and 60% of the viewport as the maximum", () => {
    const bounds = prBrowserWidthBounds(1000);
    expect(bounds.minPx).toBe(PR_BROWSER_WIDTH_MIN_PX);
    expect(bounds.maxPx).toBe(600);
  });

  it("never lets maxPx fall below minPx on a tiny viewport", () => {
    const bounds = prBrowserWidthBounds(100);
    expect(bounds.maxPx).toBeGreaterThanOrEqual(bounds.minPx);
  });
});

describe("parseStoredPaneWidthPx", () => {
  it("returns null for a missing value", () => {
    expect(parseStoredPaneWidthPx(null)).toBeNull();
  });

  it("returns null for a non-numeric value", () => {
    expect(parseStoredPaneWidthPx("not-a-number")).toBeNull();
  });

  it("returns null for a zero or negative value", () => {
    expect(parseStoredPaneWidthPx("0")).toBeNull();
    expect(parseStoredPaneWidthPx("-40")).toBeNull();
  });

  it("returns the parsed number for a valid value", () => {
    expect(parseStoredPaneWidthPx("240")).toBe(240);
  });
});

describe("restorePersistedPaneWidthPx", () => {
  const bounds = { minPx: 160, maxPx: 640 };

  it("returns null when storage is unavailable", () => {
    expect(
      restorePersistedPaneWidthPx(null, "chilla.fileTreeWidthPx", bounds),
    ).toBeNull();
  });

  it("returns null when no value has been persisted", () => {
    const storage = memoryStorage();
    expect(
      restorePersistedPaneWidthPx(storage, "chilla.fileTreeWidthPx", bounds),
    ).toBeNull();
  });

  it("returns null for a corrupted stored value", () => {
    const storage = memoryStorage({ "chilla.fileTreeWidthPx": "abc" });
    expect(
      restorePersistedPaneWidthPx(storage, "chilla.fileTreeWidthPx", bounds),
    ).toBeNull();
  });

  it("clamps an out-of-range stored value into bounds", () => {
    const storage = memoryStorage({ "chilla.fileTreeWidthPx": "5000" });
    expect(
      restorePersistedPaneWidthPx(storage, "chilla.fileTreeWidthPx", bounds),
    ).toBe(640);
  });

  it("returns the stored value unchanged when it is within bounds", () => {
    const storage = memoryStorage({ "chilla.fileTreeWidthPx": "300" });
    expect(
      restorePersistedPaneWidthPx(storage, "chilla.fileTreeWidthPx", bounds),
    ).toBe(300);
  });

  it("returns null when storage access throws", () => {
    const throwingStorage: PaneWidthStorage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };

    expect(
      restorePersistedPaneWidthPx(
        throwingStorage,
        "chilla.fileTreeWidthPx",
        bounds,
      ),
    ).toBeNull();
  });
});

describe("persistPaneWidthPx", () => {
  it("stores a rounded width as a string", () => {
    const storage = memoryStorage();
    persistPaneWidthPx(storage, "chilla.fileTreeWidthPx", 240.6);
    expect(storage.data["chilla.fileTreeWidthPx"]).toBe("241");
  });

  it("is a no-op when storage is unavailable", () => {
    expect(() =>
      persistPaneWidthPx(null, "chilla.fileTreeWidthPx", 240),
    ).not.toThrow();
  });

  it("swallows storage write failures", () => {
    const throwingStorage: PaneWidthStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    expect(() =>
      persistPaneWidthPx(throwingStorage, "chilla.fileTreeWidthPx", 240),
    ).not.toThrow();
  });
});
