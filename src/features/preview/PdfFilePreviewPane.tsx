import { convertFileSrc } from "@tauri-apps/api/core";
import { createMemo } from "solid-js";
import { PreviewHeader } from "./PreviewHeader";

interface PdfFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly revision: string;
  readonly localResourceGeneration?: number | undefined;
}

export function PdfFilePreviewPane(props: PdfFilePreviewPaneProps) {
  const pdfSrc = createMemo(() => {
    const url = new URL(convertFileSrc(props.path));
    url.searchParams.set("revision", props.revision);
    if ((props.localResourceGeneration ?? 0) > 0) {
      url.searchParams.set(
        "chilla_refresh",
        String(props.localResourceGeneration),
      );
    }
    return url.toString();
  });

  return (
    <section class="pane">
      <PreviewHeader fileName={props.fileName}>
        <span>PDF</span>
      </PreviewHeader>
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
