import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal, type ComponentProps } from "solid-js";
import { render } from "solid-js/web";
import type { FilePreview } from "../../lib/tauri/document";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { StructuredTextPreview } from "./workspacePreviewModel";

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
});

function headerProps(): ComponentProps<typeof WorkspaceHeader> {
  return {
    isFileTreeOpen: true,
    onToggleFileTree: vi.fn(),
    markdownOpen: false,
    markdownPane: "preview",
    csvPreview: null,
    csvPaneMode: "raw",
    structuredTextPreview: null,
    structuredDataPresentationMode: "raw",
    htmlPresentationMode: "raw",
    hasSourcePreview: false,
    syntaxHighlightingEnabled: true,
    activeGitDiff: false,
    canOpenGitDiff: true,
    hasTocDocument: false,
    isTocOpen: false,
    canReloadCurrent: false,
    colorScheme: "dark",
    appWindow: null,
    onSelectMarkdownPane: vi.fn(),
    onSelectCsvPaneMode: vi.fn(),
    onSelectStructuredDataPresentationMode: vi.fn(),
    onSelectHtmlPresentationMode: vi.fn(),
    onToggleFormat: vi.fn(),
    onOpenGitDiff: vi.fn(),
    onCloseGitDiff: vi.fn(),
    onOpenFiles: vi.fn(),
    onToggleToc: vi.fn(),
    onToggleSyntaxHighlighting: vi.fn(),
    onReloadCurrent: vi.fn(),
    onCycleColorScheme: vi.fn(),
  };
}

function jsonPreview(
  overrides: Partial<Extract<FilePreview, { kind: "text" }>> = {},
): StructuredTextPreview {
  return {
    kind: "text",
    path: "/workspace/data.json",
    file_name: "data.json",
    mime_type: "application/json",
    file_type: "JSON",
    html: '<section class="file-preview file-preview--text"><pre>{"a":1}</pre></section>',
    size_bytes: 8,
    last_modified: "now",
    structured_format: "json",
    formatted_html:
      '<section class="file-preview file-preview--text"><pre>{\n  "a": 1\n}</pre></section>',
    format_notice: null,
    ...overrides,
  } as StructuredTextPreview;
}

function htmlPreview(
  overrides: Partial<Extract<FilePreview, { kind: "text" }>> = {},
): StructuredTextPreview {
  return {
    kind: "text",
    path: "/workspace/index.html",
    file_name: "index.html",
    mime_type: "text/html",
    file_type: "HTML",
    html: '<section class="file-preview file-preview--text"><pre>&lt;html&gt;&lt;/html&gt;</pre></section>',
    size_bytes: 13,
    last_modified: "now",
    structured_format: "html",
    formatted_html:
      '<section class="file-preview file-preview--text"><pre>&lt;html&gt;\n&lt;/html&gt;</pre></section>',
    format_notice: null,
    ...overrides,
  } as StructuredTextPreview;
}

function iconButton(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null) throw new Error(`Missing button: ${label}`);
  expect(button.textContent?.trim()).toBe("");
  expect(button.classList.contains("workspace__icon-button")).toBe(true);
  expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  return button;
}

describe("compact workspace toolbar", () => {
  it("keeps accessible labels, shortcut tooltips and click handlers for icons", () => {
    const props = headerProps();
    dispose = render(() => <WorkspaceHeader {...props} />, document.body);
    const open = iconButton("Open one or more files");
    expect(open.title).toContain("Open files (");
    open.click();
    expect(props.onOpenFiles).toHaveBeenCalledOnce();
    const diff = iconButton("Open Git diff mode");
    expect(diff.title).toBe("Open Git diff mode");
    diff.click();
    expect(props.onOpenGitDiff).toHaveBeenCalledOnce();
  });

  it("shows the return icon in diff mode and respects diff availability", () => {
    const props = headerProps();
    const [active, setActive] = createSignal(true);
    const [available, setAvailable] = createSignal(false);
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          activeGitDiff={active()}
          canOpenGitDiff={available()}
        />
      ),
      document.body,
    );
    const back = iconButton("Return to file view");
    expect(back.title).toBe("Return to file view");
    back.click();
    expect(props.onCloseGitDiff).toHaveBeenCalledOnce();
    expect(
      document.querySelector('[aria-label="Open Git diff mode"]'),
    ).toBeNull();
    setActive(false);
    expect(
      document.querySelector('[aria-label="Return to file view"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Open Git diff mode"]'),
    ).toBeNull();
    setAvailable(true);
    iconButton("Open Git diff mode");
  });
});

describe("structured data view group", () => {
  it("hides the Data view group when there is no structured text preview", () => {
    const props = headerProps();
    dispose = render(() => <WorkspaceHeader {...props} />, document.body);
    expect(document.querySelector('[aria-label="Data view"]')).toBeNull();
  });

  it("hides the Data view group for HTML previews in favor of the HTML view group", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader {...props} structuredTextPreview={htmlPreview()} />
      ),
      document.body,
    );
    expect(document.querySelector('[aria-label="Data view"]')).toBeNull();
    expect(document.querySelector('[aria-label="HTML view"]')).not.toBeNull();
  });

  it("shows format-specific aria-labels and reports clicks for each format", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview()}
          structuredDataPresentationMode="formatted"
        />
      ),
      document.body,
    );

    expect(document.querySelector('[aria-label="Data view"]')).not.toBeNull();
    const raw = document.querySelector<HTMLButtonElement>(
      '[aria-label="Raw JSON source"]',
    );
    const formatted = document.querySelector<HTMLButtonElement>(
      '[aria-label="Formatted JSON"]',
    );
    if (raw === null || formatted === null) {
      throw new Error("missing structured data mode buttons");
    }
    expect(formatted.classList.contains("workspace__mode--active")).toBe(true);
    expect(formatted.disabled).toBe(false);
    raw.click();
    expect(props.onSelectStructuredDataPresentationMode).toHaveBeenCalledWith(
      "raw",
    );
    formatted.click();
    expect(props.onSelectStructuredDataPresentationMode).toHaveBeenCalledWith(
      "formatted",
    );
  });

  it("uses the JSON Lines, XML, CSS, and JS/TS labels for other structured formats", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({
            structured_format: "json_lines",
          })}
        />
      ),
      document.body,
    );
    expect(
      document.querySelector('[aria-label="Raw JSON Lines source"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Formatted JSON Lines"]'),
    ).not.toBeNull();

    dispose?.();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({ structured_format: "xml" })}
        />
      ),
      document.body,
    );
    expect(
      document.querySelector('[aria-label="Raw XML source"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Formatted XML"]'),
    ).not.toBeNull();

    dispose?.();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({
            structured_format: "css",
            path: "/workspace/site.css",
            file_name: "site.css",
          })}
        />
      ),
      document.body,
    );
    expect(
      document.querySelector('[aria-label="Raw CSS source"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Formatted CSS"]'),
    ).not.toBeNull();

    dispose?.();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({
            structured_format: "javascript",
            path: "/workspace/app.js",
            file_name: "app.js",
          })}
        />
      ),
      document.body,
    );
    expect(
      document.querySelector('[aria-label="Raw JavaScript source"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Formatted JavaScript"]'),
    ).not.toBeNull();

    dispose?.();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({
            structured_format: "javascript",
            path: "/workspace/app.tsx",
            file_name: "app.tsx",
          })}
        />
      ),
      document.body,
    );
    expect(
      document.querySelector('[aria-label="Raw TypeScript source"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Formatted TypeScript"]'),
    ).not.toBeNull();
  });

  it("mentions the format.toggle shortcut in the Raw/Formatted button titles", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview()}
          structuredDataPresentationMode="raw"
        />
      ),
      document.body,
    );
    const raw = document.querySelector<HTMLButtonElement>(
      '[aria-label="Raw JSON source"]',
    );
    const formatted = document.querySelector<HTMLButtonElement>(
      '[aria-label="Formatted JSON"]',
    );
    expect(raw?.title).toContain("Shift+F toggles format");
    expect(formatted?.title).toContain("Shift+F toggles format");
    expect(raw?.title).toContain("Shift+P toggles");
  });

  it("disables Formatted and shows the format notice as its title when formatted_html is null", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={jsonPreview({
            formatted_html: null,
            format_notice: "Invalid JSON at line 1, column 3",
          })}
        />
      ),
      document.body,
    );
    const formatted = document.querySelector<HTMLButtonElement>(
      '[aria-label="Formatted JSON"]',
    );
    if (formatted === null) {
      throw new Error("missing Formatted button");
    }
    expect(formatted.disabled).toBe(true);
    expect(formatted.title).toBe("Invalid JSON at line 1, column 3");
  });
});

describe("syntax highlighting toggle", () => {
  it("is hidden when there is no source-like preview active", () => {
    const props = headerProps();
    dispose = render(() => <WorkspaceHeader {...props} />, document.body);
    expect(
      document.querySelector('[aria-label="Toggle syntax highlighting"]'),
    ).toBeNull();
  });

  it("shows aria-pressed reflecting the enabled state and reports clicks", () => {
    const props = headerProps();
    const [enabled, setEnabled] = createSignal(true);
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          hasSourcePreview={true}
          syntaxHighlightingEnabled={enabled()}
        />
      ),
      document.body,
    );
    const button = document.querySelector<HTMLButtonElement>(
      '[aria-label="Toggle syntax highlighting"]',
    );
    if (button === null) {
      throw new Error("missing syntax highlighting toggle button");
    }
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.classList.contains("button--active")).toBe(true);
    button.click();
    expect(props.onToggleSyntaxHighlighting).toHaveBeenCalledOnce();

    setEnabled(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.classList.contains("button--active")).toBe(false);
  });
});

describe("HTML view group", () => {
  it("mirrors Markdown's Raw/Preview aria-labels, titles, and click handlers", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={htmlPreview()}
          htmlPresentationMode="raw"
        />
      ),
      document.body,
    );

    const raw = document.querySelector<HTMLButtonElement>(
      '[aria-label="Raw HTML source"]',
    );
    const preview = document.querySelector<HTMLButtonElement>(
      '[aria-label="HTML preview"]',
    );
    if (raw === null || preview === null) {
      throw new Error("missing HTML view mode buttons");
    }
    expect(raw.classList.contains("workspace__mode--active")).toBe(true);
    expect(preview.classList.contains("workspace__mode--active")).toBe(false);
    expect(raw.title).toContain("Shift+P toggles");
    expect(preview.title).toContain("Shift+P toggles");

    preview.click();
    expect(props.onSelectHtmlPresentationMode).toHaveBeenCalledWith("preview");
    raw.click();
    expect(props.onSelectHtmlPresentationMode).toHaveBeenCalledWith("raw");
  });

  it("shows a Format source toggle with aria-pressed reflecting the format preference", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={htmlPreview()}
          structuredDataPresentationMode="raw"
        />
      ),
      document.body,
    );

    const formatButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Format source"]',
    );
    if (formatButton === null) {
      throw new Error("missing Format source button");
    }
    expect(formatButton.getAttribute("aria-pressed")).toBe("false");
    expect(formatButton.title).toContain("Format source");
    formatButton.click();
    expect(props.onToggleFormat).toHaveBeenCalledOnce();
  });

  it("disables Format source and shows the format notice when formatted_html is null", () => {
    const props = headerProps();
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          structuredTextPreview={htmlPreview({
            formatted_html: null,
            format_notice: "HTML source exceeds the formatting size limit",
          })}
        />
      ),
      document.body,
    );

    const formatButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Format source"]',
    );
    expect(formatButton?.disabled).toBe(true);
    expect(formatButton?.title).toBe(
      "HTML source exceeds the formatting size limit",
    );
  });
});
