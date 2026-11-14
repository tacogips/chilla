import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import type { FilePreview } from "../../lib/tauri/document";
import { CsvFilePreviewPane } from "./CsvFilePreviewPane";

function csvFixture(
  overrides: Partial<Extract<FilePreview, { kind: "csv" }>> = {},
) {
  const base: Extract<FilePreview, { kind: "csv" }> = {
    kind: "csv",
    path: "/tmp/sample.csv",
    file_name: "sample.csv",
    mime_type: "text/csv",
    raw_html:
      '<section class="file-preview file-preview--text"><p>x</p><pre>c</pre></section>',
    rows: [
      ["a", "b"],
      ["c,d", "e"],
    ],
    column_count: 2,
    displayed_row_count: 2,
    total_row_count: 2,
    truncated: false,
    formatted_available: true,
    parse_error: null,
    size_bytes: 16,
    last_modified: "now",
    ...overrides,
  };
  return base;
}

describe("CsvFilePreviewPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("renders formatted CSV as a table with numeric labels", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          presentationMode="formatted"
          preview={csvFixture()}
          subtitle="File type: CSV | File size: 16 B"
        />
      ),
      root,
    );

    const corner = root.querySelector(".csv-preview-table__corner");
    expect(corner).not.toBeNull();

    const colHeads = root.querySelectorAll(".csv-preview-table__col-head");
    expect(colHeads.length).toBe(2);
    expect(colHeads[0]?.textContent).toBe("1");
    expect(colHeads[1]?.textContent).toBe("2");

    const rowHeads = root.querySelectorAll(".csv-preview-table__row-head");
    expect(rowHeads.length).toBe(2);
    expect(rowHeads[0]?.textContent).toBe("1");
    expect(rowHeads[1]?.textContent).toBe("2");

    const cells = root.querySelectorAll(".csv-preview-table__cell-text");
    expect(cells.length).toBe(4);
    expect(cells[0]?.textContent).toBe("a");
    expect(cells[1]?.textContent).toBe("b");
    expect(cells[2]?.textContent).toBe("c,d");
    expect(cells[3]?.textContent).toBe("e");
  });

  it("pads ragged rows to column_count", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          presentationMode="formatted"
          preview={csvFixture({
            rows: [["only"]],
            column_count: 3,
            displayed_row_count: 1,
            total_row_count: 1,
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const colHeads = root.querySelectorAll(".csv-preview-table__col-head");
    expect(colHeads.length).toBe(3);

    const cells = root.querySelectorAll(".csv-preview-table__cell-text");
    expect(cells.length).toBe(3);
    expect(cells[0]?.textContent).toBe("only");
    expect(cells[1]?.textContent).toBe("");
    expect(cells[2]?.textContent).toBe("");
  });

  it("shows an error notice when formatted view is unavailable", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          presentationMode="formatted"
          preview={csvFixture({
            rows: [],
            column_count: 0,
            displayed_row_count: 0,
            total_row_count: null,
            formatted_available: false,
            parse_error: "mock parse failure",
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const notice = root.querySelector(".csv-preview-notice--error");
    expect(notice?.textContent).toContain("mock parse failure");
  });

  it("renders raw mode using highlighted HTML wrapper", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          presentationMode="raw"
          preview={csvFixture()}
          subtitle="CSV raw"
        />
      ),
      root,
    );

    expect(root.innerHTML).toContain("file-preview");
    expect(root.innerHTML).toContain("<pre");
  });
});
