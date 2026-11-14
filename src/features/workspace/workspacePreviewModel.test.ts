import { describe, expect, it } from "bun:test";

import type { FilePreview } from "../../lib/tauri/document";
import {
  HTML_PRESENTATION_MODE_STORAGE_KEY,
  isHtmlStructuredPreview,
  isStructuredTextPreview,
  persistHtmlPresentationMode,
  persistStructuredDataPresentationMode,
  persistSyntaxHighlightingEnabled,
  previewHtml,
  previewSubtitle,
  restoreHtmlPresentationMode,
  restoreStructuredDataPresentationMode,
  restoreSyntaxHighlightingEnabled,
  selectionPreviewDebounceMsForPath,
  structuredDataFormatLabel,
  STRUCTURED_DATA_PRESENTATION_MODE_STORAGE_KEY,
  SYNTAX_HIGHLIGHTING_ENABLED_STORAGE_KEY,
} from "./workspacePreviewModel";

describe("selectionPreviewDebounceMsForPath", () => {
  const imageExtensions = [
    "apng",
    "avif",
    "bmp",
    "dib",
    "gif",
    "heic",
    "heics",
    "heif",
    "heifs",
    "ico",
    "jfif",
    "jpe",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "tif",
    "tiff",
    "webp",
  ] as const;

  for (const extension of imageExtensions) {
    it(`uses the fast image-preview debounce for .${extension} paths`, () => {
      expect(selectionPreviewDebounceMsForPath(`image.${extension}`)).toBe(120);
      expect(
        selectionPreviewDebounceMsForPath(`IMAGE.${extension.toUpperCase()}`),
      ).toBe(120);
    });
  }

  it("keeps the default debounce for non-image text paths", () => {
    expect(selectionPreviewDebounceMsForPath("notes.xml")).toBe(500);
  });

  it("uses the fast debounce for TSV paths", () => {
    expect(selectionPreviewDebounceMsForPath("data.tsv")).toBe(120);
    expect(selectionPreviewDebounceMsForPath("DATA.TAB")).toBe(120);
  });
});

function textPreview(
  overrides: Partial<Extract<FilePreview, { kind: "text" }>> = {},
): Extract<FilePreview, { kind: "text" }> {
  return {
    kind: "text",
    path: "/workspace/data.json",
    file_name: "data.json",
    mime_type: "application/json",
    file_type: "JSON",
    html: '<section class="file-preview file-preview--text"><pre>{"a":1}</pre></section>',
    size_bytes: 8,
    last_modified: "now",
    structured_format: null,
    formatted_html: null,
    format_notice: null,
    ...overrides,
  };
}

function csvPreview(
  overrides: Partial<Extract<FilePreview, { kind: "csv" }>> = {},
): Extract<FilePreview, { kind: "csv" }> {
  return {
    kind: "csv",
    path: "/workspace/data.csv",
    file_name: "data.csv",
    mime_type: "text/csv",
    raw_html:
      '<section class="file-preview file-preview--text"><pre>a,b</pre></section>',
    rows: [["a", "b"]],
    column_count: 2,
    displayed_row_count: 1,
    total_row_count: 1,
    row_count_status: "complete",
    truncated: false,
    formatted_available: true,
    parse_error: null,
    first_row_as_header: false,
    size_bytes: 8,
    last_modified: "now",
    ...overrides,
  };
}

describe("isStructuredTextPreview", () => {
  it("is true only for text previews with a non-null structured_format", () => {
    expect(
      isStructuredTextPreview(textPreview({ structured_format: "json" })),
    ).toBe(true);
    expect(
      isStructuredTextPreview(textPreview({ structured_format: "html" })),
    ).toBe(true);
    expect(isStructuredTextPreview(textPreview())).toBe(false);
    expect(isStructuredTextPreview(csvPreview())).toBe(false);
    expect(isStructuredTextPreview(null)).toBe(false);
  });

  it("recognizes an HTML structured preview fixture", () => {
    const htmlPreview = textPreview({
      path: "/workspace/page.html",
      file_name: "page.html",
      mime_type: "text/html",
      file_type: "HTML",
      structured_format: "html",
      formatted_html: "<pre>&lt;html&gt;\n  &lt;body/&gt;\n&lt;/html&gt;</pre>",
    });
    expect(isStructuredTextPreview(htmlPreview)).toBe(true);
    expect(isHtmlStructuredPreview(htmlPreview)).toBe(true);
    if (isStructuredTextPreview(htmlPreview)) {
      expect(structuredDataFormatLabel(htmlPreview.structured_format)).toBe(
        "HTML",
      );
    }
  });

  it("recognizes a JavaScript/TypeScript structured preview fixture", () => {
    const jsPreview = textPreview({
      path: "/workspace/app.tsx",
      file_name: "app.tsx",
      mime_type: "text/javascript",
      file_type: "TSX",
      structured_format: "javascript",
      formatted_html: "<pre>const x = 1;</pre>",
    });
    expect(isStructuredTextPreview(jsPreview)).toBe(true);
    expect(isHtmlStructuredPreview(jsPreview)).toBe(false);
    if (isStructuredTextPreview(jsPreview)) {
      expect(
        structuredDataFormatLabel(jsPreview.structured_format, jsPreview.path),
      ).toBe("TypeScript");
    }
  });
});

describe("isHtmlStructuredPreview", () => {
  it("is true only for structured HTML previews", () => {
    expect(
      isHtmlStructuredPreview(textPreview({ structured_format: "html" })),
    ).toBe(true);
    expect(
      isHtmlStructuredPreview(textPreview({ structured_format: "json" })),
    ).toBe(false);
    expect(isHtmlStructuredPreview(textPreview())).toBe(false);
    expect(isHtmlStructuredPreview(null)).toBe(false);
  });
});

describe("structuredDataFormatLabel", () => {
  it("labels each structured data family", () => {
    expect(structuredDataFormatLabel("json")).toBe("JSON");
    expect(structuredDataFormatLabel("json_lines")).toBe("JSON Lines");
    expect(structuredDataFormatLabel("xml")).toBe("XML");
    expect(structuredDataFormatLabel("html")).toBe("HTML");
    expect(structuredDataFormatLabel("css")).toBe("CSS");
  });

  it("labels javascript as TypeScript for ts/mts/cts/tsx paths, else JavaScript", () => {
    expect(structuredDataFormatLabel("javascript", "/tmp/app.ts")).toBe(
      "TypeScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/app.mts")).toBe(
      "TypeScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/app.cts")).toBe(
      "TypeScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/app.tsx")).toBe(
      "TypeScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/app.js")).toBe(
      "JavaScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/app.mjs")).toBe(
      "JavaScript",
    );
    expect(structuredDataFormatLabel("javascript", "/tmp/APP.TS")).toBe(
      "TypeScript",
    );
    expect(structuredDataFormatLabel("javascript")).toBe("JavaScript");
  });
});

describe("previewHtml structured data mode", () => {
  it("renders the raw html for a structured preview unless formatted mode is selected and available", () => {
    const preview = textPreview({
      structured_format: "json",
      html: "<pre>raw</pre>",
      formatted_html: "<pre>formatted</pre>",
    });

    expect(previewHtml(preview)).toBe("<pre>raw</pre>");
    expect(previewHtml(preview, "raw")).toBe("<pre>raw</pre>");
    expect(previewHtml(preview, "formatted")).toBe("<pre>formatted</pre>");
  });

  it("falls back to the raw html when formatted output is unavailable", () => {
    const preview = textPreview({
      structured_format: "json",
      html: "<pre>raw</pre>",
      formatted_html: null,
    });

    expect(previewHtml(preview, "formatted")).toBe("<pre>raw</pre>");
  });

  it("ignores the structured data mode for non-structured previews", () => {
    const preview = textPreview({
      structured_format: null,
      html: "<pre>plain</pre>",
    });
    expect(previewHtml(preview, "formatted")).toBe("<pre>plain</pre>");
  });
});

describe("previewSubtitle TSV labeling", () => {
  it("reports TSV for tab-separated MIME types and CSV otherwise", () => {
    expect(
      previewSubtitle(
        csvPreview({ mime_type: "text/tab-separated-values", size_bytes: 16 }),
      ),
    ).toBe("File type: TSV | File size: 16 B");
    expect(previewSubtitle(csvPreview({ size_bytes: 16 }))).toBe(
      "File type: CSV | File size: 16 B",
    );
  });
});

describe("structured data presentation mode persistence", () => {
  function memoryStorage(): {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  } {
    const store = new Map<string, string>();
    return {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    };
  }

  it("defaults to formatted when nothing is persisted or storage is unavailable", () => {
    expect(restoreStructuredDataPresentationMode(null)).toBe("formatted");
    expect(restoreStructuredDataPresentationMode(memoryStorage())).toBe(
      "formatted",
    );
  });

  it("round-trips a persisted raw preference", () => {
    const storage = memoryStorage();
    persistStructuredDataPresentationMode(storage, "raw");
    expect(storage.getItem(STRUCTURED_DATA_PRESENTATION_MODE_STORAGE_KEY)).toBe(
      "raw",
    );
    expect(restoreStructuredDataPresentationMode(storage)).toBe("raw");
  });

  it("silently ignores a null storage on persist", () => {
    expect(() =>
      persistStructuredDataPresentationMode(null, "raw"),
    ).not.toThrow();
  });
});

describe("HTML presentation mode persistence", () => {
  function memoryStorage(): {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  } {
    const store = new Map<string, string>();
    return {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    };
  }

  it("defaults to raw when nothing is persisted or storage is unavailable", () => {
    expect(restoreHtmlPresentationMode(null)).toBe("raw");
    expect(restoreHtmlPresentationMode(memoryStorage())).toBe("raw");
  });

  it("round-trips a persisted preview preference", () => {
    const storage = memoryStorage();
    persistHtmlPresentationMode(storage, "preview");
    expect(storage.getItem(HTML_PRESENTATION_MODE_STORAGE_KEY)).toBe("preview");
    expect(restoreHtmlPresentationMode(storage)).toBe("preview");
    persistHtmlPresentationMode(storage, "raw");
    expect(restoreHtmlPresentationMode(storage)).toBe("raw");
  });

  it("silently ignores a null storage on persist", () => {
    expect(() => persistHtmlPresentationMode(null, "preview")).not.toThrow();
  });
});

describe("syntax highlighting preference persistence", () => {
  function memoryStorage(): {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  } {
    const store = new Map<string, string>();
    return {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    };
  }

  it("defaults to enabled when nothing is persisted or storage is unavailable", () => {
    expect(restoreSyntaxHighlightingEnabled(null)).toBe(true);
    expect(restoreSyntaxHighlightingEnabled(memoryStorage())).toBe(true);
  });

  it("round-trips a persisted off preference", () => {
    const storage = memoryStorage();
    persistSyntaxHighlightingEnabled(storage, false);
    expect(storage.getItem(SYNTAX_HIGHLIGHTING_ENABLED_STORAGE_KEY)).toBe(
      "off",
    );
    expect(restoreSyntaxHighlightingEnabled(storage)).toBe(false);
    persistSyntaxHighlightingEnabled(storage, true);
    expect(restoreSyntaxHighlightingEnabled(storage)).toBe(true);
  });

  it("silently ignores a null storage on persist", () => {
    expect(() => persistSyntaxHighlightingEnabled(null, false)).not.toThrow();
  });
});
