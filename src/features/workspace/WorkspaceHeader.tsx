import { Show, useContext } from "solid-js";
import { KeymapContextProvider } from "../keymap/KeymapProvider";
import type { KeymapAction } from "../keymap/keymap";
import type {
  DocumentPresentationMode,
  FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
import {
  structuredDataFormatLabel,
  type HtmlPresentationMode,
  type StructuredTextPreview,
} from "./workspacePreviewModel";
import {
  CloseWindowGlyph,
  FileViewGlyph,
  GitDiffGlyph,
  MaximizeWindowGlyph,
  MinimizeWindowGlyph,
  MoonGlyph,
  OpenFilesGlyph,
  PreviewGlyph,
  RawSourceGlyph,
  ReloadGlyph,
  FormatSourceGlyph,
  SidebarGlyph,
  SunGlyph,
  SyntaxHighlightGlyph,
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
  readonly isFileTreeOpen: boolean;
  readonly onToggleFileTree: () => void;
  readonly markdownOpen: boolean;
  readonly markdownPane: MarkdownPane;
  readonly csvPreview: CsvPreview | null;
  readonly csvPaneMode: DocumentPresentationMode;
  readonly structuredTextPreview: StructuredTextPreview | null;
  readonly structuredDataPresentationMode: DocumentPresentationMode;
  readonly htmlPresentationMode: HtmlPresentationMode;
  readonly hasSourcePreview: boolean;
  readonly syntaxHighlightingEnabled: boolean;
  readonly activeGitDiff: boolean;
  readonly canOpenGitDiff: boolean;
  readonly hasTocDocument: boolean;
  readonly isTocOpen: boolean;
  readonly canReloadCurrent: boolean;
  readonly colorScheme: ColorScheme;
  readonly appWindow: WorkspaceWindowControls | null;
  readonly onSelectMarkdownPane: (pane: MarkdownPane) => void;
  readonly onSelectCsvPaneMode: (mode: DocumentPresentationMode) => void;
  readonly onSelectStructuredDataPresentationMode: (
    mode: DocumentPresentationMode,
  ) => void;
  readonly onSelectHtmlPresentationMode: (mode: HtmlPresentationMode) => void;
  readonly onToggleFormat: () => void;
  readonly onOpenGitDiff: () => void;
  readonly onCloseGitDiff: () => void;
  readonly onOpenFiles: () => void;
  readonly onToggleToc: () => void;
  readonly onToggleSyntaxHighlighting: () => void;
  readonly onReloadCurrent: () => void;
  readonly onCycleColorScheme: () => void;
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const keymap = useContext(KeymapContextProvider);
  const label = (action: KeymapAction, fallback: string): string => {
    if (keymap === undefined) return fallback;
    const display = (key: string) =>
      /^[A-Z]$/.test(key)
        ? `Shift+${key}`
        : key
            .replace(/^<C-/, "Ctrl+")
            .replace(/^<D-/, "Cmd+")
            .replace(/^<S-/, "Shift+")
            .replace(/>$/, "")
            .replace(
              /\+([a-z])$/,
              (_, letter: string) => `+${letter.toUpperCase()}`,
            );
    return keymap
      .keymap()
      .workspace.filter((binding) => binding.actions.includes(action))
      .map((binding) => binding.keys.map(display).join(" then "))
      .join(" / ");
  };
  const title = (
    base: string,
    action: KeymapAction,
    fallback: string,
  ): string => {
    const keys = label(action, fallback);
    return keys === "" ? base : `${base} (${keys})`;
  };
  const presentationTitle = (
    base: string,
    action: "presentation.raw" | "presentation.rendered",
    fallback: string,
  ): string => {
    const primary = label(action, fallback);
    const toggle = label(
      "presentation.toggle",
      SHORTCUT_LABELS.toggleMarkdownPane,
    );
    const keys = [primary, toggle === "" ? "" : `${toggle} toggles`]
      .filter(Boolean)
      .join("; ");
    return keys === "" ? base : `${base} (${keys})`;
  };
  /** Same as {@link presentationTitle}, plus the dedicated format.toggle shortcut. */
  const dataViewPresentationTitle = (
    base: string,
    action: "presentation.raw" | "presentation.rendered",
    fallback: string,
  ): string => {
    const primary = label(action, fallback);
    const togglePresentation = label(
      "presentation.toggle",
      SHORTCUT_LABELS.toggleMarkdownPane,
    );
    const toggleFormat = label("format.toggle", SHORTCUT_LABELS.toggleFormat);
    const toggles = [
      togglePresentation === "" ? "" : `${togglePresentation} toggles`,
      toggleFormat === "" ? "" : `${toggleFormat} toggles format`,
    ].filter((part) => part !== "");
    const keys = [primary, ...toggles].filter((part) => part !== "").join("; ");
    return keys === "" ? base : `${base} (${keys})`;
  };
  return (
    <header class="workspace__header" data-tauri-drag-region="">
      <div class="workspace__actions" data-tauri-drag-region="false">
        <button
          class={`button button--ghost workspace__icon-button${
            props.isFileTreeOpen ? " button--active" : ""
          }`}
          type="button"
          aria-label={
            props.isFileTreeOpen ? "Collapse left pane" : "Expand left pane"
          }
          aria-expanded={props.isFileTreeOpen}
          title={title(
            props.isFileTreeOpen ? "Collapse left pane" : "Expand left pane",
            "sidebar.toggle",
            SHORTCUT_LABELS.toggleFileTree,
          )}
          onClick={props.onToggleFileTree}
        >
          <SidebarGlyph />
        </button>
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
              title={presentationTitle(
                "Raw source",
                "presentation.raw",
                SHORTCUT_LABELS.rawView,
              )}
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
              title={presentationTitle(
                "Preview",
                "presentation.rendered",
                SHORTCUT_LABELS.secondaryView,
              )}
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
                  title={presentationTitle(
                    "Raw",
                    "presentation.raw",
                    SHORTCUT_LABELS.rawView,
                  )}
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
                  title={presentationTitle(
                    "Formatted",
                    "presentation.rendered",
                    SHORTCUT_LABELS.secondaryView,
                  )}
                  onClick={() => props.onSelectCsvPaneMode("formatted")}
                >
                  <PreviewGlyph />
                </button>
              </div>
            );
          }}
        </Show>

        <Show
          when={
            props.structuredTextPreview !== null &&
            props.structuredTextPreview.structured_format !== "html"
              ? props.structuredTextPreview
              : null
          }
        >
          {(getStructuredPreview) => {
            const structuredPreview = getStructuredPreview();
            const formatLabel = () =>
              structuredDataFormatLabel(
                structuredPreview.structured_format,
                structuredPreview.path,
              );
            return (
              <div
                class="workspace__mode-group"
                role="group"
                aria-label="Data view"
              >
                <button
                  class={`workspace__mode${
                    props.structuredDataPresentationMode === "raw"
                      ? " workspace__mode--active"
                      : ""
                  }`}
                  type="button"
                  aria-label={`Raw ${formatLabel()} source`}
                  title={dataViewPresentationTitle(
                    "Raw",
                    "presentation.raw",
                    SHORTCUT_LABELS.rawView,
                  )}
                  onClick={() =>
                    props.onSelectStructuredDataPresentationMode("raw")
                  }
                >
                  <RawSourceGlyph />
                </button>
                <button
                  class={`workspace__mode${
                    props.structuredDataPresentationMode === "formatted"
                      ? " workspace__mode--active"
                      : ""
                  }`}
                  type="button"
                  disabled={structuredPreview.formatted_html === null}
                  aria-label={`Formatted ${formatLabel()}`}
                  title={
                    structuredPreview.formatted_html === null
                      ? (structuredPreview.format_notice ??
                        "Formatted view is unavailable for this file.")
                      : dataViewPresentationTitle(
                          "Formatted",
                          "presentation.rendered",
                          SHORTCUT_LABELS.secondaryView,
                        )
                  }
                  onClick={() =>
                    props.onSelectStructuredDataPresentationMode("formatted")
                  }
                >
                  <PreviewGlyph />
                </button>
              </div>
            );
          }}
        </Show>

        <Show
          when={
            props.structuredTextPreview !== null &&
            props.structuredTextPreview.structured_format === "html"
              ? props.structuredTextPreview
              : null
          }
        >
          {(getHtmlPreview) => {
            const htmlPreview = getHtmlPreview();
            return (
              <>
                <div
                  class="workspace__mode-group"
                  role="group"
                  aria-label="HTML view"
                >
                  <button
                    class={`workspace__mode${
                      props.htmlPresentationMode === "raw"
                        ? " workspace__mode--active"
                        : ""
                    }`}
                    type="button"
                    aria-label="Raw HTML source"
                    title={presentationTitle(
                      "Raw source",
                      "presentation.raw",
                      SHORTCUT_LABELS.rawView,
                    )}
                    onClick={() => props.onSelectHtmlPresentationMode("raw")}
                  >
                    <RawSourceGlyph />
                  </button>
                  <button
                    class={`workspace__mode${
                      props.htmlPresentationMode === "preview"
                        ? " workspace__mode--active"
                        : ""
                    }`}
                    type="button"
                    aria-label="HTML preview"
                    title={presentationTitle(
                      "Preview",
                      "presentation.rendered",
                      SHORTCUT_LABELS.secondaryView,
                    )}
                    onClick={() =>
                      props.onSelectHtmlPresentationMode("preview")
                    }
                  >
                    <PreviewGlyph />
                  </button>
                </div>
                <button
                  class={`button button--ghost workspace__icon-button${
                    props.structuredDataPresentationMode === "formatted"
                      ? " button--active"
                      : ""
                  }`}
                  type="button"
                  disabled={htmlPreview.formatted_html === null}
                  aria-pressed={
                    props.structuredDataPresentationMode === "formatted"
                  }
                  aria-label="Format source"
                  title={
                    htmlPreview.formatted_html === null
                      ? (htmlPreview.format_notice ??
                        "Formatted view is unavailable for this file.")
                      : title(
                          "Format source",
                          "format.toggle",
                          SHORTCUT_LABELS.toggleFormat,
                        )
                  }
                  onClick={props.onToggleFormat}
                >
                  <FormatSourceGlyph />
                </button>
              </>
            );
          }}
        </Show>

        <Show
          when={props.activeGitDiff}
          fallback={
            <Show when={props.canOpenGitDiff}>
              <button
                class="button button--ghost workspace__icon-button"
                type="button"
                aria-label="Open Git diff mode"
                title="Open Git diff mode"
                onClick={props.onOpenGitDiff}
              >
                <GitDiffGlyph />
              </button>
            </Show>
          }
        >
          <button
            class="button button--ghost workspace__icon-button"
            type="button"
            aria-label="Return to file view"
            title="Return to file view"
            onClick={props.onCloseGitDiff}
          >
            <FileViewGlyph />
          </button>
        </Show>

        <button
          class="button workspace__icon-button"
          type="button"
          aria-label="Open one or more files"
          title={title("Open files", "files.open", SHORTCUT_LABELS.openFiles)}
          onClick={props.onOpenFiles}
        >
          <OpenFilesGlyph />
        </button>

        <Show when={props.hasTocDocument}>
          <button
            class={`button button--ghost workspace__icon-button${
              props.isTocOpen ? " button--active" : ""
            }`}
            type="button"
            aria-label="Toggle table of contents"
            title={title("Toggle TOC", "toc.toggle", SHORTCUT_LABELS.toggleToc)}
            onClick={props.onToggleToc}
          >
            <TocGlyph />
          </button>
        </Show>

        <Show when={props.hasSourcePreview}>
          <button
            class={`button button--ghost workspace__icon-button${
              props.syntaxHighlightingEnabled ? " button--active" : ""
            }`}
            type="button"
            aria-pressed={props.syntaxHighlightingEnabled}
            aria-label="Toggle syntax highlighting"
            title={title(
              "Toggle syntax highlighting",
              "syntax.toggle",
              SHORTCUT_LABELS.toggleSyntax,
            )}
            onClick={props.onToggleSyntaxHighlighting}
          >
            <SyntaxHighlightGlyph />
          </button>
        </Show>

        <button
          class="button button--ghost workspace__icon-button"
          type="button"
          disabled={!props.canReloadCurrent}
          aria-label="Refresh workspace"
          title={title(
            "Refresh workspace",
            "document.reload",
            SHORTCUT_LABELS.reload,
          )}
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
              ? title(
                  "Light theme",
                  "theme.toggle",
                  SHORTCUT_LABELS.toggleTheme,
                )
              : title("Dark theme", "theme.toggle", SHORTCUT_LABELS.toggleTheme)
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
