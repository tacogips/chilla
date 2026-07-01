import { Show } from "solid-js";
import type {
  DocumentPresentationMode,
  FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
import {
  CloseWindowGlyph,
  MaximizeWindowGlyph,
  MinimizeWindowGlyph,
  MoonGlyph,
  PreviewGlyph,
  RawSourceGlyph,
  ReloadGlyph,
  SunGlyph,
  TocGlyph,
} from "./workspaceGlyphs";
import { SHORTCUT_LABELS } from "./workspaceShortcuts";

type MarkdownPane = "raw" | "preview";
type CsvPreview = Extract<FilePreview, { readonly kind: "csv" }>;

interface WorkspaceWindowControls {
  readonly minimize: () => Promise<void>;
  readonly toggleMaximize: () => Promise<void>;
  readonly close: () => Promise<void>;
}

interface WorkspaceHeaderProps {
  readonly markdownOpen: boolean;
  readonly markdownPane: MarkdownPane;
  readonly csvPreview: CsvPreview | null;
  readonly csvPaneMode: DocumentPresentationMode;
  readonly activeGitDiff: boolean;
  readonly canOpenGitDiff: boolean;
  readonly hasTocDocument: boolean;
  readonly isTocOpen: boolean;
  readonly hasOpenDocument: boolean;
  readonly colorScheme: ColorScheme;
  readonly appWindow: WorkspaceWindowControls | null;
  readonly onSelectMarkdownPane: (pane: MarkdownPane) => void;
  readonly onSelectCsvPaneMode: (mode: DocumentPresentationMode) => void;
  readonly onOpenGitDiff: () => void;
  readonly onCloseGitDiff: () => void;
  readonly onOpenFiles: () => void;
  readonly onToggleToc: () => void;
  readonly onReloadCurrent: () => void;
  readonly onCycleColorScheme: () => void;
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  return (
    <header class="workspace__header" data-tauri-drag-region="">
      <div class="workspace__actions" data-tauri-drag-region="false">
        <Show when={props.markdownOpen}>
          <div
            class="workspace__mode-group"
            role="group"
            aria-label="Markdown view"
          >
            <button
              class={`workspace__mode${
                props.markdownPane === "raw" ? " workspace__mode--active" : ""
              }`}
              type="button"
              aria-label="Raw Markdown source"
              title={`Raw source (${SHORTCUT_LABELS.rawView}; ${SHORTCUT_LABELS.toggleMarkdownPane} toggles)`}
              onClick={() => props.onSelectMarkdownPane("raw")}
            >
              <RawSourceGlyph />
            </button>
            <button
              class={`workspace__mode${
                props.markdownPane === "preview"
                  ? " workspace__mode--active"
                  : ""
              }`}
              type="button"
              aria-label="Markdown preview"
              title={`Preview (${SHORTCUT_LABELS.secondaryView}; ${SHORTCUT_LABELS.toggleMarkdownPane} toggles)`}
              onClick={() => props.onSelectMarkdownPane("preview")}
            >
              <PreviewGlyph />
            </button>
          </div>
        </Show>

        <Show when={props.csvPreview}>
          {(getCsv) => {
            const csvRow = getCsv();
            return (
              <div
                class="workspace__mode-group"
                role="group"
                aria-label="CSV view"
              >
                <button
                  class={`workspace__mode${
                    props.csvPaneMode === "raw"
                      ? " workspace__mode--active"
                      : ""
                  }`}
                  type="button"
                  aria-label="Raw CSV source"
                  title={`Raw (${SHORTCUT_LABELS.rawView}; ${SHORTCUT_LABELS.toggleMarkdownPane} toggles)`}
                  onClick={() => props.onSelectCsvPaneMode("raw")}
                >
                  <RawSourceGlyph />
                </button>
                <button
                  class={`workspace__mode${
                    props.csvPaneMode === "formatted"
                      ? " workspace__mode--active"
                      : ""
                  }`}
                  type="button"
                  disabled={!csvRow.formatted_available}
                  aria-label="Formatted CSV table"
                  title={`Formatted (${SHORTCUT_LABELS.secondaryView}; ${SHORTCUT_LABELS.toggleMarkdownPane} toggles)`}
                  onClick={() => props.onSelectCsvPaneMode("formatted")}
                >
                  <PreviewGlyph />
                </button>
              </div>
            );
          }}
        </Show>

        <Show
          when={props.activeGitDiff}
          fallback={
            <Show when={props.canOpenGitDiff}>
              <button
                class="button button--ghost"
                type="button"
                aria-label="Open Git diff mode"
                title="Open Git diff mode"
                onClick={props.onOpenGitDiff}
              >
                Git diff
              </button>
            </Show>
          }
        >
          <button
            class="button button--ghost"
            type="button"
            aria-label="Return to file view"
            title="Return to file view"
            onClick={props.onCloseGitDiff}
          >
            File view
          </button>
        </Show>

        <button
          class="button"
          type="button"
          aria-label="Open one or more files"
          title={`Open files (${SHORTCUT_LABELS.openFiles})`}
          onClick={props.onOpenFiles}
        >
          Open files
        </button>

        <Show when={props.hasTocDocument}>
          <button
            class={`button button--ghost workspace__icon-button${
              props.isTocOpen ? " button--active" : ""
            }`}
            type="button"
            aria-label="Toggle table of contents"
            title={`Toggle TOC (${SHORTCUT_LABELS.toggleToc})`}
            onClick={props.onToggleToc}
          >
            <TocGlyph />
          </button>
        </Show>

        <button
          class="button button--ghost workspace__icon-button"
          type="button"
          disabled={!props.hasOpenDocument}
          aria-label="Reload current file"
          title={`Reload file (${SHORTCUT_LABELS.reload})`}
          onClick={props.onReloadCurrent}
        >
          <ReloadGlyph />
        </button>

        <button
          class="workspace__theme-toggle"
          type="button"
          aria-label={
            props.colorScheme === "dark"
              ? "Switch to light theme"
              : "Switch to dark theme"
          }
          title={
            props.colorScheme === "dark"
              ? `Light theme (${SHORTCUT_LABELS.toggleTheme})`
              : `Dark theme (${SHORTCUT_LABELS.toggleTheme})`
          }
          onClick={props.onCycleColorScheme}
        >
          <Show when={props.colorScheme === "dark"} fallback={<MoonGlyph />}>
            <SunGlyph />
          </Show>
        </button>

        <div class="workspace__window-controls" aria-label="Window controls">
          <button
            class="workspace__window-button"
            type="button"
            aria-label="Minimize window"
            title="Minimize"
            onClick={() => {
              void props.appWindow?.minimize();
            }}
          >
            <MinimizeWindowGlyph />
          </button>
          <button
            class="workspace__window-button"
            type="button"
            aria-label="Toggle maximize window"
            title="Maximize"
            onClick={() => {
              void props.appWindow?.toggleMaximize();
            }}
          >
            <MaximizeWindowGlyph />
          </button>
          <button
            class="workspace__window-button workspace__window-button--close"
            type="button"
            aria-label="Close window"
            title="Close"
            onClick={() => {
              void props.appWindow?.close();
            }}
          >
            <CloseWindowGlyph />
          </button>
        </div>
      </div>
    </header>
  );
}
