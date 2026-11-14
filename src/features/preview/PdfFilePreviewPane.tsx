import { convertFileSrc } from "@tauri-apps/api/core";
import { createMemo } from "solid-js";

interface PdfFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly revision: string;
}

export function PdfFilePreviewPane(props: PdfFilePreviewPaneProps) {
  const pdfSrc = createMemo(() => {
    const url = new URL(convertFileSrc(props.path));
    url.searchParams.set("revision", props.revision);
    return url.toString();
  });

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
