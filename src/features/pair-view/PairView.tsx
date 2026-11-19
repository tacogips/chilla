import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import {
  openFilePreview,
  type FileOpenOptions,
  type FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
import type { PreviewLinkNavigation } from "../preview/previewLinks";
import { WorkspaceDocumentColumn } from "../workspace/WorkspaceDocumentColumn";
import { EyeGlyph, EyeOffGlyph } from "../workspace/workspaceGlyphs";
import {
  canHidePairPane,
  hidePairPane,
  isPairPaneVisible,
  showPairPane,
  type PairPaneSide,
  type PairPaneVisibility,
} from "./pairPaneVisibility";
import "./PairView.css";

export interface PairViewProps {
  readonly leftPath: string;
  readonly rightPath: string;
  readonly visibility: PairPaneVisibility;
  readonly onChangeVisibility: (next: PairPaneVisibility) => void;
  readonly colorScheme: ColorScheme;
  readonly fileOpenOptions: FileOpenOptions;
  readonly localResourceGeneration?: number;
  readonly loadPreview?: (
    path: string,
    options: FileOpenOptions,
  ) => Promise<FilePreview>;
  readonly onNavigateLink?: (
    side: PairPaneSide,
    request: PreviewLinkNavigation,
  ) => void;
  readonly onReloadReady?: (reload: (() => Promise<void>) | null) => void;
}

export function PairView(props: PairViewProps): JSX.Element {
  const [leftPreview, setLeftPreview] = createSignal<FilePreview | null>(null);
  const [rightPreview, setRightPreview] = createSignal<FilePreview | null>(
    null,
  );
  const [leftError, setLeftError] = createSignal("");
  const [rightError, setRightError] = createSignal("");
  const [leftLoading, setLeftLoading] = createSignal(false);
  const [rightLoading, setRightLoading] = createSignal(false);
  const requests = { left: 0, right: 0 };
  let disposed = false;

  async function load(side: PairPaneSide): Promise<void> {
    const request = ++requests[side];
    const path = side === "left" ? props.leftPath : props.rightPath;
    const setPreview = side === "left" ? setLeftPreview : setRightPreview;
    const setError = side === "left" ? setLeftError : setRightError;
    const setLoading = side === "left" ? setLeftLoading : setRightLoading;
    setLoading(true);
    setError("");
    try {
      const preview = await (props.loadPreview ?? openFilePreview)(
        path,
        props.fileOpenOptions,
      );
      if (!disposed && requests[side] === request) setPreview(preview);
    } catch (error: unknown) {
      if (!disposed && requests[side] === request) {
        setPreview(null);
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!disposed && requests[side] === request) setLoading(false);
    }
  }
  async function reload(): Promise<void> {
    await Promise.all([load("left"), load("right")]);
  }
  onMount(() => {
    props.onReloadReady?.(reload);
  });
  createEffect(
    on(
      () => props.leftPath,
      () => void load("left"),
    ),
  );
  createEffect(
    on(
      () => props.rightPath,
      () => void load("right"),
    ),
  );
  onCleanup(() => {
    disposed = true;
    props.onReloadReady?.(null);
  });

  function pane(side: PairPaneSide): JSX.Element {
    const path = () => (side === "left" ? props.leftPath : props.rightPath);
    const preview = () => (side === "left" ? leftPreview() : rightPreview());
    const error = () => (side === "left" ? leftError() : rightError());
    const loading = () => (side === "left" ? leftLoading() : rightLoading());
    const visible = () => isPairPaneVisible(props.visibility, side);
    const csv = () => {
      const value = preview();
      return value?.kind === "csv" ? value : null;
    };
    const epubToc = () => {
      const value = preview();
      return value?.kind === "epub" ? value.toc : [];
    };
    return (
      <div class="pair-view__slot">
        <section
          class="pair-view__pane"
          data-pair-pane={side}
          hidden={!visible()}
        >
          <header class="pair-view__header">
            <button
              type="button"
              class="pair-view__button"
              aria-label={`Hide ${side} pane`}
              aria-pressed="true"
              aria-disabled={!canHidePairPane(props.visibility, side)}
              title={
                canHidePairPane(props.visibility, side)
                  ? `Hide ${side} pane`
                  : "Cannot hide the only visible pane"
              }
              onClick={() =>
                props.onChangeVisibility(hidePairPane(props.visibility, side))
              }
            >
              <EyeGlyph />
            </button>
            <span class="pair-view__name" title={path()}>
              {path().split(/[\\/]/).pop()}
            </span>
          </header>
          <Show when={loading()}>
            <span>Loading...</span>
          </Show>
          <Show when={error()}>
            <div role="alert" class="pair-view__error">
              {error()}
            </div>
          </Show>
          <WorkspaceDocumentColumn
            colorScheme={props.colorScheme}
            markdownDoc={null}
            markdownPane="preview"
            markdownEditorBuffer=""
            markdownIsDirty={false}
            selection={{ anchorId: null, lineStart: null }}
            filePreview={preview()}
            epubToc={epubToc()}
            csvPreview={csv()}
            csvFirstRowAsHeader={csv()?.first_row_as_header ?? false}
            csvPaneMode={csv()?.formatted_available ? "formatted" : "raw"}
            structuredDataMode="formatted"
            htmlPresentationMode="raw"
            videoAutoplayRequestId={0}
            {...(props.localResourceGeneration === undefined
              ? {}
              : { localResourceGeneration: props.localResourceGeneration })}
            hasOpenDocument={preview() !== null || loading() || error() !== ""}
            onNavigateLink={(request) => props.onNavigateLink?.(side, request)}
            onMarkdownEditorInput={() => {}}
            onCsvFirstRowAsHeaderChange={() => {}}
            onRelocateEpub={() => {}}
          />
        </section>
        <Show when={!visible()}>
          <div class="pair-view__restore" data-pair-restore={side}>
            <button
              type="button"
              class="pair-view__button"
              aria-label={`Show ${side} pane`}
              aria-pressed="false"
              title={`Show ${side} pane`}
              onClick={() =>
                props.onChangeVisibility(showPairPane(props.visibility, side))
              }
            >
              <EyeOffGlyph />
            </button>
          </div>
        </Show>
      </div>
    );
  }
  return (
    <div
      data-testid="pair-view"
      classList={{
        "pair-view": true,
        "pair-view--left-hidden": props.visibility === "right_only",
        "pair-view--right-hidden": props.visibility === "left_only",
      }}
    >
      {pane("left")}
      {pane("right")}
    </div>
  );
}
