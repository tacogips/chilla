import { Show, useContext } from "solid-js";
import { KeymapContextProvider } from "../keymap/KeymapProvider";
import type { KeymapAction } from "../keymap/keymap";
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
  readonly canReloadCurrent: boolean;
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
          title={title("Open files", "files.open", SHORTCUT_LABELS.openFiles)}
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
            title={title("Toggle TOC", "toc.toggle", SHORTCUT_LABELS.toggleToc)}
            onClick={props.onToggleToc}
          >
            <TocGlyph />
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
