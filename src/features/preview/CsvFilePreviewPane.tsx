import { For, Match, Show, Switch } from "solid-js";
import type {
  DocumentPresentationMode,
  FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
import { PreviewHeader } from "./PreviewHeader";
import { PreviewPane, previewThemeStyle } from "./PreviewPane";

type CsvPreviewModel = Extract<FilePreview, { kind: "csv" }>;

function padCsvRow(
  row: readonly string[],
  columnCount: number,
): readonly string[] {
  if (columnCount <= 0) {
    return [];
  }

  const out = row.slice(0, columnCount);
  if (out.length === columnCount) {
    return out;
  }

  return [
    ...out,
    ...Array.from({ length: columnCount - out.length }, () => ""),
  ];
}

interface CsvFilePreviewPaneProps {
  readonly preview: CsvPreviewModel;
  readonly presentationMode: DocumentPresentationMode;
  readonly colorScheme: ColorScheme;
  readonly subtitle: string;
  readonly firstRowAsHeader: boolean;
  readonly onFirstRowAsHeaderChange: (value: boolean) => void;
}

export function CsvFilePreviewPane(props: CsvFilePreviewPaneProps) {
  return (
    <Switch>
      <Match when={props.presentationMode === "raw"}>
        <PreviewPane
          colorScheme={props.colorScheme}
          documentPath={null}
          fileName={props.preview.file_name}
          html={props.preview.raw_html}
          layout="source"
          selectedAnchorId={null}
          subtitle={props.subtitle}
          visible={true}
        />
      </Match>

      <Match when={props.presentationMode === "formatted"}>
        <section class="pane">
          <PreviewHeader fileName={props.preview.file_name}>
            <span>Formatted CSV</span>
            <label class="csv-preview-header-option">
              <input
                aria-label="Use first row as header"
                checked={props.firstRowAsHeader}
                disabled={!props.preview.formatted_available}
                onChange={(event) =>
                  props.onFirstRowAsHeaderChange(event.currentTarget.checked)
                }
                type="checkbox"
              />
              <span>Use first row as header</span>
            </label>
          </PreviewHeader>
          <div
            class="pane__body preview"
            style={previewThemeStyle(props.colorScheme)}
          >
            <div
              class="preview__content csv-preview-formatted"
              style={previewThemeStyle(props.colorScheme)}
            >
              <CsvPreviewNotices preview={props.preview} />
              <ShowCsvTable
                firstRowAsHeader={props.firstRowAsHeader}
                preview={props.preview}
              />
            </div>
          </div>
        </section>
      </Match>
    </Switch>
  );
}

function CsvPreviewNotices(props: { readonly preview: CsvPreviewModel }) {
  return (
    <>
      <CsvNotice
        when={!props.preview.formatted_available}
        kind="error"
        text={
          props.preview.parse_error ??
          "Formatted view is unavailable for this file."
        }
      />

      <CsvNotice
        when={props.preview.row_count_status === "truncated"}
        kind="truncate"
        text="Table preview is truncated for performance. Use Raw view for the complete source."
      />
    </>
  );
}

function CsvNotice(props: {
  readonly when: boolean;
  readonly kind: "error" | "truncate";
  readonly text: string;
}) {
  const mod =
    props.kind === "error"
      ? "csv-preview-notice csv-preview-notice--error"
      : "csv-preview-notice csv-preview-notice--truncate";

  return (
    <Show when={props.when}>
      <p class={mod}>{props.text}</p>
    </Show>
  );
}

function ShowCsvTable(props: {
  readonly preview: CsvPreviewModel;
  readonly firstRowAsHeader: boolean;
}) {
  return (
    <Show when={props.preview.formatted_available}>
      <Show
        when={props.preview.rows.length > 0}
        fallback={<p class="csv-preview-empty-state">No CSV records</p>}
      >
        <CsvTable
          firstRowAsHeader={props.firstRowAsHeader}
          preview={props.preview}
        />
        <CsvRowCount
          firstRowAsHeader={props.firstRowAsHeader}
          preview={props.preview}
        />
      </Show>
    </Show>
  );
}

function CsvRowCount(props: {
  readonly preview: CsvPreviewModel;
  readonly firstRowAsHeader: boolean;
}) {
  const headerOffset = () =>
    props.firstRowAsHeader && props.preview.rows.length > 0 ? 1 : 0;
  const dataRows = () => props.preview.rows.length - headerOffset();
  const totalRows = () =>
    props.preview.total_row_count === null
      ? null
      : Math.max(props.preview.total_row_count - headerOffset(), 0);
  const totalText = () =>
    totalRows() === null ? "unknown total" : `${totalRows()} total`;

  return (
    <p class="csv-preview-row-count">
      {dataRows() === 1 ? "1 data row" : `${dataRows()} data rows`} (
      {totalText()})
    </p>
  );
}

function CsvTable(props: {
  readonly preview: CsvPreviewModel;
  readonly firstRowAsHeader: boolean;
}) {
  const cols = () =>
    Array.from(
      { length: Math.max(props.preview.column_count, 0) },
      (_, index) => String(index + 1),
    );
  const headerRow = () =>
    props.firstRowAsHeader && props.preview.rows.length > 0
      ? padCsvRow(props.preview.rows[0] ?? [], props.preview.column_count)
      : null;
  const bodyRows = () =>
    headerRow() === null ? props.preview.rows : props.preview.rows.slice(1);
  const sourceRowOffset = () => (headerRow() === null ? 1 : 2);

  return (
    <div class="csv-preview-scroll">
      <table class="csv-preview-table">
        <thead>
          <tr>
            <th class="csv-preview-table__corner" scope="col" />
            <For each={cols()}>
              {(numericLabel, index) => {
                const sourceLabel = () => headerRow()?.[index()];
                const usesFallback = () =>
                  sourceLabel() === "" || sourceLabel() === undefined;
                const label = () =>
                  usesFallback() ? numericLabel : sourceLabel();
                return (
                  <th
                    aria-label={
                      usesFallback() ? `Column ${numericLabel}` : undefined
                    }
                    class="csv-preview-table__col-head"
                    scope="col"
                  >
                    {label()}
                  </th>
                );
              }}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={bodyRows()}>
            {(row, rowIndex) => (
              <tr>
                <th class="csv-preview-table__row-head" scope="row">
                  {String(rowIndex() + sourceRowOffset())}
                </th>
                <For each={padCsvRow(row, props.preview.column_count)}>
                  {(cell) => (
                    <td class="csv-preview-table__cell">
                      <span class="csv-preview-table__cell-text">{cell}</span>
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      {bodyRows().length === 0 ? (
        <p class="csv-preview-empty-state">No data rows</p>
      ) : null}
    </div>
  );
}
