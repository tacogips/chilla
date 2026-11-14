import { For, Match, Switch } from "solid-js";
import type {
  DocumentPresentationMode,
  FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
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
}

export function CsvFilePreviewPane(props: CsvFilePreviewPaneProps) {
  return (
    <Switch>
      <Match when={props.presentationMode === "raw"}>
        <PreviewPane
          colorScheme={props.colorScheme}
          documentPath={null}
          html={props.preview.raw_html}
          selectedAnchorId={null}
          subtitle={props.subtitle}
          visible={true}
        />
      </Match>

      <Match when={props.presentationMode === "formatted"}>
        <section class="pane">
          <header class="pane__header">
            <span class="pane__title">Preview</span>
            <span>Formatted CSV</span>
          </header>
          <div
            class="pane__body preview"
            style={previewThemeStyle(props.colorScheme)}
          >
            <div
              class="preview__content csv-preview-formatted"
              style={previewThemeStyle(props.colorScheme)}
            >
              <CsvPreviewNotices preview={props.preview} />
              <CsvTable preview={props.preview} />
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
        when={props.preview.formatted_available && props.preview.truncated}
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
  if (!props.when) {
    return null;
  }

  const mod =
    props.kind === "error"
      ? "csv-preview-notice csv-preview-notice--error"
      : "csv-preview-notice csv-preview-notice--truncate";

  return <p class={mod}>{props.text}</p>;
}

function CsvTable(props: { readonly preview: CsvPreviewModel }) {
  const cols = () =>
    Array.from(
      { length: Math.max(props.preview.column_count, 0) },
      (_, index) => String(index + 1),
    );

  return (
    <div class="csv-preview-scroll">
      <table class="csv-preview-table">
        <thead>
          <tr>
            <th class="csv-preview-table__corner" scope="col" />
            <For each={cols()}>
              {(label) => (
                <th class="csv-preview-table__col-head" scope="col">
                  {label}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.preview.rows}>
            {(row, rowIndex) => (
              <tr>
                <th class="csv-preview-table__row-head" scope="row">
                  {String(rowIndex() + 1)}
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
    </div>
  );
}
