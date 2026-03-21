import { convertFileSrc } from "@tauri-apps/api/core";
import { createMemo } from "solid-js";

interface PdfFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
}

export function PdfFilePreviewPane(props: PdfFilePreviewPaneProps) {
  const pdfSrc = createMemo(() => convertFileSrc(props.path));

  return (
    <section class="pane">
      <header class="pane__header">
        <span class="pane__title">Preview</span>
        <span>PDF</span>
      </header>
      <div class="pane__body preview preview--embedded-pdf">
        <iframe
          class="preview-pdf-frame"
          src={pdfSrc()}
          title={props.fileName}
        />
      </div>
    </section>
  );
}
