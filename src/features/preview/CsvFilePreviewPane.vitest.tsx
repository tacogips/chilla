import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { FilePreview } from "../../lib/tauri/document";
import { CsvFilePreviewPane } from "./CsvFilePreviewPane";

function applyCsvTableStyles(root: HTMLElement): void {
  const appStyles = readFileSync("src/app/App.css", "utf8");
  const start = appStyles.indexOf(".csv-preview-table {");
  const end = appStyles.indexOf("\n.file-preview--epub {");
  if (start < 0 || end < 0) throw new Error("missing CSV table styles");

  const style = document.createElement("style");
  style.textContent = appStyles.slice(start, end);
  root.append(style);
}

function csvFixture(
  overrides: Partial<Extract<FilePreview, { kind: "csv" }>> = {},
) {
  const base: Extract<FilePreview, { kind: "csv" }> = {
    kind: "csv",
    path: "/tmp/sample.csv",
    file_name: "sample.csv",
    mime_type: "text/csv",
    raw_html:
      '<section class="file-preview file-preview--text"><pre>c</pre><footer class="file-preview__meta" aria-label="File information">CSV · 16 B</footer></section>',
    rows: [
      ["a", "b"],
      ["c,d", "e"],
    ],
    column_count: 2,
    displayed_row_count: 2,
    total_row_count: 2,
    row_count_status: "complete",
    truncated: false,
    formatted_available: true,
    parse_error: null,
    first_row_as_header: false,
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
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture()}
          subtitle="File type: CSV | File size: 16 B"
        />
      ),
      root,
    );

    const corner = root.querySelector(".csv-preview-table__corner");
    expect(root.querySelector(".preview--source")).toBeNull();
    expect(corner).not.toBeNull();
    expect(root.querySelector(".preview__file-name")?.textContent).toBe(
      "sample.csv",
    );

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
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
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
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({
            rows: [],
            column_count: 0,
            displayed_row_count: 0,
            total_row_count: null,
            row_count_status: "parse_error",
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
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="raw"
          preview={csvFixture()}
          subtitle="CSV raw"
        />
      ),
      root,
    );

    expect(root.innerHTML).toContain("file-preview");
    expect(root.innerHTML).toContain("<pre");
    expect(root.querySelector(".preview--source")).not.toBeNull();
    expect(root.querySelector("pre")?.nextElementSibling?.tagName).toBe(
      "FOOTER",
    );
    expect(root.querySelector(".pane__header")?.textContent).not.toContain(
      "CSV raw",
    );
    expect(root.querySelector(".preview__file-name")?.textContent).toBe(
      "sample.csv",
    );
  });

  it("derives header labels and body gutters through a controlled checkbox", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    const [firstRowAsHeader, setFirstRowAsHeader] = createSignal(false);
    const changes: boolean[] = [];
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={firstRowAsHeader()}
          onFirstRowAsHeaderChange={(value) => {
            changes.push(value);
            setFirstRowAsHeader(value);
          }}
          presentationMode="formatted"
          preview={csvFixture({
            rows: [
              ["name", ""],
              ["Ada", "1"],
            ],
            total_row_count: 4,
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const checkbox = root.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (checkbox === null) throw new Error("missing header checkbox");
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    checkbox.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(changes).toEqual([true]);
    expect(checkbox.checked).toBe(true);
    const colHeads = root.querySelectorAll(".csv-preview-table__col-head");
    expect(colHeads[0]?.textContent).toBe("name");
    expect(colHeads[1]?.textContent).toBe("2");
    expect(colHeads[1]?.getAttribute("aria-label")).toBe("Column 2");
    const rowHeads = root.querySelectorAll(".csv-preview-table__row-head");
    expect(rowHeads).toHaveLength(1);
    expect(rowHeads[0]?.textContent).toBe("2");
    expect(root.querySelector(".csv-preview-row-count")?.textContent).toContain(
      "1 data row (3 total)",
    );
  });

  it("retains duplicate headers and truncation state in header mode", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={true}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({
            rows: [
              ["tag", "tag", ""],
              ["Ada", "Ada", "1"],
              ["Bea", "Bea", "2"],
            ],
            column_count: 3,
            displayed_row_count: 3,
            row_count_status: "truncated",
            total_row_count: 5,
            truncated: true,
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const colHeads = root.querySelectorAll(".csv-preview-table__col-head");
    expect(Array.from(colHeads, (header) => header.textContent)).toEqual([
      "tag",
      "tag",
      "3",
    ]);
    const rowHeads = root.querySelectorAll(".csv-preview-table__row-head");
    expect(Array.from(rowHeads, (header) => header.textContent)).toEqual([
      "2",
      "3",
    ]);
    const cells = root.querySelectorAll(".csv-preview-table__cell-text");
    expect(Array.from(cells, (cell) => cell.textContent)).toEqual([
      "Ada",
      "Ada",
      "1",
      "Bea",
      "Bea",
      "2",
    ]);
    expect(
      root.querySelector(".csv-preview-notice--truncate")?.textContent,
    ).toContain("Table preview is truncated");
    expect(root.querySelector(".csv-preview-row-count")?.textContent).toContain(
      "2 data rows (4 total)",
    );
  });

  it("preserves CSV text and dimensions while handling header-only and empty records", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={true}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({
            rows: [["<b>unsafe</b>", "same", "same", "line\ntwo"]],
            column_count: 5,
            total_row_count: null,
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const colHeads = root.querySelectorAll(".csv-preview-table__col-head");
    expect(colHeads).toHaveLength(5);
    expect(colHeads[0]?.textContent).toBe("<b>unsafe</b>");
    expect(colHeads[3]?.textContent).toBe("line\ntwo");
    expect(colHeads[4]?.textContent).toBe("5");
    expect(root.querySelector("b")).toBeNull();
    expect(root.querySelector(".csv-preview-empty-state")?.textContent).toBe(
      "No data rows",
    );
    expect(root.querySelector(".csv-preview-row-count")?.textContent).toContain(
      "0 data rows (unknown total)",
    );
  });

  it("preserves whitespace and wraps header and cell text", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    applyCsvTableStyles(root);

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={true}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({
            rows: [
              [" Header\nlabel ", "second"],
              [" Cell\nvalue ", "data"],
            ],
          })}
          subtitle="sub"
        />
      ),
      root,
    );

    const header = root.querySelector<HTMLElement>(
      ".csv-preview-table__col-head",
    );
    const cell = root.querySelector<HTMLElement>(
      ".csv-preview-table__cell-text",
    );
    if (header === null || cell === null) throw new Error("missing CSV text");

    expect(header.textContent).toBe(" Header\nlabel ");
    expect(cell.textContent).toBe(" Cell\nvalue ");
    expect(getComputedStyle(header).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(header).overflowWrap).toBe("anywhere");
    expect(getComputedStyle(cell).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(cell).overflowWrap).toBe("anywhere");
  });

  it("keeps empty and unavailable formatted states safe", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={true}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({ rows: [], total_row_count: 0 })}
          subtitle="sub"
        />
      ),
      root,
    );
    expect(root.querySelector(".csv-preview-empty-state")?.textContent).toBe(
      "No CSV records",
    );

    dispose?.();
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={true}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={csvFixture({
            formatted_available: false,
            parse_error: "mock parse failure",
            rows: [["unavailable"]],
          })}
          subtitle="sub"
        />
      ),
      root,
    );
    expect(root.querySelector(".csv-preview-table")).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled,
    ).toBe(true);
  });

  it("updates an empty formatted preview to a populated table", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    const [preview, setPreview] = createSignal(
      csvFixture({ rows: [], total_row_count: 0 }),
    );
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={preview()}
          subtitle="sub"
        />
      ),
      root,
    );

    expect(root.querySelector(".csv-preview-empty-state")?.textContent).toBe(
      "No CSV records",
    );
    setPreview(csvFixture());
    expect(root.querySelectorAll(".csv-preview-table__row-head")).toHaveLength(
      2,
    );
  });

  it("updates a populated formatted preview to an empty state", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    const [preview, setPreview] = createSignal(csvFixture());
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={preview()}
          subtitle="sub"
        />
      ),
      root,
    );

    expect(root.querySelector(".csv-preview-table")).not.toBeNull();
    setPreview(csvFixture({ rows: [], total_row_count: 0 }));
    expect(root.querySelector(".csv-preview-table")).toBeNull();
    expect(root.querySelector(".csv-preview-empty-state")?.textContent).toBe(
      "No CSV records",
    );
  });

  it("updates an available formatted preview to unavailable", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    const [preview, setPreview] = createSignal(csvFixture());
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={preview()}
          subtitle="sub"
        />
      ),
      root,
    );

    setPreview(
      csvFixture({
        formatted_available: false,
        parse_error: "mock parse failure",
        rows: [],
        total_row_count: null,
      }),
    );
    expect(root.querySelector(".csv-preview-table")).toBeNull();
    expect(root.querySelector(".csv-preview-notice--error")?.textContent).toBe(
      "mock parse failure",
    );
    expect(
      root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled,
    ).toBe(true);
  });

  it("updates an unavailable formatted preview to available", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");

    const [preview, setPreview] = createSignal(
      csvFixture({
        formatted_available: false,
        parse_error: "mock parse failure",
        rows: [],
        total_row_count: null,
      }),
    );
    dispose = render(
      () => (
        <CsvFilePreviewPane
          colorScheme="dark"
          firstRowAsHeader={false}
          onFirstRowAsHeaderChange={() => undefined}
          presentationMode="formatted"
          preview={preview()}
          subtitle="sub"
        />
      ),
      root,
    );

    expect(root.querySelector(".csv-preview-table")).toBeNull();
    setPreview(csvFixture());
    expect(root.querySelector(".csv-preview-table")).not.toBeNull();
    expect(root.querySelector(".csv-preview-notice--error")).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled,
    ).toBe(false);
  });
});
