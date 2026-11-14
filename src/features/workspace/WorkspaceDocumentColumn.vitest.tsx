import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { FilePreview } from "../../lib/tauri/document";
import { WorkspaceDocumentColumn } from "./WorkspaceDocumentColumn";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://localhost/${path}`;
  },
}));

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
});

describe("WorkspaceDocumentColumn source mode", () => {
  it("uses source layout for Python and JSON while keeping image layout separate", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const [preview, setPreview] = createSignal<FilePreview>({
      kind: "text",
      path: "/tmp/sample.py",
      file_name: "sample.py",
      mime_type: "text/plain",
      file_type: "Python",
      size_bytes: 5,
      last_modified: "now",
      html: '<section class="file-preview file-preview--text"><pre>value</pre><footer class="file-preview__meta">Python · 5 B</footer></section>',
      structured_format: null,
      formatted_html: null,
      format_notice: null,
    });
    dispose = render(
      () => (
        <WorkspaceDocumentColumn
          colorScheme="dark"
          markdownDoc={null}
          markdownPane="preview"
          markdownEditorBuffer=""
          markdownIsDirty={false}
          selection={{ lineStart: null, anchorId: null }}
          filePreview={preview()}
          epubToc={[]}
          csvPreview={null}
          csvFirstRowAsHeader={false}
          csvPaneMode="raw"
          structuredDataMode="raw"
          htmlPresentationMode="raw"
          videoAutoplayRequestId={0}
          hasOpenDocument={true}
          onMarkdownEditorInput={() => undefined}
          onCsvFirstRowAsHeaderChange={() => undefined}
          onRelocateEpub={() => undefined}
        />
      ),
      root,
    );
    expect(root.querySelector(".preview--source")).not.toBeNull();
    expect(root.querySelector(".preview__file-name")?.textContent).toBe(
      "sample.py",
    );
    setPreview({
      kind: "text",
      path: "/tmp/sample.json",
      file_name: "sample.json",
      mime_type: "application/json",
      file_type: "JSON",
      size_bytes: 2,
      last_modified: "now",
      html: '<section class="file-preview file-preview--text"><pre>{}</pre><footer class="file-preview__meta">JSON · 2 B</footer></section>',
      structured_format: "json",
      formatted_html: null,
      format_notice: null,
    });
    expect(root.querySelector(".preview--source")).not.toBeNull();
    expect(root.querySelector("pre")?.textContent).toBe("{}");
    setPreview({
      kind: "image",
      path: "/tmp/sample.png",
      file_name: "sample.png",
      mime_type: "image/png",
      last_modified: "now",
      html: '<section class="file-preview"><span>image</span></section>',
    });
    expect(root.querySelector(".preview--source")).toBeNull();
    expect(
      root.querySelector(".preview__zoom-surface.markdown-body"),
    ).not.toBeNull();
  });

  it("forwards the controlled CSV header setting without affecting other previews", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const [firstRowAsHeader, setFirstRowAsHeader] = createSignal(false);
    const changes: boolean[] = [];
    const csvPreview: Extract<FilePreview, { kind: "csv" }> = {
      kind: "csv",
      path: "/tmp/sample.csv",
      file_name: "sample.csv",
      mime_type: "text/csv",
      raw_html: "<pre>name</pre>",
      rows: [["name"], ["Ada"]],
      column_count: 1,
      displayed_row_count: 2,
      total_row_count: 2,
      row_count_status: "complete",
      truncated: false,
      formatted_available: true,
      parse_error: null,
      first_row_as_header: false,
      size_bytes: 9,
      last_modified: "now",
    };
    dispose = render(
      () => (
        <WorkspaceDocumentColumn
          colorScheme="dark"
          csvFirstRowAsHeader={firstRowAsHeader()}
          csvPaneMode="formatted"
          csvPreview={csvPreview}
          structuredDataMode="raw"
          htmlPresentationMode="raw"
          epubToc={[]}
          filePreview={csvPreview}
          hasOpenDocument={true}
          markdownDoc={null}
          markdownEditorBuffer=""
          markdownIsDirty={false}
          markdownPane="preview"
          selection={{ lineStart: null, anchorId: null }}
          videoAutoplayRequestId={0}
          onCsvFirstRowAsHeaderChange={(value) => {
            changes.push(value);
            setFirstRowAsHeader(value);
          }}
          onMarkdownEditorInput={() => undefined}
          onRelocateEpub={() => undefined}
        />
      ),
      root,
    );

    const checkbox = root.querySelector<HTMLInputElement>(
      '[aria-label="Use first row as header"]',
    );
    if (checkbox === null) throw new Error("missing CSV header control");
    checkbox.click();
    expect(changes).toEqual([true]);
    expect(checkbox.checked).toBe(true);
  });

  it("renders formatted_html for a structured JSON preview only in formatted mode", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const jsonPreview: Extract<FilePreview, { kind: "text" }> = {
      kind: "text",
      path: "/tmp/sample.json",
      file_name: "sample.json",
      mime_type: "application/json",
      file_type: "JSON",
      size_bytes: 12,
      last_modified: "now",
      html: '<section class="file-preview file-preview--text"><pre>{"a":1}</pre></section>',
      structured_format: "json",
      formatted_html:
        '<section class="file-preview file-preview--text"><pre>{\n  "a": 1\n}</pre></section>',
      format_notice: null,
    };
    const [structuredDataMode, setStructuredDataMode] = createSignal<
      "raw" | "formatted"
    >("raw");
    dispose = render(
      () => (
        <WorkspaceDocumentColumn
          colorScheme="dark"
          markdownDoc={null}
          markdownPane="preview"
          markdownEditorBuffer=""
          markdownIsDirty={false}
          selection={{ lineStart: null, anchorId: null }}
          filePreview={jsonPreview}
          epubToc={[]}
          csvPreview={null}
          csvFirstRowAsHeader={false}
          csvPaneMode="raw"
          structuredDataMode={structuredDataMode()}
          htmlPresentationMode="raw"
          videoAutoplayRequestId={0}
          hasOpenDocument={true}
          onMarkdownEditorInput={() => undefined}
          onCsvFirstRowAsHeaderChange={() => undefined}
          onRelocateEpub={() => undefined}
        />
      ),
      root,
    );

    expect(root.querySelector("pre")?.textContent).toBe('{"a":1}');
    setStructuredDataMode("formatted");
    expect(root.querySelector("pre")?.textContent).toBe('{\n  "a": 1\n}');
  });

  it("renders a sandboxed iframe for HTML previews in preview mode, and source in raw mode", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const htmlPreview: Extract<FilePreview, { kind: "text" }> = {
      kind: "text",
      path: "/tmp/site/index.html",
      file_name: "index.html",
      mime_type: "text/html",
      file_type: "HTML",
      size_bytes: 20,
      last_modified: "now",
      html: '<section class="file-preview file-preview--text"><pre>&lt;html&gt;&lt;/html&gt;</pre></section>',
      structured_format: "html",
      formatted_html: null,
      format_notice: null,
    };
    const [htmlPresentationMode, setHtmlPresentationMode] = createSignal<
      "raw" | "preview"
    >("raw");
    dispose = render(
      () => (
        <WorkspaceDocumentColumn
          colorScheme="dark"
          markdownDoc={null}
          markdownPane="preview"
          markdownEditorBuffer=""
          markdownIsDirty={false}
          selection={{ lineStart: null, anchorId: null }}
          filePreview={htmlPreview}
          epubToc={[]}
          csvPreview={null}
          csvFirstRowAsHeader={false}
          csvPaneMode="raw"
          structuredDataMode="raw"
          htmlPresentationMode={htmlPresentationMode()}
          videoAutoplayRequestId={0}
          hasOpenDocument={true}
          onMarkdownEditorInput={() => undefined}
          onCsvFirstRowAsHeaderChange={() => undefined}
          onRelocateEpub={() => undefined}
        />
      ),
      root,
    );

    expect(root.querySelector(".preview--source")).not.toBeNull();
    expect(root.querySelector("iframe.preview-html-frame")).toBeNull();

    setHtmlPresentationMode("preview");

    const iframe = root.querySelector<HTMLIFrameElement>(
      "iframe.preview-html-frame",
    );
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(root.querySelector(".preview--source")).toBeNull();
  });
});
