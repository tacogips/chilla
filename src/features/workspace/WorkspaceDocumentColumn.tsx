import { Show, createMemo } from "solid-js";
import type {
  DocumentPresentationMode,
  DocumentSnapshot,
  EpubNavigationItem,
  FilePreview,
} from "../../lib/tauri/document";
import type { ColorScheme } from "../../lib/theme";
import { CsvFilePreviewPane } from "../preview/CsvFilePreviewPane";
import { EpubPreviewPane } from "../preview/EpubPreviewPane";
import { HtmlRenderedPreviewPane } from "../preview/HtmlRenderedPreviewPane";
import { MediaFilePreviewPane } from "../preview/MediaFilePreviewPane";
import { PdfFilePreviewPane } from "../preview/PdfFilePreviewPane";
import { PreviewPane } from "../preview/PreviewPane";
import type { WorkspaceSelection } from "./state";
import type { HtmlPresentationMode } from "./workspacePreviewModel";
import {
  inferPreviewKind,
  isMediaFilePreview,
  mediaPreviewKind,
  mediaStreamUrl,
  previewHtml,
  previewPath,
  previewSubtitle,
} from "./workspacePreviewModel";
import { ShortcutSectionList } from "./workspaceShortcuts";

const EMPTY_STATE_IMAGE_PATH = "/empty-state-cat.png";

type MarkdownPane = "raw" | "preview";
type CsvPreview = Extract<FilePreview, { readonly kind: "csv" }>;

interface WorkspaceDocumentColumnProps {
  readonly colorScheme: ColorScheme;
  readonly markdownDoc: DocumentSnapshot | null;
  readonly markdownPane: MarkdownPane;
  readonly markdownEditorBuffer: string;
  readonly markdownIsDirty: boolean;
  readonly selection: WorkspaceSelection;
  readonly filePreview: FilePreview | null;
  readonly epubToc: readonly EpubNavigationItem[];
  readonly csvPreview: CsvPreview | null;
  readonly csvFirstRowAsHeader: boolean;
  readonly csvPaneMode: DocumentPresentationMode;
  readonly structuredDataMode: DocumentPresentationMode;
  readonly htmlPresentationMode: HtmlPresentationMode;
  readonly videoAutoplayRequestId: number;
  readonly localResourceGeneration?: number;
  readonly hasOpenDocument: boolean;
  readonly onMarkdownEditorInput: (value: string) => void;
  readonly onCsvFirstRowAsHeaderChange: (value: boolean) => void;
  readonly onRelocateEpub: (anchorId: string | null) => void;
}

export function WorkspaceDocumentColumn(props: WorkspaceDocumentColumnProps) {
  const pdfPreview = createMemo(() =>
    props.markdownDoc === null && inferPreviewKind(props.filePreview) === "pdf"
      ? props.filePreview
      : null,
  );
  const mediaPreview = createMemo(() =>
    props.markdownDoc === null && isMediaFilePreview(props.filePreview)
      ? props.filePreview
      : null,
  );
  const mediaKind = createMemo(() => mediaPreviewKind(mediaPreview()));
  const htmlRenderedPreview = createMemo(() => {
    const preview = props.filePreview;
    return props.markdownDoc === null &&
      preview?.kind === "text" &&
      preview.structured_format === "html" &&
      props.htmlPresentationMode === "preview"
      ? preview
      : null;
  });

  return (
    <div class="workspace__document-column" tabIndex={-1}>
      <Show when={props.markdownDoc !== null && props.markdownPane === "raw"}>
        <section class="pane workspace__markdown-raw-pane">
          <header class="pane__header">
            <span class="pane__title">Markdown</span>
            <span>Source (editable)</span>
          </header>
          <div class="pane__body markdown-raw-body">
            <textarea
              class="markdown-source-editor"
              spellcheck={false}
              value={props.markdownEditorBuffer}
              onInput={(event) =>
                props.onMarkdownEditorInput(event.currentTarget.value)
              }
            />
          </div>
        </section>
      </Show>

      <Show
        when={props.markdownDoc !== null && props.markdownPane === "preview"}
      >
        <PreviewPane
          colorScheme={props.colorScheme}
          documentPath={props.markdownDoc?.path ?? null}
          fileName={props.markdownDoc?.file_name ?? ""}
          html={props.markdownDoc?.html ?? ""}
          localResourceGeneration={props.localResourceGeneration}
          selectedAnchorId={props.selection.anchorId}
          {...(props.markdownIsDirty
            ? {
                subtitle: "Unsaved changes; preview shows last saved content.",
              }
            : {})}
          visible={true}
        />
      </Show>

      <Show
        when={
          props.markdownDoc === null &&
          props.filePreview !== null &&
          props.filePreview.kind === "epub"
        }
      >
        <EpubPreviewPane
          colorScheme={props.colorScheme}
          documentPath={previewPath(props.filePreview)}
          fileName={props.filePreview?.file_name ?? ""}
          html={previewHtml(props.filePreview)}
          onRelocate={props.onRelocateEpub}
          selectedAnchorId={props.selection.anchorId}
          subtitle={previewSubtitle(props.filePreview)}
          toc={props.epubToc}
          visible={true}
        />
      </Show>

      <Show when={props.csvPreview}>
        {(getCsv) => (
          <CsvFilePreviewPane
            colorScheme={props.colorScheme}
            firstRowAsHeader={props.csvFirstRowAsHeader}
            onFirstRowAsHeaderChange={props.onCsvFirstRowAsHeaderChange}
            presentationMode={props.csvPaneMode}
            preview={getCsv()}
            subtitle={previewSubtitle(props.filePreview)}
          />
        )}
      </Show>

      <Show
        when={
          props.markdownDoc === null &&
          props.filePreview !== null &&
          inferPreviewKind(props.filePreview) === "default" &&
          props.filePreview.kind !== "epub" &&
          props.filePreview.kind !== "csv" &&
          htmlRenderedPreview() === null
        }
      >
        <PreviewPane
          colorScheme={props.colorScheme}
          documentPath={previewPath(props.filePreview)}
          fileName={props.filePreview?.file_name ?? ""}
          dragPanEnabled={props.filePreview?.kind === "image"}
          layout={props.filePreview?.kind === "text" ? "source" : "rendered"}
          html={previewHtml(props.filePreview, props.structuredDataMode)}
          imageRevision={
            props.filePreview?.kind === "image"
              ? props.filePreview.last_modified
              : undefined
          }
          localResourceGeneration={props.localResourceGeneration}
          selectedAnchorId={null}
          subtitle={previewSubtitle(props.filePreview)}
          visible={true}
        />
      </Show>

      <Show when={htmlRenderedPreview()}>
        {(getPreview) => {
          const preview = getPreview();
          return (
            <HtmlRenderedPreviewPane
              path={preview.path}
              fileName={preview.file_name}
              revision={preview.last_modified}
              localResourceGeneration={props.localResourceGeneration}
            />
          );
        }}
      </Show>

      <Show when={pdfPreview()}>
        <PdfFilePreviewPane
          path={pdfPreview()?.path ?? ""}
          fileName={pdfPreview()?.file_name ?? ""}
          revision={pdfPreview()?.last_modified ?? ""}
          localResourceGeneration={props.localResourceGeneration}
        />
      </Show>

      <Show when={mediaPreview() !== null && mediaKind() !== null}>
        <MediaFilePreviewPane
          kind={mediaKind() ?? "audio"}
          path={mediaPreview()?.path ?? ""}
          streamUrl={mediaStreamUrl(props.filePreview)}
          localResourceGeneration={props.localResourceGeneration}
          fileName={mediaPreview()?.file_name ?? ""}
          autoplayRequestId={
            mediaKind() === "video" ? props.videoAutoplayRequestId : 0
          }
        />
      </Show>

      <Show when={!props.hasOpenDocument}>
        <section class="pane workspace__document-empty">
          <header class="pane__header">
            <span class="pane__title">Viewer</span>
            <span>No file open</span>
          </header>
          <div class="pane__body preview">
            <div class="preview__content">
              <section class="file-preview-empty">
                <p class="file-preview-empty__app-name">chilla</p>
                <p class="file-preview-empty__app-tagline">file viewer</p>
                <img
                  class="file-preview-empty__image"
                  src={EMPTY_STATE_IMAGE_PATH}
                  alt="Pixel-art cat peeking in from the side"
                />
                <p class="file-preview-empty__title">Please select a file.</p>
                <div class="file-preview-empty__shortcuts">
                  <ShortcutSectionList />
                </div>
              </section>
            </div>
          </div>
        </section>
      </Show>
    </div>
  );
}
