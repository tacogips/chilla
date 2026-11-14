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
import { MediaFilePreviewPane } from "../preview/MediaFilePreviewPane";
import { PdfFilePreviewPane } from "../preview/PdfFilePreviewPane";
import { PreviewPane } from "../preview/PreviewPane";
import type { WorkspaceSelection } from "./state";
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
  readonly csvPaneMode: DocumentPresentationMode;
  readonly videoAutoplayRequestId: number;
  readonly hasOpenDocument: boolean;
  readonly onMarkdownEditorInput: (value: string) => void;
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

  return (
    <div class="workspace__document-column">
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
          props.filePreview.kind !== "csv"
        }
      >
        <PreviewPane
          colorScheme={props.colorScheme}
          documentPath={previewPath(props.filePreview)}
          fileName={props.filePreview?.file_name ?? ""}
          dragPanEnabled={props.filePreview?.kind === "image"}
          html={previewHtml(props.filePreview)}
          selectedAnchorId={null}
          subtitle={previewSubtitle(props.filePreview)}
          visible={true}
        />
      </Show>

      <Show when={pdfPreview()}>
        <PdfFilePreviewPane
          path={pdfPreview()?.path ?? ""}
          fileName={pdfPreview()?.file_name ?? ""}
          revision={pdfPreview()?.last_modified ?? ""}
        />
      </Show>

      <Show when={mediaPreview() !== null && mediaKind() !== null}>
        <MediaFilePreviewPane
          kind={mediaKind() ?? "audio"}
          path={mediaPreview()?.path ?? ""}
          streamUrl={mediaStreamUrl(props.filePreview)}
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
